"""High-level orchestration for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import numpy as np
from rich.console import Console
from rich.table import Table

from .config import DemoConfig
from .dataset import ReasoningDataset
from .economic import EconomicLedger
from .engine import TinyRecursiveModelEngine
from .sentinel import Sentinel
from .thermostat import ThermostatController


console = Console()


@dataclass
class SimulationResult:
    approach: str
    success_rate: float
    cost: float
    value: float
    roi: float


class DemoOrchestrator:
    def __init__(self, config: DemoConfig, artifact_dir: Path) -> None:
        self.config = config
        self.artifact_dir = artifact_dir
        self.engine = TinyRecursiveModelEngine(config, artifact_dir)
        self.ledger = EconomicLedger(config.economics)
        self.thermostat = ThermostatController(config.thermostat)
        self.sentinel = Sentinel(config.sentinel)
        self.random = np.random.default_rng(config.simulation.seed)
        self.baseline_records: List[bool] = []
        self.llm_records: List[bool] = []
        self.trm_records: List[bool] = []
        self.trm_costs: List[float] = []
        self.trm_steps: List[int] = []
        self.trm_latency: List[float] = []

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------
    def train(self) -> None:
        train, val = self.engine.build_curriculum(self.config.training, self.config.training.seed)
        report = self.engine.train(train, val)
        console.log(f"Training complete: steps={report.steps} train_loss={report.train_loss:.4f} val_loss={report.val_loss:.4f}")

    # ------------------------------------------------------------------
    # Simulation
    # ------------------------------------------------------------------
    def simulate(self, trials: int) -> Dict[str, SimulationResult]:
        dataset = ReasoningDataset(seed=self.config.simulation.seed)
        dataset.generate(n_samples=max(trials, 2000))
        features, labels = dataset.as_arrays()
        for idx in range(trials):
            feature = features[idx]
            label = int(labels[idx])
            self._simulate_baseline(label)
            self._simulate_llm(label)
            self._simulate_trm(feature, label)
        return self._summaries()

    def _simulate_baseline(self, label: int) -> None:
        success = self.random.random() < self.config.baseline.greedy_accuracy
        outcome = label if success else 1 - label
        self.baseline_records.append(outcome == label)

    def _simulate_llm(self, label: int) -> None:
        success = self.random.random() < self.config.baseline.llm_accuracy
        outcome = label if success else 1 - label
        self.llm_records.append(outcome == label)

    def _simulate_trm(self, feature: np.ndarray, label: int) -> None:
        if self.sentinel.state.halted:
            self.trm_records.append(False)
            self.trm_costs.append(0.0)
            self.trm_steps.append(0)
            self.trm_latency.append(self.config.economics.max_latency_ms)
            return
        result = self.engine.infer(feature)
        pred = int(np.argmax(result["probs"]))
        success = pred == label
        steps = result["steps_used"]
        latency_ms = min(self.config.economics.max_latency_ms, steps * 12.5)
        cost = self._cost_for_steps(steps)
        self.trm_records.append(success)
        self.trm_costs.append(cost)
        self.trm_steps.append(steps)
        self.trm_latency.append(latency_ms)
        if success:
            entry = self.ledger.record_success(cost=cost, steps_used=steps, latency_ms=latency_ms)
        else:
            entry = self.ledger.record_failure(cost=cost, steps_used=steps, latency_ms=latency_ms)
        self.sentinel.evaluate(self.ledger, last_latency_ms=latency_ms, steps_used=steps, outcome=success)
        self.thermostat.update(self.ledger)

    def _cost_for_steps(self, steps_used: int) -> float:
        nominal = self.config.model.inner_cycles * self.config.model.outer_steps
        fraction = steps_used / max(nominal, 1)
        base_cost = self.config.economics.cost_per_call
        return base_cost * max(fraction, 0.1)

    def _summaries(self) -> Dict[str, SimulationResult]:
        greedy_cost = 0.0001 * len(self.baseline_records)
        llm_cost = self.config.baseline.llm_cost * len(self.llm_records)
        results = {
            "Greedy": self._build_result("Greedy", self.baseline_records, cost=greedy_cost, value=self.config.economics.value_per_success),
            "LLM": self._build_result("LLM", self.llm_records, cost=llm_cost, value=self.config.economics.value_per_success),
            "TRM": self._build_result(
                "TRM",
                self.trm_records,
                cost=sum(self.trm_costs),
                value=self.config.economics.value_per_success,
                ledger=self.ledger,
            ),
        }
        return results

    def _build_result(
        self,
        approach: str,
        records: List[bool],
        cost: float,
        value: float,
        ledger: EconomicLedger | None = None,
    ) -> SimulationResult:
        successes = sum(1 for outcome in records if outcome)
        attempts = max(len(records), 1)
        success_rate = successes / attempts
        total_value = successes * value
        total_cost = cost if ledger is None else ledger.total_cost
        roi = total_value / total_cost if total_cost else float("inf")
        return SimulationResult(
            approach=approach,
            success_rate=success_rate,
            cost=total_cost,
            value=total_value,
            roi=roi,
        )

    def summary_table(self, results: Dict[str, SimulationResult]) -> Table:
        table = Table(title="Tiny Recursive Model ROI Simulation")
        table.add_column("Approach")
        table.add_column("Success Rate")
        table.add_column("Cost")
        table.add_column("Value")
        table.add_column("ROI")
        for key in ["Greedy", "LLM", "TRM"]:
            result = results[key]
            table.add_row(
                result.approach,
                f"{result.success_rate * 100:.2f}%",
                f"${result.cost:,.4f}",
                f"${result.value:,.2f}",
                f"{result.roi:,.2f}",
            )
        return table

    def export_metrics(self, results: Dict[str, SimulationResult]) -> Dict[str, float]:
        return {
            "trm_roi": results["TRM"].roi,
            "trm_success_rate": results["TRM"].success_rate,
            "greedy_success_rate": results["Greedy"].success_rate,
            "llm_success_rate": results["LLM"].success_rate,
            "trm_average_cost": results["TRM"].cost,
            "ledger_total_value": self.ledger.total_value,
            "ledger_total_cost": self.ledger.total_cost,
        }
