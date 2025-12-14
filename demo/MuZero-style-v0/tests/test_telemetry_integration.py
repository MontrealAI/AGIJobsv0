import json
from pathlib import Path

import sys

import yaml

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from muzero_demo.cli import run_demo
from muzero_demo.telemetry import TelemetrySink


def _write_config(tmp_path: Path) -> Path:
    artifact_dir = tmp_path / "artifacts"
    config = {
        "experiment": {
            "seed": 7,
            "device": "cpu",
            "episodes": 1,
            "evaluation_episodes": 1,
            "artifact_dir": str(artifact_dir),
        },
        "environment": {
            "episode_length": 2,
            "job_pool_size": 2,
            "max_budget": 50.0,
            "min_reward": 5.0,
            "max_reward": 10.0,
            "min_cost": 1.0,
            "max_cost": 3.0,
            "min_success_prob": 0.2,
            "max_success_prob": 0.8,
            "success_noise": 0.01,
            "discount": 0.95,
        },
        "network": {
            "observation_dim": 12,
            "hidden_dim": 16,
            "latent_dim": 8,
            "policy_temperature": 1.0,
        },
        "planner": {"default_simulations": 4, "max_simulations": 8, "temperature": 1.0},
        "training": {
            "batch_size": 4,
            "unroll_steps": 2,
            "td_steps": 2,
            "learning_rate": 0.001,
            "replay_capacity": 32,
            "checkpoint_interval": 2,
        },
        "telemetry": {"enable": True, "flush_interval": 1},
        "baselines": {"greedy_immediacy_bias": 0.01, "policy_temperature": 1.0},
    }
    config_path = tmp_path / "config.yaml"
    config_path.write_text(yaml.safe_dump(config), encoding="utf-8")
    return config_path


def test_telemetry_sink_flushes_on_exit(tmp_path):
    config_path = _write_config(tmp_path)
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    telemetry_dir = tmp_path / "artifacts" / "telemetry"
    with TelemetrySink(config) as telemetry:
        telemetry.record("demo_results", {"muzero": 1.0})
    files = sorted(telemetry_dir.glob("telemetry_*.jsonl"))
    assert files, "Telemetry file should be created when the sink exits"
    payload = json.loads(files[-1].read_text(encoding="utf-8").splitlines()[0])
    assert payload["metric"] == "demo_results"
    assert payload["muzero"] == 1.0


def test_run_demo_writes_results_telemetry(tmp_path):
    config_path = _write_config(tmp_path)
    run_demo(str(config_path))
    telemetry_dir = tmp_path / "artifacts" / "telemetry"
    files = sorted(telemetry_dir.glob("telemetry_*.jsonl"))
    assert files, "Running the demo should emit telemetry entries"
    entries = [json.loads(line) for line in files[-1].read_text(encoding="utf-8").splitlines()]
    assert any(entry.get("metric") == "demo_results" for entry in entries)
