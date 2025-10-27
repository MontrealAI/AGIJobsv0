"""Checkpoint persistence for orchestrator runtime state."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .models import OrchestrationPlan, StatusOut

_LOGGER = logging.getLogger(__name__)

_CHECKPOINT_VERSION = "orchestrator.checkpoint.v1"
_DEFAULT_FILE_PATH = Path(os.environ.get("ORCHESTRATOR_CHECKPOINT_PATH", "storage/orchestrator/checkpoint.json"))
_DEFAULT_LEVELDB_PATH = Path(
    os.environ.get("ORCHESTRATOR_CHECKPOINT_LEVELDB", "storage/orchestrator/checkpoint.db")
)
_DEFAULT_S3_PREFIX = os.environ.get("ORCHESTRATOR_CHECKPOINT_PREFIX", "orchestrator/checkpoints")
_DEFAULT_GOVERNANCE_PATH = Path(
    os.environ.get("ORCHESTRATOR_GOVERNANCE_PATH", "storage/orchestrator/governance.json")
)


class CheckpointError(RuntimeError):
    """Base class for checkpoint persistence errors."""


class CheckpointIntegrityError(CheckpointError):
    """Raised when a persisted checkpoint fails integrity verification."""


class CheckpointStoreError(CheckpointError):
    """Raised when a persistence backend encounters an error."""


class GovernanceSettings(BaseModel):
    """Snapshot of governance configuration bundled into checkpoints."""

    model_config = ConfigDict(extra="allow")

    approvals_required: int = 0
    guardian_addresses: List[str] = Field(default_factory=list)
    policy_hash: str = Field(default_factory=lambda: hashlib.sha256(b"{}").hexdigest())
    metadata: Dict[str, object] = Field(default_factory=dict)
    source: Optional[str] = None
    updated_at: float = Field(default_factory=lambda: float(time.time()))

    @classmethod
    def from_metadata(cls, payload: Dict[str, object], *, source: Optional[str] = None) -> "GovernanceSettings":
        canonical = json.dumps(payload or {}, sort_keys=True, ensure_ascii=False).encode("utf-8")
        approvals = payload.get("approvalsRequired") or payload.get("quorum") or 0
        guardians_raw = payload.get("council") or payload.get("guardians") or []
        if isinstance(guardians_raw, str):
            guardians: List[str] = [guardians_raw]
        elif isinstance(guardians_raw, Iterable):
            guardians = [str(entry) for entry in guardians_raw]
        else:
            guardians = []
        return cls(
            approvals_required=int(approvals),
            guardian_addresses=guardians,
            policy_hash=hashlib.sha256(canonical).hexdigest(),
            metadata=payload,
            source=source,
            updated_at=float(payload.get("updated_at") or time.time()),
        )

    @classmethod
    def default(cls) -> "GovernanceSettings":
        return cls(metadata={}, guardian_addresses=[], approvals_required=0)


class ShardState(BaseModel):
    """State of a logical work shard used for routing jobs."""

    shard_id: str
    capacity: int = 0
    health: str = "unknown"
    active_jobs: List[str] = Field(default_factory=list)
    queued_jobs: List[str] = Field(default_factory=list)
    metadata: Dict[str, object] = Field(default_factory=dict)


class NodeAssignment(BaseModel):
    """Assignment of work to a specific agent node."""

    node_id: str
    shard_id: Optional[str] = None
    status: str = "idle"
    active_jobs: List[str] = Field(default_factory=list)
    last_heartbeat: Optional[float] = None
    metadata: Dict[str, object] = Field(default_factory=dict)


class JobCheckpoint(BaseModel):
    """Captured orchestration job state for crash-safe recovery."""

    status: StatusOut
    plan: OrchestrationPlan
    assigned_shard: Optional[str] = None
    assigned_nodes: List[str] = Field(default_factory=list)
    updated_at: float


class Checkpoint(BaseModel):
    """Full checkpoint payload persisted to durable storage."""

    version: str = Field(default=_CHECKPOINT_VERSION)
    sequence: int
    created_at: float
    jobs: Dict[str, JobCheckpoint] = Field(default_factory=dict)
    shards: Dict[str, ShardState] = Field(default_factory=dict)
    nodes: Dict[str, NodeAssignment] = Field(default_factory=dict)
    governance: GovernanceSettings = Field(default_factory=GovernanceSettings.default)
    scoreboard: Dict[str, Dict[str, object]] = Field(default_factory=dict)
    integrity: str

    def compute_integrity(self) -> str:
        payload = self.model_dump(mode="json", exclude={"integrity"})
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def verify(self) -> None:
        expected = self.compute_integrity()
        if not hmac.compare_digest(expected, self.integrity):
            raise CheckpointIntegrityError("Checkpoint integrity mismatch")


class CheckpointStore:
    """Abstract persistence backend for checkpoints."""

    def save(self, checkpoint: Checkpoint) -> None:
        raise NotImplementedError

    def load_latest(self) -> Optional[Checkpoint]:
        raise NotImplementedError


class FileCheckpointStore(CheckpointStore):
    """Persist checkpoints to a single JSON file with atomic swaps."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = (path or _DEFAULT_FILE_PATH).resolve()
        self._lock = threading.Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def save(self, checkpoint: Checkpoint) -> None:
        payload = checkpoint.model_dump(mode="json")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2)
        tmp_path = self._path.with_suffix(".tmp")
        with self._lock:
            tmp_path.write_text(serialized, encoding="utf-8")
            tmp_path.replace(self._path)

    def load_latest(self) -> Optional[Checkpoint]:
        if not self._path.exists():
            return None
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CheckpointStoreError(f"Failed to load checkpoint file: {exc}") from exc
        try:
            return Checkpoint.model_validate(data)
        except ValidationError as exc:  # pragma: no cover - defensive
            raise CheckpointStoreError(f"Invalid checkpoint payload: {exc}") from exc


