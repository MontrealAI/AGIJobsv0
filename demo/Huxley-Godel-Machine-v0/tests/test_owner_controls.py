import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from hgm_v0_demo.owner_controls import OwnerControls


def test_from_mapping_parses_strings() -> None:
    controls = OwnerControls.from_mapping(
        {
            "pause_all": "true",
            "pause_expansions": "False",
            "pause_evaluations": "on",
            "max_actions": "5",
            "note": "Manual override",
        }
    )
    assert controls.pause_all is True
    assert controls.pause_expansions is False
    assert controls.pause_evaluations is True
    assert controls.max_actions == 5
    assert controls.note == "Manual override"


def test_should_block_new_actions_respects_cap() -> None:
    controls = OwnerControls(max_actions=3)
    assert controls.should_block_new_actions(0) is False
    assert controls.should_block_new_actions(2) is False
    assert controls.should_block_new_actions(3) is True


def test_describe_mentions_cap_when_triggered() -> None:
    controls = OwnerControls(max_actions=2, note="Owner note")
    description = controls.describe(consumed_actions=2, cap_triggered=True)
    assert "2" in description
    assert "Owner note" in description


def test_to_mapping_omits_defaults() -> None:
    controls = OwnerControls()
    mapping = controls.to_mapping()
    assert mapping["pause_all"] is False
    assert "max_actions" not in mapping
    assert "note" not in mapping


def test_to_cli_args_only_includes_changes() -> None:
    controls = OwnerControls(pause_all=True, max_actions=7, note="Emergency throttle")
    args = controls.to_cli_args()
    assert "--set owner_controls.pause_all=true" in args
    assert "--set owner_controls.max_actions=7" in args
    assert any(arg.endswith('"Emergency throttle"') for arg in args)
    assert all("pause_expansions" not in arg for arg in args)
