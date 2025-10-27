"""Validator council orchestration for Ω-grade v6 missions."""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Sequence


@dataclass(slots=True)
class CouncilCommit:
    job_id: str
    validator: str
    commit_hash: str
    committed_at: datetime
    reveal_due: datetime


@dataclass(slots=True)
class CouncilReveal:
    job_id: str
    validator: str
    verdict: str
    revealed_at: datetime


class ValidatorCouncil:
    """Simulate commit–reveal voting with operator observability."""

    def __init__(
        self,
        *,
        commit_window: timedelta,
        reveal_window: timedelta,
        logger,
    ) -> None:
        self._commit_window = commit_window
        self._reveal_window = reveal_window
        self._logger = logger
        self._commits: Dict[str, List[CouncilCommit]] = {}
        self._reveals: Dict[str, List[CouncilReveal]] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # lifecycle hooks invoked by the orchestrator
    # ------------------------------------------------------------------
    async def stage_commits(self, job_id: str, validators: Sequence[str]) -> None:
        now = datetime.now(timezone.utc)
        commits = [
            CouncilCommit(
                job_id=job_id,
                validator=validator,
                commit_hash=self._make_commit(job_id, validator, now),
                committed_at=now,
                reveal_due=now + self._commit_window + self._reveal_window,
            )
            for validator in validators
        ]
        async with self._lock:
            self._commits.setdefault(job_id, []).extend(commits)
        self._logger.info(
            "validator_commits_staged",
            extra={
                "event": "validator_commits_staged",
                "job_id": job_id,
                "validators": list(validators),
            },
        )

    async def record_reveal(self, job_id: str, validator: str, verdict: str) -> None:
        now = datetime.now(timezone.utc)
        reveal = CouncilReveal(job_id=job_id, validator=validator, verdict=verdict, revealed_at=now)
        async with self._lock:
            self._reveals.setdefault(job_id, []).append(reveal)
        self._logger.info(
            "validator_reveal_recorded",
            extra={
                "event": "validator_reveal_recorded",
                "job_id": job_id,
                "validator": validator,
                "verdict": verdict,
            },
        )

    async def audit_job(self, job_id: str) -> Dict[str, object]:
        async with self._lock:
            commits = list(self._commits.get(job_id, []))
            reveals = list(self._reveals.get(job_id, []))
        payload = {
            "job_id": job_id,
            "commits": [commit.__dict__ for commit in commits],
            "reveals": [reveal.__dict__ for reveal in reveals],
        }
        return payload

    async def prune(self, active_jobs: Iterable[str]) -> None:
        active = set(active_jobs)
        async with self._lock:
            self._commits = {job_id: commits for job_id, commits in self._commits.items() if job_id in active}
            self._reveals = {job_id: reveals for job_id, reveals in self._reveals.items() if job_id in active}

    # ------------------------------------------------------------------
    # utility helpers
    # ------------------------------------------------------------------
    def _make_commit(self, job_id: str, validator: str, timestamp: datetime) -> str:
        payload = f"{job_id}:{validator}:{timestamp.isoformat()}".encode("utf-8")
        return hashlib.sha3_256(payload).hexdigest()