class LevelDBCheckpointStore(CheckpointStore):
    """Persist checkpoints into a LevelDB key/value database."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = (path or _DEFAULT_LEVELDB_PATH).resolve()
        try:
            import plyvel  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise CheckpointStoreError("plyvel package is required for LevelDB checkpoint store") from exc
        self._db = plyvel.DB(str(self._path), create_if_missing=True)

    def save(self, checkpoint: Checkpoint) -> None:
        key = f"{checkpoint.sequence:020d}".encode("utf-8")
        payload = checkpoint.model_dump(mode="json")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        self._db.put(key, serialized)

    def load_latest(self) -> Optional[Checkpoint]:
        with self._db.iterator(reverse=True) as iterator:
            for _, raw in iterator:
                try:
                    data = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError as exc:
                    raise CheckpointStoreError(f"Corrupted LevelDB checkpoint: {exc}") from exc
                return Checkpoint.model_validate(data)
        return None


class S3CheckpointStore(CheckpointStore):
    """Persist checkpoints in an S3-compatible object store."""

    def __init__(self, bucket: str, prefix: str | None = None) -> None:
        try:
            import boto3  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise CheckpointStoreError("boto3 package is required for S3 checkpoint store") from exc
        self._client = boto3.client("s3")
        self._bucket = bucket
        self._prefix = (prefix or _DEFAULT_S3_PREFIX).rstrip("/")

    def _object_key(self, sequence: int) -> str:
        return f"{self._prefix}/checkpoint-{sequence:020d}.json"

    def save(self, checkpoint: Checkpoint) -> None:
        payload = checkpoint.model_dump(mode="json")
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        key = self._object_key(checkpoint.sequence)
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=serialized.encode("utf-8"),
            ContentType="application/json",
        )
        self._client.put_object(
            Bucket=self._bucket,
            Key=f"{self._prefix}/latest.json",
            Body=json.dumps({"latest": key}).encode("utf-8"),
            ContentType="application/json",
        )

    def load_latest(self) -> Optional[Checkpoint]:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=f"{self._prefix}/latest.json")
        except self._client.exceptions.NoSuchKey:
            return None
        body = response.get("Body")
        if not body:  # pragma: no cover - defensive
            return None
        latest = json.loads(body.read().decode("utf-8")).get("latest")
        if not latest:
            return None
        payload = self._client.get_object(Bucket=self._bucket, Key=latest)
        raw = payload["Body"].read().decode("utf-8")
        data = json.loads(raw)
        return Checkpoint.model_validate(data)


@dataclass
class RestoredJob:
    status: StatusOut
    plan: OrchestrationPlan
    assigned_shard: Optional[str]
    assigned_nodes: List[str]


class CheckpointManager:
    """Coordinate checkpoint snapshots and recovery for orchestrator state."""

    def __init__(
        self,
        *,
        store: CheckpointStore | None = None,
        governance: GovernanceSettings | None = None,
    ) -> None:
        self._store = store or get_checkpoint_store()
        self._governance = governance or load_governance_settings()
        self._shards: Dict[str, ShardState] = {}
        self._nodes: Dict[str, NodeAssignment] = {}
        self._sequence = 0
        self._lock = threading.Lock()
        self._last_snapshot: Optional[Checkpoint] = None

    def update_shard(self, shard: ShardState) -> None:
        with self._lock:
            self._shards[shard.shard_id] = shard.model_copy(deep=True)

    def remove_shard(self, shard_id: str) -> None:
        with self._lock:
            self._shards.pop(shard_id, None)

    def update_node(self, assignment: NodeAssignment) -> None:
        with self._lock:
            self._nodes[assignment.node_id] = assignment.model_copy(deep=True)

    def remove_node(self, node_id: str) -> None:
        with self._lock:
            self._nodes.pop(node_id, None)

    def set_governance(self, governance: GovernanceSettings) -> None:
        with self._lock:
            self._governance = governance

    def governance(self) -> GovernanceSettings:
        with self._lock:
            return self._governance.model_copy(deep=True)

    def shard_states(self) -> Dict[str, ShardState]:
        with self._lock:
            return {key: value.model_copy(deep=True) for key, value in self._shards.items()}

    def node_assignments(self) -> Dict[str, NodeAssignment]:
        with self._lock:
            return {key: value.model_copy(deep=True) for key, value in self._nodes.items()}

    def last_snapshot(self) -> Optional[Checkpoint]:
        with self._lock:
            return self._last_snapshot

    def _resolve_shard(self, job_id: str) -> Optional[str]:
        for shard in self._shards.values():
            if job_id in shard.active_jobs or job_id in shard.queued_jobs:
                return shard.shard_id
        return None

    def _resolve_nodes(self, job_id: str) -> List[str]:
        nodes: List[str] = []
        for assignment in self._nodes.values():
            if job_id in assignment.active_jobs:
                nodes.append(assignment.node_id)
        return nodes

    def snapshot_runtime(
        self,
        runs: Dict[str, StatusOut],
        plans: Dict[str, OrchestrationPlan],
        *,
        scoreboard: Dict[str, Dict[str, object]] | None = None,
    ) -> Checkpoint:
        timestamp = time.time()
        with self._lock:
            self._sequence += 1
            governance = self._governance.model_copy(deep=True)
            shards = {key: value.model_copy(deep=True) for key, value in self._shards.items()}
            nodes = {key: value.model_copy(deep=True) for key, value in self._nodes.items()}
        jobs: Dict[str, JobCheckpoint] = {}
        for run_id, status in runs.items():
            plan = plans.get(run_id)
            if not plan:
                continue
            jobs[run_id] = JobCheckpoint(
                status=status.model_copy(deep=True),
                plan=plan.model_copy(deep=True),
                assigned_shard=self._resolve_shard(run_id),
                assigned_nodes=self._resolve_nodes(run_id),
                updated_at=timestamp,
            )
        checkpoint = Checkpoint(
            sequence=self._sequence,
            created_at=timestamp,
            jobs=jobs,
            shards=shards,
            nodes=nodes,
            governance=governance,
            scoreboard=scoreboard or {},
            integrity="",
        )
        checkpoint.integrity = checkpoint.compute_integrity()
        self._store.save(checkpoint)
        with self._lock:
            self._last_snapshot = checkpoint
        return checkpoint

    def restore_runtime(self) -> Dict[str, RestoredJob]:
        snapshot = self._store.load_latest()
        if not snapshot:
            return {}
        snapshot.verify()
        with self._lock:
            self._sequence = snapshot.sequence
            self._governance = snapshot.governance
            self._shards = {key: value for key, value in snapshot.shards.items()}
            self._nodes = {key: value for key, value in snapshot.nodes.items()}
            self._last_snapshot = snapshot
        restored: Dict[str, RestoredJob] = {}
        for run_id, job in snapshot.jobs.items():
            restored[run_id] = RestoredJob(
                status=job.status.model_copy(deep=True),
                plan=job.plan.model_copy(deep=True),
                assigned_shard=job.assigned_shard,
                assigned_nodes=list(job.assigned_nodes),
            )
        return restored


_CHECKPOINT_STORE_SINGLETON: Optional[CheckpointStore] = None


def load_governance_settings(path: Path | None = None) -> GovernanceSettings:
    resolved = (path or _DEFAULT_GOVERNANCE_PATH).resolve()
    if not resolved.exists():
        return GovernanceSettings.default()
    try:
        payload = json.loads(resolved.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("governance payload must be a dict")
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        _LOGGER.warning("Failed to load governance settings (%s): %s", resolved, exc)
        return GovernanceSettings.default()
    return GovernanceSettings.from_metadata(payload, source=str(resolved))


def get_checkpoint_store() -> CheckpointStore:
    global _CHECKPOINT_STORE_SINGLETON
    if _CHECKPOINT_STORE_SINGLETON is not None:
        return _CHECKPOINT_STORE_SINGLETON
    backend = os.environ.get("ORCHESTRATOR_CHECKPOINT_BACKEND", "file").lower()
    if backend == "leveldb":
        store = LevelDBCheckpointStore()
    elif backend == "s3":
        bucket = os.environ.get("ORCHESTRATOR_CHECKPOINT_BUCKET")
        if not bucket:
            raise CheckpointStoreError("ORCHESTRATOR_CHECKPOINT_BUCKET is required for S3 checkpoint store")
        prefix = os.environ.get("ORCHESTRATOR_CHECKPOINT_PREFIX", _DEFAULT_S3_PREFIX)
        store = S3CheckpointStore(bucket, prefix)
    else:
        path = Path(os.environ.get("ORCHESTRATOR_CHECKPOINT_PATH", str(_DEFAULT_FILE_PATH)))
        store = FileCheckpointStore(path)
    _CHECKPOINT_STORE_SINGLETON = store
    return store


__all__ = [
    "Checkpoint",
    "CheckpointError",
    "CheckpointIntegrityError",
    "CheckpointManager",
    "CheckpointStore",
    "FileCheckpointStore",
    "GovernanceSettings",
    "LevelDBCheckpointStore",
    "NodeAssignment",
    "RestoredJob",
    "S3CheckpointStore",
    "ShardState",
    "get_checkpoint_store",
    "load_governance_settings",
]
