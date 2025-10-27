from __future__ import annotations

from typing import Tuple

import pytest

from simulation import montecarlo


def _format(result: Tuple[float, float, float]) -> Tuple[float, float, float]:
    burn, fee, avg = result
    return round(burn, 2), round(fee, 2), round(avg, 4)


def test_sweep_parameters_is_deterministic() -> None:
    results = montecarlo.sweep_parameters(iterations=10)
    assert len(results) == 30
    checkpoints = [0, 1, 5, 6, 29]
    rounded = [_format(results[idx]) for idx in checkpoints]
    assert rounded == [
        (0.0, 0.0, 0.0),
        (0.0, 0.02, 1.0),
        (0.0, 0.1, 4.0),
        (0.05, 0.0, 1.0),
        (0.2, 0.1, 10.0),
    ]


def test_parameter_search_returns_best_result(capsys: pytest.CaptureFixture[str]) -> None:
    best = montecarlo.parameter_search(iterations=10)
    out = capsys.readouterr().out
    assert "burn_pct, fee_pct, dissipation" in out
    results = montecarlo.sweep_parameters(iterations=10)
    expected = min(results, key=lambda entry: entry[2])
    assert best == expected
