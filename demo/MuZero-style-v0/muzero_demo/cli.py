"""Command-line interface for MuZero demo."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict

import torch
import yaml

from .environment import JobsEnvironment
from .network import MuZeroNetwork
from .planner import MuZeroPlanner
from .training import MuZeroTrainer
from .evaluation import compare_strategies
from .telemetry import TelemetrySink, summarise_runs


def load_config(path: str) -> Dict:
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file {path} not found")
    with config_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    experiment = config.setdefault("experiment", {})
    experiment.setdefault("artifact_dir", str(config_path.parent / ".." / "artifacts"))
    return config


def prepare_device(config: Dict) -> torch.device:
    device_name = config.get("experiment", {}).get("device", "cpu")
    if device_name == "cuda" and not torch.cuda.is_available():
        print("CUDA requested but unavailable; falling back to CPU", file=sys.stderr)
        device_name = "cpu"
    return torch.device(device_name)


def run_demo(config_path: str) -> None:
    config = load_config(config_path)
    device = prepare_device(config)
    network = MuZeroNetwork(config).to(device)
    env = JobsEnvironment(config)
    env.seed(config.get("experiment", {}).get("seed", 17))
    planner = MuZeroPlanner(config, network, device)
    trainer = MuZeroTrainer(config, network, device)
    episodes = int(config.get("experiment", {}).get("episodes", 32))
    trainer.self_play(env, planner, episodes)
    for _ in range(max(episodes // 4, 1)):
        trainer.train_step()
    checkpoint_path = Path(config.get("experiment", {}).get("artifact_dir", "demo/MuZero-style-v0/artifacts")) / "muzero_demo.pt"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    trainer.save_checkpoint(str(checkpoint_path))
    results = compare_strategies(config, network, device)
    TelemetrySink(config).record("demo_results", results)
    TelemetrySink(config).flush()
    print("=== MuZero Demo Results ===")
    for strategy, value in results.items():
        print(f"{strategy:>10}: {value:8.3f}")
    print(f"Checkpoint saved to {checkpoint_path}")


def run_smoke_tests(config_path: str) -> None:
    config = load_config(config_path)
    device = prepare_device(config)
    network = MuZeroNetwork(config).to(device)
    env = JobsEnvironment(config)
    planner = MuZeroPlanner(config, network, device)
    observation = env.observe()
    action, policy, meta = planner.plan(env, observation, forced_simulations=8)
    assert 0 <= action < env.num_actions
    assert abs(sum(policy) - 1.0) < 1e-6
    trainer = MuZeroTrainer(config, network, device)
    trainer.self_play(env, planner, episodes=1)
    metrics = trainer.train_step()
    print(json.dumps({"plan_action": action, "policy": policy, "training_metrics": metrics}, indent=2))


def run_eval(config_path: str) -> None:
    config = load_config(config_path)
    device = prepare_device(config)
    network = MuZeroNetwork(config).to(device)
    results = compare_strategies(config, network, device)
    print(json.dumps(results, indent=2))


parser = argparse.ArgumentParser(description="MuZero-style AGI Jobs demo")
subparsers = parser.add_subparsers(dest="command")

demo_parser = subparsers.add_parser("demo", help="Train and evaluate the MuZero planner")
demo_parser.add_argument("--config", required=True, help="Path to configuration YAML")

smoke_parser = subparsers.add_parser("smoke-tests", help="Run smoke tests for the demo")
smoke_parser.add_argument("--config", required=True, help="Path to configuration YAML")

eval_parser = subparsers.add_parser("eval", help="Evaluate strategies only")
eval_parser.add_argument("--config", required=True, help="Path to configuration YAML")


def app(argv: list[str] | None = None) -> None:
    args = parser.parse_args(argv)
    if args.command == "demo":
        run_demo(args.config)
    elif args.command == "smoke-tests":
        run_smoke_tests(args.config)
    elif args.command == "eval":
        run_eval(args.config)
    else:
        parser.print_help()


if __name__ == "__main__":
    app()
