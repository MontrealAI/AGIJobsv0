"""Manufacturing optimizer specialist."""
from __future__ import annotations

import random
from typing import Dict

from .base import BaseSpecialist


class ManufacturingOptimizer(BaseSpecialist):
    name = "manufacturing_optimizer"

    def evaluate(self, job_payload: Dict[str, str]):  # type: ignore[override]
        baseline_yield = float(job_payload.get("baseline_yield", 0.8))
        automation_index = float(job_payload.get("automation_index", 1.3))
        resilience = random.uniform(0.9, 1.15)
        reward_estimate = baseline_yield * automation_index * resilience
        outcome = (
            f"Reconfigured supply mesh to automation index {automation_index:.2f} with resilience {resilience:.2f}"
        )
        metadata = {
            "baseline_yield": f"{baseline_yield:.2f}",
            "automation_index": f"{automation_index:.2f}",
            "resilience": f"{resilience:.2f}",
        }
        return self._result(job_payload["job_id"], outcome, reward_estimate, metadata)
