"""High level helpers for running the HGM demo simulations."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import random
from typing import List

from .engine import HGMEngine
from .metrics import RunMetrics
from .orchestrator import DemoOrchestrator
from .visualization import lineage_mermaid_diagram


@dataclass
class StrategyOutcome:
    name: str
    metrics: RunMetrics
    log: List[str] = field(default_factory=list)
    mermaid: str | None = None

    @property
    def summary(self) -> str:
        roi = "∞" if self.metrics.total_cost == 0 else f"{self.metrics.roi:.2f}"
        return (
            f"{self.name}: GMV=${self.metrics.total_gmv:.2f} | Cost=${self.metrics.total_cost:.2f} | "
            f"Profit=${self.metrics.profit:.2f} | ROI={roi}"
        )


@dataclass
class DemoComparison:
    hgm: StrategyOutcome
    baseline: StrategyOutcome

    @property
    def lift_percentage(self) -> float:
        if self.baseline.metrics.total_gmv == 0:
            return float("inf")
        return ((self.hgm.metrics.total_gmv - self.baseline.metrics.total_gmv) / self.baseline.metrics.total_gmv) * 100


async def _run_hgm_async(seed: int, actions: int) -> StrategyOutcome:
    log_messages: List[str] = []

    def logger(message: str) -> None:
        log_messages.append(message)

    engine_rng = random.Random(seed)
    orchestrator_rng = random.Random(seed + 1)

    engine = HGMEngine(tau=1.1, alpha=1.25, epsilon=0.05, rng=engine_rng)
    engine.register_root(quality=0.58, description="Day-zero AGIJobs operator harnessing HGM")

    orchestrator = DemoOrchestrator(engine, rng=orchestrator_rng)
    await orchestrator.run(max_actions=actions, log=logger)

    mermaid = lineage_mermaid_diagram(engine)
    return StrategyOutcome(
        name="HGM CMP-guided",
        metrics=orchestrator.metrics,
        log=log_messages,
        mermaid=mermaid,
    )


def run_hgm_simulation(seed: int, actions: int) -> StrategyOutcome:
    return asyncio.run(_run_hgm_async(seed, actions))


def run_baseline_simulation(seed: int, actions: int) -> StrategyOutcome:
    rng = random.Random(seed)
    metrics = RunMetrics()
    quality = 0.52
    log_messages: List[str] = []
    base_value = 70.0
    for step in range(actions):
        success = rng.random() < quality
        if success:
            gmv = base_value * (1.0 + 0.03 * (step + 1))
            quality = min(0.88, quality + 0.005)
        else:
            gmv = 0.0
            quality = max(0.35, quality - 0.03)
        metrics.record_evaluation("baseline", success, gmv=gmv, cost=15.0)
        if success:
            log_messages.append(
                f"✅ Baseline success (step {step}) :: gmv=${gmv:.2f} quality→{quality:.2f}"
            )
        else:
            log_messages.append(
                f"❌ Baseline miss   (step {step}) :: cost=$15.00 quality→{quality:.2f}"
            )
    return StrategyOutcome(name="Greedy baseline", metrics=metrics, log=log_messages, mermaid=None)


def run_comparison(seed: int = 7, actions: int = 42) -> DemoComparison:
    hgm = run_hgm_simulation(seed, actions)
    baseline = run_baseline_simulation(seed, actions)
    return DemoComparison(hgm=hgm, baseline=baseline)


__all__ = ["run_comparison", "run_hgm_simulation", "run_baseline_simulation", "DemoComparison", "StrategyOutcome"]
