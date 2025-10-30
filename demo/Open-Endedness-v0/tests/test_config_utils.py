from __future__ import annotations

from pathlib import Path
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config_utils import (
    apply_cohort_overrides,
    load_config,
    owner_disabled_tasks,
    parse_scalar,
    set_config_value,
    set_owner_disabled_tasks,
)


def test_parse_scalar_variants() -> None:
    assert parse_scalar("true") is True
    assert parse_scalar("False") is False
    assert parse_scalar("3.5") == 3.5
    assert parse_scalar("7") == 7
    assert parse_scalar('["a", "b"]') == ["a", "b"]
    assert parse_scalar("unchanged") == "unchanged"


def test_set_config_value_nested() -> None:
    sample: dict[str, object] = {}
    set_config_value(sample, "thermostat.roi_floor", 3.2)
    set_config_value(sample, "owner.paused", True)
    assert sample["thermostat"]["roi_floor"] == 3.2  # type: ignore[index]
    assert sample["owner"]["paused"] is True  # type: ignore[index]


def test_apply_cohort_overrides() -> None:
    base = {
        "thermostat": {"roi_floor": 2.0},
        "cohorts": {
            "enterprise": {
                "overrides": {"thermostat.roi_floor": 3.5, "sentinel.task_roi_floor": 1.4}
            }
        },
        "sentinel": {"task_roi_floor": 1.0},
    }
    updated = apply_cohort_overrides(base, "enterprise")
    assert updated["thermostat"]["roi_floor"] == 3.5  # type: ignore[index]
    assert updated["sentinel"]["task_roi_floor"] == 1.4  # type: ignore[index]


def test_owner_disabled_tasks_roundtrip(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    data = {
        "owner": {"disabled_tasks": ["discount_optimizer"]},
        "cohorts": {"alpha": {"overrides": {"owner.disabled_tasks": ["matchmaking_ai"]}}},
    }
    config_path.write_text(yaml.safe_dump(data))
    loaded = load_config(config_path, cohort="alpha")
    assert owner_disabled_tasks(loaded.resolved) == ["matchmaking_ai"]
    set_owner_disabled_tasks(loaded.raw, ["cta_refinement", "matchmaking_ai"])
    loaded.path.write_text(yaml.safe_dump(loaded.raw))
    reloaded = load_config(config_path)
    assert owner_disabled_tasks(reloaded.resolved) == ["cta_refinement", "matchmaking_ai"]
