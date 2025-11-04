from argparse import ArgumentTypeError, Namespace
from dataclasses import replace
from pathlib import Path

import pytest

from simulation.run_sharded_simulation import _parse_workload_mix, build_config_from_args
from simulation.sharded_simulation import default_config, run_sharded_simulation
from simulation.simulation_reports import export_reports


def test_parse_workload_mix_valid_and_invalid():
    mix = _parse_workload_mix("alpha=0.6,beta=0.4")
    assert mix == {"alpha": 0.6, "beta": 0.4}

    with pytest.raises(ArgumentTypeError):
        _parse_workload_mix("")
    with pytest.raises(ArgumentTypeError):
        _parse_workload_mix("invalid")


def test_build_config_from_args_defaults_and_custom():
    default_args = Namespace(
        use_defaults=True,
        total_jobs=50,
        shard_count=4,
        jobs_per_tick=10,
        failure_injection_chance=0.05,
        failure_recovery_ticks=3,
        orchestrator_kill_tick=20,
        orchestrator_downtime=2,
        seed=42,
        workload=[],
        workload_mix="baseline=1.0",
    )
    config = build_config_from_args(default_args)
    assert config.total_jobs == 50
    assert config.failure_injection_chance == pytest.approx(0.05)
    assert config.orchestrator_kill_tick == 20

    custom_args = Namespace(
        use_defaults=False,
        total_jobs=30,
        shard_count=2,
        jobs_per_tick=5,
        failure_injection_chance=0.1,
        failure_recovery_ticks=2,
        orchestrator_kill_tick=10,
        orchestrator_downtime=1,
        seed=7,
        workload=["fast:0.9,2,0.5"],
        workload_mix="fast=1.0",
    )
    custom_config = build_config_from_args(custom_args)
    assert custom_config.workloads["fast"].success_probability == pytest.approx(0.9)
    assert custom_config.workload_mix == {"fast": 1.0}


def test_run_sharded_simulation_and_reports(tmp_path: Path):
    config = default_config(total_jobs=40, shard_count=3)
    config = replace(
        config,
        jobs_per_tick=100,
        failure_injection_chance=0.0,
        failure_recovery_ticks=1,
        orchestrator_kill_tick=5,
        orchestrator_downtime_ticks=1,
        random_seed=123,
    )

    result = run_sharded_simulation(config)
    assert result.total_jobs == 40
    assert result.failure_rate < 0.05
    result.assert_failure_rate(0.1)

    export_reports(result, tmp_path)
    jobs_csv = tmp_path / "jobs.csv"
    summary_json = tmp_path / "summary_detailed.json"
    throughput_plot = tmp_path / "throughput.png"

    assert jobs_csv.exists()
    assert summary_json.exists()
    assert throughput_plot.exists()
    assert "total_jobs" in summary_json.read_text()
