"""Simulation utilities comparing TRM with baselines on conversion funnels."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import torch
from torch import Tensor
from torch.utils.data import Dataset

from .config import TinyRecursiveModelConfig
from .ledger import EconomicLedger
from .orchestrator import TrmOrchestrator
from .sentinel import Sentinel, SentinelSettings


class SyntheticConversionDataset(Dataset):
    """Synthetic dataset that exposes complexity-aware halting targets."""

    def __init__(self, *, size: int, config: TinyRecursiveModelConfig, seed: int = 7) -> None:
        rng = np.random.default_rng(seed)
        self.features = rng.normal(size=(size, config.input_dim)).astype(np.float32)
        base_weights = rng.normal(size=(config.input_dim, config.num_classes)).astype(np.float32)
        logits = self.features @ base_weights
        probs = torch.softmax(torch.from_numpy(logits), dim=-1).numpy()
        labels = np.array([rng.choice(config.num_classes, p=prob) for prob in probs])
        complexity = np.sum(np.abs(self.features), axis=1)
        max_steps = config.total_possible_steps
        step_bins = np.linspace(np.min(complexity), np.max(complexity), max_steps)
        halt_target = np.digitize(complexity, step_bins, right=False)
        halt_target = np.clip(halt_target, 1, max_steps) - 1
        self.labels = labels.astype(np.int64)
        self.halt_target = halt_target.astype(np.int64)

    def __len__(self) -> int:  # pragma: no cover - trivial
        return self.features.shape[0]

    def __getitem__(self, idx: int) -> Dict[str, Tensor]:
        return {
            "features": torch.from_numpy(self.features[idx]),
            "label": torch.tensor(self.labels[idx], dtype=torch.long),
            "halt_target": torch.tensor(self.halt_target[idx], dtype=torch.long),
        }


@dataclass(slots=True)
class DemoMetrics:
    strategy: str
    conversions: int
    attempts: int
    success_rate: float
    total_value: float
    total_cost: float
    roi: float
    average_steps: float
    average_latency_ms: float

    @property
    def value_per_conversion(self) -> float:
        return 0.0 if self.conversions == 0 else self.total_value / self.conversions


def _simulate_strategy(
    *,
    name: str,
    outcomes: Iterable[Tuple[np.ndarray, int]],
    value_per_conversion: float,
    cost_per_attempt: float,
    accuracy: float,
    complexity_bias: float = 0.0,
) -> DemoMetrics:
    conversions = 0
    attempts = 0
    latencies: List[float] = []
    for features, label in outcomes:
        attempts += 1
        predicted = label if random.random() < accuracy else 1 - label
        if complexity_bias > 0 and features.mean() > 0:
            predicted = label
        success = predicted == label == 1
        if success:
            conversions += 1
        latencies.append(cost_per_attempt / 0.0005)
    total_cost = attempts * cost_per_attempt
    total_value = conversions * value_per_conversion
    roi = float("inf") if total_cost == 0 else (total_value / total_cost)
    success_rate = conversions / attempts if attempts else 0.0
    return DemoMetrics(
        strategy=name,
        conversions=conversions,
        attempts=attempts,
        success_rate=success_rate,
        total_value=total_value,
        total_cost=total_cost,
        roi=roi,
        average_steps=0.0,
        average_latency_ms=float(np.mean(latencies) if latencies else 0.0),
    )


def run_conversion_simulation(
    *,
    opportunities: int = 200,
    seed: int = 42,
    value_per_conversion: float = 100.0,
    greedy_cost: float = 0.0001,
    llm_cost: float = 0.05,
    trm_cost_multiplier: float = 0.001,
    config: Optional[TinyRecursiveModelConfig] = None,
    output_path: Optional[Path] = None,
    safety_relaxed: bool = False,
) -> List[DemoMetrics]:
    """Train TRM and benchmark it against greedy and LLM baselines."""

    rng = np.random.default_rng(seed)
    config = config or TinyRecursiveModelConfig()
    dataset = SyntheticConversionDataset(size=opportunities * 4, config=config, seed=seed)
    sentinel = None
    if safety_relaxed:
        sentinel = Sentinel(
            SentinelSettings(
                min_roi=0.0,
                max_daily_cost=float("inf"),
                max_latency_ms=1e6,
                max_steps=config.total_possible_steps + 10,
            )
        )
    orchestrator = TrmOrchestrator(
        config,
        value_per_conversion=value_per_conversion,
        cost_per_ms=trm_cost_multiplier / 2,
        sentinel=sentinel,
    )
    orchestrator.train(dataset)

    test_indices = rng.choice(len(dataset), size=opportunities, replace=False)
    ledger = orchestrator.ledger
    trm_latencies: List[float] = []
    for idx in test_indices:
        sample = dataset[idx]
        result = orchestrator.run_inference(sample["features"], ground_truth=int(sample["label"].item()))
        trm_latencies.append(result.latency_ms)

    trm_metrics = DemoMetrics(
        strategy="Tiny Recursive Model",
        conversions=sum(1 for entry in ledger.entries() if entry.success and entry.value > 0),
        attempts=len(list(ledger.entries())),
        success_rate=ledger.success_rate(),
        total_value=ledger.total_value(),
        total_cost=ledger.total_cost(),
        roi=ledger.roi(),
        average_steps=ledger.average_steps(),
        average_latency_ms=float(np.mean(trm_latencies)) if trm_latencies else 0.0,
    )

    outcomes = [(dataset[idx]["features"].numpy(), int(dataset[idx]["label"].item())) for idx in test_indices]
    greedy_metrics = _simulate_strategy(
        name="Greedy Baseline",
        outcomes=outcomes,
        value_per_conversion=value_per_conversion,
        cost_per_attempt=greedy_cost,
        accuracy=0.3,
    )
    llm_metrics = _simulate_strategy(
        name="Large Language Model",
        outcomes=outcomes,
        value_per_conversion=value_per_conversion,
        cost_per_attempt=llm_cost,
        accuracy=0.45,
        complexity_bias=0.2,
    )

    metrics = [greedy_metrics, llm_metrics, trm_metrics]
    if output_path is not None:
        from dataclasses import asdict

        output = [asdict(metric) for metric in metrics]
        output_path.write_text(json.dumps(output, indent=2))
    return metrics

