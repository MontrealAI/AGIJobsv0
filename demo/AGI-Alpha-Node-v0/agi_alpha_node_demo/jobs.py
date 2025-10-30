"""Job representations for the AGI Alpha Node demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from .utils import random_job_id


@dataclass
class Job:
    job_id: str
    job_type: str
    payload: Dict[str, str]
    reward: float
    reinvestment_rate: float
    compliance_tags: List[str] = field(default_factory=list)

    def reinvest_amount(self) -> float:
        return self.reward * self.reinvestment_rate

    def distribute_amount(self) -> float:
        return self.reward - self.reinvest_amount()


def sample_jobs() -> List[Job]:
    return [
        Job(
            job_id=random_job_id("finance"),
            job_type="finance",
            payload={"objective": "Rebalance treasury and hedge volatility"},
            reward=1250.0,
            reinvestment_rate=0.6,
            compliance_tags=["kyc", "aml", "stake"],
        ),
        Job(
            job_id=random_job_id("biotech"),
            job_type="biotech",
            payload={"objective": "Optimise protein folding pipeline"},
            reward=2200.0,
            reinvestment_rate=0.5,
            compliance_tags=["bio-safety", "ip"],
        ),
        Job(
            job_id=random_job_id("manufacturing"),
            job_type="manufacturing",
            payload={"objective": "Cut energy usage by 20%"},
            reward=1800.0,
            reinvestment_rate=0.55,
            compliance_tags=["iso9001", "energy"],
        ),
    ]
