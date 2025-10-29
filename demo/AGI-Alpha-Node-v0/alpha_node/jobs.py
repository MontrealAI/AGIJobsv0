"""Job harvesting from AGI Jobs router."""
from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import AsyncIterator, Dict, List

from web3 import Web3

_LOGGER = logging.getLogger(__name__)


@dataclass
class JobPayload:
    job_id: str
    description: str
    base_reward: float
    risk: float
    metadata: Dict[str, str]


class TaskHarvester:
    """Polls the JobRouter for new assignments."""

    def __init__(self, web3: Web3, router_address: str, poll_interval: int = 15) -> None:
        self._web3 = web3
        self._router_address = Web3.to_checksum_address(router_address)
        self._poll_interval = poll_interval
        self._running = False

    async def stream(self) -> AsyncIterator[JobPayload]:
        self._running = True
        while self._running:
            await asyncio.sleep(self._poll_interval)
            job = self._fake_job()
            _LOGGER.info("Job harvested", extra={"job_id": job.job_id, "reward": job.base_reward})
            yield job

    def stop(self) -> None:
        self._running = False

    def _fake_job(self) -> JobPayload:
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
