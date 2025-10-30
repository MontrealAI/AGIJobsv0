"""Persistence models for Hierarchical Generative Machine lineage tracking."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from backend.database import Database, get_database

LOGGER = logging.getLogger(__name__)


def _now() -> float:
    return time.time()


def _serialize(metadata: Optional[Dict[str, Any]]) -> str:
    if not metadata:
        return "{}"
    return json.dumps(metadata, ensure_ascii=False, sort_keys=True)


def _deserialize(payload: Any) -> Dict[str, Any]:
    if payload in (None, "", b""):
        return {}
    if isinstance(payload, (bytes, bytearray)):
        payload = payload.decode("utf-8")
    try:
        return json.loads(payload)
    except Exception:  # pragma: no cover - defensive against corrupted rows
        LOGGER.warning("Failed to decode metadata payload", exc_info=True)
        return {}


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in {"true", "1", "yes"}
    return False


@dataclass(slots=True)
class HgmRun:
    run_id: str
    root_agent: str
    metadata: Dict[str, Any]
    created_at: float
    updated_at: float

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["metadata"] = dict(self.metadata)
        return payload


@dataclass(slots=True)
class HgmAgent:
    run_id: str
    agent_key: str
    parent_key: Optional[str]
    depth: int
    metadata: Dict[str, Any]
    expansion_count: float
    clade_success: float
    clade_failure: float
    created_at: float
    updated_at: float


@dataclass(slots=True)
class HgmAgentPerformance:
    run_id: str
    agent_key: str
    visits: float
    success_weight: float
    failure_weight: float
    cmp_mean: float
    cmp_variance: float
    cmp_weight: float
    updated_at: float


@dataclass(slots=True)
class HgmEvaluationOutcome:
    id: int
    run_id: str
    agent_key: str
    reward: float
    weight: float
    success: bool
    payload: Dict[str, Any]
    created_at: float


@dataclass(slots=True)
class LineagePerformance:
    visits: float
    success_weight: float
    failure_weight: float
    cmp_mean: float
    cmp_variance: float
    cmp_weight: float


@dataclass(slots=True)
class LineageNode:
    agent_key: str
    parent_key: Optional[str]
    depth: int
    metadata: Dict[str, Any]
    expansion_count: float
    clade_success: float
    clade_failure: float
    performance: LineagePerformance
    children: List["LineageNode"] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agentKey": self.agent_key,
            "parentKey": self.parent_key,
            "depth": self.depth,
            "metadata": dict(self.metadata),
            "expansionCount": self.expansion_count,
            "cladeSuccess": self.clade_success,
            "cladeFailure": self.clade_failure,
            "performance": asdict(self.performance),
            "children": [child.to_dict() for child in self.children],
        }


class HgmRepository:
    """Repository coordinating persistence for HGM entities."""

    def __init__(self, database: Database | None = None) -> None:
        self._db = database or get_database()

    # ------------------------------------------------------------------
    # Run management
    def ensure_run(self, run_id: str, root_agent: str, metadata: Optional[Dict[str, Any]] = None) -> HgmRun:
        now = _now()
        payload = _serialize(metadata)
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(
                f"""
                INSERT INTO hgm_runs (run_id, root_agent, metadata, created_at, updated_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                ON CONFLICT(run_id) DO UPDATE SET
                    root_agent = excluded.root_agent,
                    metadata = excluded.metadata,
                    updated_at = excluded.updated_at
                """,
                (run_id, root_agent, payload, now, now),
            )
            cur.execute(
                f"SELECT run_id, root_agent, metadata, created_at, updated_at FROM hgm_runs WHERE run_id = {placeholder}",
                (run_id,),
            )
            row = cur.fetchone()
        return self._row_to_run(row)

    def list_runs(self) -> List[HgmRun]:
        with self._db.transaction() as cur:
            cur.execute(
                "SELECT run_id, root_agent, metadata, created_at, updated_at FROM hgm_runs ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
        return [self._row_to_run(row) for row in rows or []]

    def get_run(self, run_id: str) -> Optional[HgmRun]:
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(
                f"SELECT run_id, root_agent, metadata, created_at, updated_at FROM hgm_runs WHERE run_id = {placeholder}",
                (run_id,),
            )
            row = cur.fetchone()
        return self._row_to_run(row) if row else None

    def delete_run(self, run_id: str) -> None:
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(f"DELETE FROM hgm_runs WHERE run_id = {placeholder}", (run_id,))

    # ------------------------------------------------------------------
    # Agent helpers
    def ensure_agent(
        self,
        run_id: str,
        agent_key: str,
        parent_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> HgmAgent:
        now = _now()
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            depth = 0
            if parent_key:
                cur.execute(
                    f"SELECT depth FROM hgm_agents WHERE run_id = {placeholder} AND agent_key = {placeholder}",
                    (run_id, parent_key),
                )
                parent_row = cur.fetchone()
                if parent_row is not None:
                    depth = int(parent_row[0]) + 1
            cur.execute(
                f"SELECT run_id, agent_key, parent_key, depth, metadata, expansion_count, clade_success, clade_failure, created_at, updated_at "
                f"FROM hgm_agents WHERE run_id = {placeholder} AND agent_key = {placeholder}",
                (run_id, agent_key),
            )
            existing = cur.fetchone()
            payload = _serialize(metadata)
            if existing is None:
                cur.execute(
                    f"""
                    INSERT INTO hgm_agents (
                        run_id, agent_key, parent_key, depth, metadata,
                        expansion_count, clade_success, clade_failure, created_at, updated_at
                    ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 0, 0, 0, {placeholder}, {placeholder})
                    """,
                    (run_id, agent_key, parent_key, depth, payload, now, now),
                )
            else:
                updates: List[str] = []
                params: List[Any] = []
                if parent_key is not None and parent_key != existing[2]:
                    updates.append(f"parent_key = {placeholder}")
                    params.append(parent_key)
                if depth != existing[3]:
                    updates.append(f"depth = {placeholder}")
                    params.append(depth)
                if metadata is not None:
                    updates.append(f"metadata = {placeholder}")
                    params.append(payload)
                updates.append(f"updated_at = {placeholder}")
                params.append(now)
                params.extend([run_id, agent_key])
                where_clause = f"WHERE run_id = {placeholder} AND agent_key = {placeholder}"
                cur.execute(
                    f"UPDATE hgm_agents SET {', '.join(updates)} {where_clause}",
                    tuple(params),
                )
            cur.execute(
                f"SELECT run_id, agent_key, parent_key, depth, metadata, expansion_count, clade_success, clade_failure, created_at, updated_at "
                f"FROM hgm_agents WHERE run_id = {placeholder} AND agent_key = {placeholder}",
                (run_id, agent_key),
            )
            row = cur.fetchone()
        return self._row_to_agent(row)

    def record_expansion(
        self,
        run_id: str,
        agent_key: str,
        parent_key: Optional[str],
        payload: Optional[Dict[str, Any]],
    ) -> HgmAgent:
        metadata = dict(payload or {})
        agent = self.ensure_agent(run_id, agent_key, parent_key, metadata)
        now = _now()
        serialized = _serialize(metadata)
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(
                f"""
                UPDATE hgm_agents
                   SET expansion_count = expansion_count + 1,
                       metadata = {placeholder},
                       updated_at = {placeholder}
                 WHERE run_id = {placeholder} AND agent_key = {placeholder}
                """,
                (serialized, now, run_id, agent_key),
            )
            cur.execute(
                f"SELECT run_id, agent_key, parent_key, depth, metadata, expansion_count, clade_success, clade_failure, created_at, updated_at "
                f"FROM hgm_agents WHERE run_id = {placeholder} AND agent_key = {placeholder}",
                (run_id, agent_key),
            )
            row = cur.fetchone()
        return self._row_to_agent(row)

    # ------------------------------------------------------------------
    # Evaluation helpers
    def record_evaluation(self, run_id: str, agent_key: str, payload: Dict[str, Any]) -> None:
        reward = float(payload.get("reward", 0.0))
        weight = float(payload.get("weight", 1.0))
        cmp_payload = payload.get("cmp") or {}
        cmp_mean = float(cmp_payload.get("mean", reward))
        cmp_variance = float(cmp_payload.get("variance", 0.0))
        cmp_weight = float(cmp_payload.get("weight", weight))
        success_flag = payload.get("success")
        success = _bool(success_flag) if success_flag is not None else reward >= 0.5
        success_mass = max(0.0, reward * weight)
        failure_mass = max(0.0, (1.0 - reward) * weight)
        now = _now()
        self.ensure_agent(run_id, agent_key)
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(
                f"""
                INSERT INTO hgm_evaluation_outcomes (
                    run_id, agent_key, reward, weight, success, payload, created_at
                ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                """,
                (
                    run_id,
                    agent_key,
                    reward,
                    weight,
                    1 if success else 0,
                    _serialize(payload),
                    now,
                ),
            )
            cur.execute(
                f"""
                INSERT INTO hgm_agent_performance (
                    run_id, agent_key, visits, success_weight, failure_weight, cmp_mean, cmp_variance, cmp_weight, updated_at
                ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                ON CONFLICT(run_id, agent_key) DO UPDATE SET
                    visits = hgm_agent_performance.visits + {placeholder},
                    success_weight = hgm_agent_performance.success_weight + {placeholder},
                    failure_weight = hgm_agent_performance.failure_weight + {placeholder},
                    cmp_mean = {placeholder},
                    cmp_variance = {placeholder},
                    cmp_weight = {placeholder},
                    updated_at = {placeholder}
                """,
                (
                    run_id,
                    agent_key,
                    weight,
                    success_mass,
                    failure_mass,
                    cmp_mean,
                    cmp_variance,
                    cmp_weight,
                    now,
                    weight,
                    success_mass,
                    failure_mass,
                    cmp_mean,
                    cmp_variance,
                    cmp_weight,
                    now,
                ),
            )
            current = agent_key
            while current:
                cur.execute(
                    f"""
                    UPDATE hgm_agents
                       SET clade_success = clade_success + {placeholder},
                           clade_failure = clade_failure + {placeholder},
                           updated_at = {placeholder}
                     WHERE run_id = {placeholder} AND agent_key = {placeholder}
                    """,
                    (success_mass, failure_mass, now, run_id, current),
                )
                cur.execute(
                    f"SELECT parent_key FROM hgm_agents WHERE run_id = {placeholder} AND agent_key = {placeholder}",
                    (run_id, current),
                )
                row = cur.fetchone()
                parent = row[0] if row else None
                if not parent:
                    break
                current = parent

    def list_evaluations(self, run_id: str, agent_key: Optional[str] = None) -> List[HgmEvaluationOutcome]:
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            if agent_key is None:
                cur.execute(
                    f"SELECT id, run_id, agent_key, reward, weight, success, payload, created_at FROM hgm_evaluation_outcomes WHERE run_id = {placeholder} ORDER BY created_at",
                    (run_id,),
                )
            else:
                cur.execute(
                    f"SELECT id, run_id, agent_key, reward, weight, success, payload, created_at FROM hgm_evaluation_outcomes WHERE run_id = {placeholder} AND agent_key = {placeholder} ORDER BY created_at",
                    (run_id, agent_key),
                )
            rows = cur.fetchall()
        return [self._row_to_evaluation(row) for row in rows or []]

    # ------------------------------------------------------------------
    # Lineage traversal
    def fetch_lineage(self, run_id: str, root_key: Optional[str] = None) -> List[LineageNode]:
        placeholder = self._db.placeholder()
        with self._db.transaction() as cur:
            cur.execute(
                f"""
                SELECT a.agent_key, a.parent_key, a.depth, a.metadata, a.expansion_count, a.clade_success, a.clade_failure,
                       p.visits, p.success_weight, p.failure_weight, p.cmp_mean, p.cmp_variance, p.cmp_weight
                  FROM hgm_agents AS a
             LEFT JOIN hgm_agent_performance AS p
                    ON p.run_id = a.run_id AND p.agent_key = a.agent_key
                 WHERE a.run_id = {placeholder}
              ORDER BY a.depth ASC, a.agent_key ASC
                """,
                (run_id,),
            )
            rows = cur.fetchall()
        nodes: Dict[str, LineageNode] = {}
        roots: List[LineageNode] = []
        for row in rows or []:
            metadata = _deserialize(row[3])
            performance = LineagePerformance(
                visits=float(row[7] or 0.0),
                success_weight=float(row[8] or 0.0),
                failure_weight=float(row[9] or 0.0),
                cmp_mean=float(row[10] or 0.0),
                cmp_variance=float(row[11] or 0.0),
                cmp_weight=float(row[12] or 0.0),
            )
            node = LineageNode(
                agent_key=str(row[0]),
                parent_key=row[1],
                depth=int(row[2]),
                metadata=metadata,
                expansion_count=float(row[4] or 0.0),
                clade_success=float(row[5] or 0.0),
                clade_failure=float(row[6] or 0.0),
                performance=performance,
            )
            nodes[node.agent_key] = node
        for node in nodes.values():
            if node.parent_key and node.parent_key in nodes:
                nodes[node.parent_key].children.append(node)
            else:
                roots.append(node)
        if root_key:
            return [nodes[root_key]] if root_key in nodes else []
        return roots

    # ------------------------------------------------------------------
    # Row adapters
    def _row_to_run(self, row) -> HgmRun:
        return HgmRun(
            run_id=row[0],
            root_agent=row[1],
            metadata=_deserialize(row[2]),
            created_at=float(row[3]),
            updated_at=float(row[4]),
        )

    def _row_to_agent(self, row) -> HgmAgent:
        return HgmAgent(
            run_id=row[0],
            agent_key=row[1],
            parent_key=row[2],
            depth=int(row[3]),
            metadata=_deserialize(row[4]),
            expansion_count=float(row[5]),
            clade_success=float(row[6]),
            clade_failure=float(row[7]),
            created_at=float(row[8]),
            updated_at=float(row[9]),
        )

    def _row_to_evaluation(self, row) -> HgmEvaluationOutcome:
        return HgmEvaluationOutcome(
            id=int(row[0]),
            run_id=row[1],
            agent_key=row[2],
            reward=float(row[3]),
            weight=float(row[4]),
            success=bool(row[5]),
            payload=_deserialize(row[6]),
            created_at=float(row[7]),
        )


def seed_demo_run(repository: HgmRepository, run_id: str = "demo-run") -> HgmRun:
    """Populate a small lineage useful for demos and manual testing."""

    repository.delete_run(run_id)
    run = repository.ensure_run(run_id, "root", {"label": "Demo Root"})
    repository.ensure_agent(run_id, "root", None, {"label": "Root"})
    repository.record_expansion(run_id, "root/alpha", "root", {"label": "Alpha"})
    repository.record_expansion(run_id, "root/beta", "root", {"label": "Beta"})
    repository.record_expansion(run_id, "root/alpha/deep", "root/alpha", {"label": "Deep"})
    repository.record_evaluation(
        run_id,
        "root/alpha",
        {"reward": 0.82, "weight": 1.0, "success": True, "cmp": {"weight": 1.0, "mean": 0.82, "variance": 0.0}},
    )
    repository.record_evaluation(
        run_id,
        "root/alpha/deep",
        {"reward": 0.91, "weight": 1.0, "success": True, "cmp": {"weight": 1.0, "mean": 0.91, "variance": 0.0}},
    )
    repository.record_evaluation(
        run_id,
        "root/beta",
        {"reward": 0.35, "weight": 1.0, "success": False, "cmp": {"weight": 1.0, "mean": 0.35, "variance": 0.0}},
    )
    return run


__all__ = [
    "HgmRepository",
    "HgmRun",
    "HgmAgent",
    "HgmAgentPerformance",
    "HgmEvaluationOutcome",
    "LineageNode",
    "LineagePerformance",
    "seed_demo_run",
]
