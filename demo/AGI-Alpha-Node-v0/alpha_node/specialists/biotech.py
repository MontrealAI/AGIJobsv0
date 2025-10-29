"""Biotech synthesist specialist."""
from __future__ import annotations

import random
from typing import Dict

from .base import BaseSpecialist


class BiotechSynthesist(BaseSpecialist):
    name = "biotech_synthesist"

    def evaluate(self, job_payload: Dict[str, str]):  # type: ignore[override]
        novelty = float(job_payload.get("novelty", 0.6))
        throughput = float(job_payload.get("throughput", 1.0))
        efficiency = random.uniform(0.7, 1.1)
        reward_estimate = max(0.0, throughput * efficiency * (1 + novelty))
        outcome = (
            f"Synthesized high-throughput pipeline with novelty score {novelty:.2f} and "
            f"efficiency {efficiency:.2f}"
        )
        metadata = {
            "novelty": f"{novelty:.2f}",
            "throughput": f"{throughput:.2f}",
            "efficiency": f"{efficiency:.2f}",
        }
        return self._result(job_payload["job_id"], outcome, reward_estimate, metadata)
