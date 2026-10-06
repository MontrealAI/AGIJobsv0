import json
import math
import pytest
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.cli import build_config, parse_args
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega.cli import _resolve_duration
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme.cli import build_arg_parser, _build_config_from_args


def test_explicit_defaults_override_config_and_are_not_overwritten(tmp_path):
    file = tmp_path / 'config.json'
    file.write_text(json.dumps({'max_cycles': 99, 'checkpoint_path': 'other.json', 'heartbeat_interval_seconds': 33, 'enable_simulation': True, 'auto_policy_actions': False}))
    args = parse_args(['--config', str(file), '--cycles', '5', '--checkpoint', 'checkpoint.json', '--heartbeat-interval=5', '--no-sim', '--auto-policy-actions'])
    config = build_config(args)
    assert config.max_cycles == 5
    assert str(config.checkpoint_path) == 'checkpoint.json'
    assert config.heartbeat_interval_seconds == 5
    assert config.enable_simulation is False
    assert config.auto_policy_actions is True


def test_build_config_does_not_mutate_caller_overrides():
    overrides = {'max_cycles': 12}
    build_config(parse_args(['--cycles', '2']), overrides)
    assert overrides == {'max_cycles': 12}


@pytest.mark.parametrize('value', ['nan', 'inf', '-inf'])
def test_nonfinite_business_timing_rejected(value):
    with pytest.raises(ValueError, match='finite'):
        build_config(parse_args(['--heartbeat-interval=' + value]))


@pytest.mark.parametrize('value', [-1, math.nan, math.inf, -math.inf])
def test_invalid_omega_duration_rejected(value):
    with pytest.raises(ValueError):
        _resolve_duration(value)


@pytest.mark.parametrize('args', [['--cycles', '-1'], ['--validators', '0'], ['--mission_hours', 'nan'], ['--simulation_tick_seconds', '0'], ['--default_stake_ratio', '1.1']])
def test_supreme_rejects_invalid_configuration_before_creating_paths(args, tmp_path):
    output = tmp_path / 'must-not-exist' / 'checkpoint.json'
    namespace = build_arg_parser().parse_args(args + ['--checkpoint_path', str(output)])
    with pytest.raises(ValueError):
        _build_config_from_args(namespace)
    assert not output.parent.exists()


def test_foundation_default_is_finite_and_invalid_cycles_fail():
    from importlib import import_module
    module = import_module('demo.Kardashev-II-Omega-Grade-Alpha-AGI-Business-3.kardashev_ii_omega_grade_alpha_agi_business_3.__main__')
    args = module.parse_args([])
    data = module.load_config(args.config)
    assert module.build_config(data, args).max_cycles == 5
    args.max_cycles = -1
    with pytest.raises(ValueError, match='max_cycles'):
        module.build_config(data, args)


@pytest.mark.parametrize('cycles,hours', [(-1, None), (3, float('nan')), (3, -1)])
def test_ultra_invalid_launch_overrides_fail(cycles, hours):
    from types import SimpleNamespace
    from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.cli import _apply_launch_overrides, UltraConfigError
    config = SimpleNamespace(orchestrator=SimpleNamespace(), mission=SimpleNamespace())
    args = SimpleNamespace(cycles=cycles, runtime_hours=hours, no_sim=False, checkpoint=None)
    with pytest.raises(UltraConfigError):
        _apply_launch_overrides(config, args)
