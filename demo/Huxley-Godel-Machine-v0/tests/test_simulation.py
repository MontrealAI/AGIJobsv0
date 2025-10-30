from __future__ import annotations

from pathlib import Path

from demo.huxley_godel_machine_v0.simulator import run_simulation


def _config_path() -> Path:
    return Path("demo/Huxley-Godel-Machine-v0/config/hgm_demo_config.json")


def test_simulation_is_deterministic(tmp_path) -> None:
    first = run_simulation(
        config_path=_config_path(),
        seed=9,
        output_dir=tmp_path / "first",
        ui_artifact_path=tmp_path / "first" / "comparison.json",
    )
    second = run_simulation(
        config_path=_config_path(),
        seed=9,
        output_dir=tmp_path / "second",
        ui_artifact_path=tmp_path / "second" / "comparison.json",
    )

    assert first.hgm.summary.profit == second.hgm.summary.profit
    assert first.baseline.summary.profit == second.baseline.summary.profit
    assert first.summary_table == second.summary_table


def test_hgm_outperforms_baseline(tmp_path) -> None:
    report = run_simulation(
        config_path=_config_path(),
        seed=11,
        output_dir=tmp_path / "run",
        ui_artifact_path=tmp_path / "run" / "comparison.json",
    )
    assert report.hgm.summary.profit > report.baseline.summary.profit
    assert report.hgm.summary.steps >= report.baseline.summary.steps
    assert report.comparison_artifact_path.exists()


