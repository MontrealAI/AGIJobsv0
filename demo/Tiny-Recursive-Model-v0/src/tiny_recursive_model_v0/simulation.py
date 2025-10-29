"""Conversion funnel simulation comparing TRM vs baselines."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression

from .config import DemoConfig
from .engine import TinyRecursiveModelEngine
from .ledger import EconomicLedger
from .sentinel import Sentinel
from .telemetry import TelemetryEvent, TelemetryWriter
from .thermostat import Thermostat
from .utils import set_global_seed


@dataclass
class EngineSummary:
    name: str
    attempts: int
    conversions: int
    conversion_rate: float
    total_cost: float
    gmv: float
    profit: float
    roi: float
    notes: str


@dataclass
class SimulationReport:
    trm_training_accuracy: float
    metrics: Dict[str, EngineSummary]
    telemetry: List[TelemetryEvent]

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "Engine": summary.name,
                    "Attempts": summary.attempts,
                    "Conversions": summary.conversions,
                    "Conversion Rate": summary.conversion_rate,
                    "Total Cost": summary.total_cost,
                    "GMV": summary.gmv,
                    "Profit": summary.profit,
                    "ROI": summary.roi,
                    "Notes": summary.notes,
                }
                for summary in self.metrics.values()
            ]
        ).set_index("Engine")


class ConversionSimulation:
    """Encapsulates dataset generation and evaluation."""

    def __init__(
        self,
        config: DemoConfig,
        engine: TinyRecursiveModelEngine,
        ledger: EconomicLedger,
        thermostat: Thermostat,
        sentinel: Sentinel,
        telemetry: TelemetryWriter,
        *,
        samples: int = 500,
        seed: int = 21,
    ) -> None:
        self.config = config
        self.engine = engine
        self.ledger = ledger
        self.thermostat = thermostat
        self.sentinel = sentinel
        self.telemetry = telemetry
        self.samples = samples
        self.seed = seed

    @classmethod
    def default(cls, config: DemoConfig) -> "ConversionSimulation":
        set_global_seed(123)
        engine = TinyRecursiveModelEngine.from_config(config.trm)
        ledger = EconomicLedger(
            value_per_success=config.ledger.value_per_success,
            base_compute_cost=config.ledger.base_compute_cost,
            cost_per_cycle=config.ledger.cost_per_cycle,
            daily_budget=config.ledger.daily_budget,
        )
        telemetry = TelemetryWriter(config.telemetry.write_path, enabled=config.telemetry.enable_structured_logs)
        thermostat = Thermostat(config.thermostat, ledger, engine)
        sentinel = Sentinel(config.sentinel, ledger)
        return cls(config, engine, ledger, thermostat, sentinel, telemetry)

    def _generate_dataset(self) -> Tuple[np.ndarray, np.ndarray]:
        features, labels = make_classification(
            n_samples=self.samples,
            n_features=self.config.trm.input_dim,
            n_informative=self.config.trm.input_dim - 2,
            n_redundant=0,
            n_repeated=0,
            n_classes=2,
            weights=[0.5, 0.5],
            random_state=self.seed,
        )
        return features.astype(np.float32), labels.astype(np.int64)

    def _baseline_greedy(self, features: np.ndarray) -> np.ndarray:
        return (features[:, 0] + features[:, 1] > 0).astype(int)

    def _baseline_llm(self, train_x: np.ndarray, train_y: np.ndarray, test_x: np.ndarray) -> np.ndarray:
        model = LogisticRegression(max_iter=200)
        model.fit(train_x, train_y)
        return model.predict(test_x)

    def run(self, engine: TinyRecursiveModelEngine | None = None) -> SimulationReport:
        engine = engine or self.engine
        features, labels = self._generate_dataset()
        split = int(len(features) * 0.6)
        train_x, test_x = features[:split], features[split:]
        train_y, test_y = labels[:split], labels[split:]
        train_tensor = torch.from_numpy(train_x)
        train_labels = torch.from_numpy(train_y)
        engine.train(train_tensor, train_labels)
        training_logits = engine.infer(train_tensor[:32])
        train_subset_labels = train_labels[:32]
        predictions = training_logits.probabilities.argmax(dim=-1)
        trm_training_accuracy = (
            (predictions == train_subset_labels).float().mean().item()
            if len(train_subset_labels) > 0
            else 0.0
        )

        greedy_pred = self._baseline_greedy(test_x)
        llm_pred = self._baseline_llm(train_x, train_y, test_x)
        trm_metrics = self._evaluate_trm(engine, torch.from_numpy(test_x), torch.from_numpy(test_y))
        greedy_metrics = self._compute_summary(
            name="Greedy",
            attempts=len(test_x),
            predictions=greedy_pred,
            labels=test_y,
            per_call_cost=0.0001,
            notes="Score threshold heuristic",
        )
        llm_metrics = self._compute_summary(
            name="LLM",
            attempts=len(test_x),
            predictions=llm_pred,
            labels=test_y,
            per_call_cost=0.05,
            notes="Logistic regression proxy",
        )
        telemetry_events = [
            TelemetryEvent(
                event_type="SimulationSummary",
                payload={
                    "trm": trm_metrics.__dict__,
                    "greedy": greedy_metrics.__dict__,
                    "llm": llm_metrics.__dict__,
                },
            )
        ]
        self.telemetry.emit(telemetry_events)
        return SimulationReport(
            trm_training_accuracy=trm_training_accuracy,
            metrics={
                "TRM": trm_metrics,
                "Greedy": greedy_metrics,
                "LLM": llm_metrics,
            },
            telemetry=telemetry_events,
        )

    def _compute_summary(
        self,
        *,
        name: str,
        attempts: int,
        predictions: np.ndarray,
        labels: np.ndarray,
        per_call_cost: float,
        notes: str,
    ) -> EngineSummary:
        conversions = int((predictions == labels).sum())
        gmv = conversions * self.config.ledger.value_per_success
        total_cost = attempts * per_call_cost
        profit = gmv - total_cost
        roi = (gmv / total_cost) if total_cost else float("inf")
        return EngineSummary(
            name=name,
            attempts=attempts,
            conversions=conversions,
            conversion_rate=conversions / attempts,
            total_cost=total_cost,
            gmv=gmv,
            profit=profit,
            roi=roi,
            notes=notes,
        )

    def _evaluate_trm(
        self,
        engine: TinyRecursiveModelEngine,
        features: torch.Tensor,
        labels: torch.Tensor,
    ) -> EngineSummary:
        attempts = len(features)
        conversions = 0
        total_cost = 0.0
        halt_probs: List[float] = []
        for feature, label in zip(features, labels):
            feature_batch = feature.unsqueeze(0)
            telemetry = engine.infer(feature_batch)
            prediction = telemetry.probabilities.argmax(dim=-1).item()
            is_success = prediction == int(label.item())
            cost = self.ledger.compute_cost(telemetry.cycles_used)
            halt_probs.extend(telemetry.halt_probabilities)
            entry = (
                self.ledger.record_success(cost=cost, cycles_used=telemetry.cycles_used, latency_ms=telemetry.steps_used * 10.0)
                if is_success
                else self.ledger.record_failure(cost=cost, cycles_used=telemetry.cycles_used, latency_ms=telemetry.steps_used * 10.0)
            )
            self.telemetry.emit(
                [
                    TelemetryEvent(
                        event_type="TRMInference",
                        payload={
                            "cycles": telemetry.cycles_used,
                            "steps": telemetry.steps_used,
                            "halted": telemetry.halted_early,
                            "halt_probs": telemetry.halt_probabilities,
                            "success": is_success,
                        },
                    )
                ]
            )
            status = self.sentinel.evaluate(entry, telemetry)
            if status.paused:
                break
            snapshot = self.thermostat.update()
            self.telemetry.emit(
                [
                    TelemetryEvent(
                        event_type="ThermostatUpdate",
                        payload=snapshot.__dict__,
                    )
                ]
            )
            total_cost += cost
            if is_success:
                conversions += 1
        gmv = conversions * self.config.ledger.value_per_success
        profit = gmv - total_cost
        roi = (gmv / total_cost) if total_cost else float("inf")
        halt_mean = float(np.mean(halt_probs)) if halt_probs else 0.0
        return EngineSummary(
            name="TRM",
            attempts=attempts,
            conversions=conversions,
            conversion_rate=conversions / attempts if attempts else 0.0,
            total_cost=total_cost,
            gmv=gmv,
            profit=profit,
            roi=roi,
            notes=f"Halting mean={halt_mean:.3f}",
        )


__all__ = ["ConversionSimulation", "EngineSummary", "SimulationReport"]
