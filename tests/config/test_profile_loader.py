import json
from pathlib import Path

import pytest

from config import CONFIG_ROOT, load_config
from services.sentinel.config import load_config as load_sentinel_config


@pytest.fixture(autouse=True)
def _reset_sentinel_cache():
    load_sentinel_config.cache_clear()
    yield
    load_sentinel_config.cache_clear()


def _read_json(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def test_defaults_unchanged_when_profile_disabled(monkeypatch):
    monkeypatch.delenv('AGIALPHA_PROFILE', raising=False)
    sentinel = load_config('sentinel')
    baseline = _read_json(CONFIG_ROOT / 'sentinel.json')

    assert sentinel['budgetCap'] == baseline['budgetCap']
    assert 'controlTargets' not in sentinel


def test_profile_overrides_apply_when_enabled(monkeypatch):
    monkeypatch.setenv('AGIALPHA_PROFILE', 'agialpha')
    sentinel = load_config('sentinel')
    assert sentinel['controlTargets']['roi'] == pytest.approx(2.0)


def test_falsey_profile_values_disable_overrides(monkeypatch):
    monkeypatch.setenv('AGIALPHA_PROFILE', '0')
    sentinel = load_config('sentinel')
    assert 'controlTargets' not in sentinel


def test_hgm_profile_only(monkeypatch):
    monkeypatch.delenv('AGIALPHA_PROFILE', raising=False)
    assert load_config('hgm') == {}

    monkeypatch.setenv('AGIALPHA_PROFILE', 'agialpha')
    hgm_profile = load_config('hgm')
    assert hgm_profile['budget']['max'] == pytest.approx(250000.0)
    assert set(hgm_profile['agents']['priors']) == {'analysis', 'execution', 'validation'}


def test_sentinel_loader_honours_profile(monkeypatch):
    monkeypatch.delenv('AGIALPHA_PROFILE', raising=False)
    config_default = load_sentinel_config()
    assert config_default.control_targets == {}

    load_sentinel_config.cache_clear()
    monkeypatch.setenv('AGIALPHA_PROFILE', 'agialpha')
    config_profile = load_sentinel_config()
    assert config_profile.control_targets['roi'] == pytest.approx(2.0)
