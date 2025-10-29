"""Command line interface for the Tiny Recursive Model demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import numpy as np
import yaml

from trm_demo.economic import EconomicLedger
from trm_demo.engine import TinyRecursiveModel, TinyRecursiveModelConfig
from trm_demo.simulation import (
    ConversionSimulation,
    SimulationConfig,
    SimulationOutcome,
    ground_truth_probability,
)
from trm_demo.sentinel import Sentinel, SentinelConfig
from trm_demo.subgraph import SubgraphConfig, SubgraphLogger
from trm_demo.thermostat import Thermostat, ThermostatConfig
from trm_demo.ui import render_summary
from trm_demo.utils import generate_candidate


def _load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _build_from_config(config_path: Path) -> Tuple[
    TinyRecursiveModel,
    SimulationConfig,
    Thermostat,
    Sentinel,
    SubgraphLogger,
]:
    raw = _load_yaml(config_path)
    model_config = TinyRecursiveModelConfig(**raw.get("model", {}))
    model = TinyRecursiveModel(config=model_config)

    simulation_config = SimulationConfig(**raw.get("simulation", {}))
    thermostat = Thermostat(ThermostatConfig(**raw.get("thermostat", {})))
    sentinel = Sentinel(SentinelConfig(**raw.get("sentinel", {})))
    subgraph = SubgraphLogger(SubgraphConfig(Path(raw.get("subgraph", {}).get("path", "trm_calls.json"))))
    return model, simulation_config, thermostat, sentinel, subgraph


def _generate_training_dataset(size: int, rng: np.random.Generator) -> List[Tuple[np.ndarray, float]]:
    dataset: List[Tuple[np.ndarray, float]] = []
    for index in range(size):
        candidate = generate_candidate(f"training-{index}", rng)
        vector = candidate.as_feature_vector()
        target = ground_truth_probability(vector)
        dataset.append((vector, target))
    return dataset


def _run_demo(args: argparse.Namespace) -> SimulationOutcome:
    model, simulation_config, thermostat, sentinel, subgraph = _build_from_config(args.config)
    ledger = EconomicLedger()
    rng = np.random.default_rng(args.seed)

    if args.train_epochs > 0:
        dataset = _generate_training_dataset(args.train_samples, rng)
        training_logs = model.train(dataset, epochs=args.train_epochs, learning_rate=args.learning_rate)
        if args.export_training_log:
            Path(args.export_training_log).write_text(json.dumps(training_logs, indent=2))

    simulation = ConversionSimulation(
        simulation_config,
        model,
        ledger,
        thermostat,
        sentinel,
        subgraph,
        rng=rng,
    )
    outcome = simulation.run()

    if args.export_json:
        Path(args.export_json).write_text(json.dumps(outcome.as_dict(), indent=2))

    print(render_summary(outcome))
    return outcome


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tiny Recursive Model Demo")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).parent / "config" / "default_config.yaml",
        help="Path to the configuration file",
    )
    parser.add_argument("--seed", type=int, default=2025, help="Random seed for reproducibility")
    parser.add_argument("--train-epochs", type=int, default=5, help="Optional training epochs for the TRM")
    parser.add_argument("--train-samples", type=int, default=512, help="Training dataset size when fine tuning")
    parser.add_argument("--learning-rate", type=float, default=0.05, help="Learning rate for training")
    parser.add_argument("--export-json", type=Path, help="Optional path to export simulation metrics")
    parser.add_argument("--export-training-log", type=Path, help="Optional path to export training telemetry")
    return parser


def main() -> None:
    outcome = _run_demo(build_parser().parse_args())
    if outcome.sentinel_events:
        print("\n⚠️ Sentinel guardrails activated during the run. Review the reasons above.")


if __name__ == "__main__":
    main()

