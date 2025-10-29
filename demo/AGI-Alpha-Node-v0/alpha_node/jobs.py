"""Job harvesting from AGI Jobs router."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional, Union

from web3 import Web3

_LOGGER = logging.getLogger(__name__)


@dataclass
class JobPayload:
    job_id: str
    description: str
    base_reward: float
    risk: float
    metadata: Dict[str, Any]

    def to_planner_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "description": self.description,
            "base_reward": self.base_reward,
            "risk": self.risk,
            "metadata": dict(self.metadata),
        }


class TaskHarvester:
    """Poll the AGI Jobs marketplace or a local scenario file."""

    def __init__(
        self,
        source: Union[Web3, str, Path],
        router_address: Optional[str] = None,
        poll_interval: int = 15,
        loop: bool = False,
    ) -> None:
        self._poll_interval = poll_interval
        self._running = False
        self._loop = loop
        self._cursor = 0

        if isinstance(source, Web3):
            if router_address is None:
                raise ValueError("router_address is required when harvesting from Web3")
            self._mode = "web3"
            self._web3 = source
            self._router_address = Web3.to_checksum_address(router_address)
            self._jobs_path = None
            self._jobs: List[JobPayload] = []
        else:
            self._mode = "file"
            self._web3 = None
            self._router_address = None
            self._jobs_path = Path(source)
            self._jobs = self._load_jobs()

    async def stream(self) -> AsyncIterator[JobPayload]:
        self._running = True
        while self._running:
            if self._mode == "web3":
                await asyncio.sleep(self._poll_interval)
                job = self._fake_job()
                _LOGGER.info("Job harvested", extra={"job_id": job.job_id, "reward": job.base_reward})
                yield job
            else:
                job = self.next_job()
                if job is None:
                    if not self._loop:
                        break
                    await asyncio.sleep(self._poll_interval)
                    continue
                yield job
                await asyncio.sleep(self._poll_interval)

    def stop(self) -> None:
        self._running = False

    def next_job(self) -> Optional[JobPayload]:
        if self._mode != "file":
            raise RuntimeError("next_job is only available in file-backed mode")
        if not self._jobs:
            self._jobs = self._load_jobs()
            self._cursor = 0
        if not self._jobs:
            return None
        if self._cursor >= len(self._jobs):
            if not self._loop:
                return None
            self._jobs = self._load_jobs()
            self._cursor = 0
        job = self._jobs[self._cursor]
        self._cursor += 1
        return job

    def _load_jobs(self) -> List[JobPayload]:
        if self._jobs_path is None:
            return []
        if not self._jobs_path.exists():
            _LOGGER.warning("Job scenario file missing", extra={"path": str(self._jobs_path)})
            return []
        try:
            raw: Iterable[Dict[str, Any]] = json.loads(self._jobs_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive path
            _LOGGER.error("Failed to parse job scenario", extra={"path": str(self._jobs_path), "error": str(exc)})
            return []
        jobs: List[JobPayload] = []
        for entry in raw:
            job_id = entry.get("job_id") or entry.get("id")
            if not job_id:
                continue
            description = entry.get("description") or "Autonomous alpha generation"
            base_reward = float(entry.get("base_reward", random.uniform(5.0, 20.0)))
            risk = float(entry.get("risk", 0.2))
            metadata = entry.get("metadata") or {}
            if "domain" not in metadata and entry.get("domain"):
                metadata["domain"] = entry["domain"]
            jobs.append(JobPayload(job_id=job_id, description=description, base_reward=base_reward, risk=risk, metadata=metadata))
        return jobs

    def _fake_job(self) -> JobPayload:
        assert self._mode == "web3"
        job_id = f"job-{self._web3.eth.block_number}-{random.randint(1000, 9999)}"
        description = random.choice(
            [
                "Deploy liquidity optimization strategy",
                "Synthesize antimicrobial compound",
                "Optimize advanced robotics supply chain",
            ]
        )
        base_reward = random.uniform(5.0, 20.0)
        risk = random.uniform(0.05, 0.4)
        metadata = {"domain": description.split()[0].lower()}
        return JobPayload(job_id=job_id, description=description, base_reward=base_reward, risk=risk, metadata=metadata)
