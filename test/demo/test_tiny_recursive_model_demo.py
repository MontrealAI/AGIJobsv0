"""Regression tests for the Tiny Recursive Model demo."""
from __future__ import annotations

from dataclasses import asdict, replace
from pathlib import Path
from typing import Dict
import sys
import tempfile

DEMO_ROOT = Path(__file__).resolve().parents[2] / "demo" / "Tiny-Recursive-Model-v0"
if str(DEMO_ROOT) not in sys.path:
    sys.path.append(str(DEMO_ROOT))

import torch

from trm_demo.config import DemoSettings, load_settings
from trm_demo.dataset import OperationSequenceDataset
from trm_demo.engine import InferenceResult, TrmEngine
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel
from trm_demo.simulation import run_simulation
from trm_demo.thermostat import Thermostat

DEFAULT_CONFIG = DEMO_ROOT / "config" / "default_trm_config.yaml"
VOCAB_PATH = DEMO_ROOT / "data" / "operations_vocab.json"


def _load_default_settings() -> DemoSettings:
    settings = load_settings(DEFAULT_CONFIG)
    # Force CPU execution for test determinism regardless of host CUDA support.
    settings.trm = replace(settings.trm, device="cpu")
    return settings


def _build_engine(settings: DemoSettings) -> TrmEngine:
    return TrmEngine(settings)


def _make_sample(engine: TrmEngine) -> Dict[str, torch.Tensor]:
    dataset = OperationSequenceDataset(size=1, vocab_path=VOCAB_PATH, seed=7)
    sample = dataset[0]
    # Align tensor device with engine to prevent device mismatches during inference.
    return {key: value.to(engine.device) for key, value in sample.items() if key in {"start", "steps", "length"}}


def test_trm_halting_converges_quickly() -> None:
    settings = _load_default_settings()
    engine = _build_engine(settings)
    result: InferenceResult = engine.infer(_make_sample(engine))

    max_steps = settings.trm.max_outer_steps * settings.trm.max_inner_steps
    assert 1 <= result.steps_used <= max_steps
    assert 0 <= result.prediction < settings.trm.answer_dim


def test_simulation_roi_advantage() -> None:
    settings = _load_default_settings()
    settings.sentinel = replace(
        settings.sentinel,
        min_roi=0.0,
        max_daily_cost=1e9,
        max_latency_ms=10_000,
        max_recursions=10_000,
        max_consecutive_failures=100,
    )
    with tempfile.TemporaryDirectory() as tmpdir:
        settings.training = replace(
            settings.training,
            dataset_size=128,
            epochs=2,
            patience=2,
            batch_size=32,
            checkpoint_path=str(Path(tmpdir) / "trm-sim-checkpoint.pt"),
        )
        engine = _build_engine(settings)
        engine.train()
    thermostat = Thermostat(settings.thermostat)
    sentinel = Sentinel(settings.sentinel)
    ledger = EconomicLedger(**asdict(settings.ledger))

    summary = run_simulation(
        engine=engine,
        thermostat=thermostat,
        sentinel=sentinel,
        ledger=ledger,
        settings=settings,
        trials=24,
        seed=2025,
    )

    assert not summary.sentinel_triggered
    assert summary.trm.trials == 24
    assert summary.trm.total_cost > 0
    assert summary.trm.roi() >= 0
    assert len(summary.trm.steps_distribution) == 24


def test_training_updates_parameters(tmp_path: Path) -> None:
    settings = _load_default_settings()
    settings.training = replace(
        settings.training,
        dataset_size=64,
        epochs=2,
        patience=2,
        checkpoint_path=str(tmp_path / "trm-checkpoint.pt"),
        batch_size=32,
    )
    engine = _build_engine(settings)

    before_state = {key: tensor.clone() for key, tensor in engine.model.state_dict().items()}
    report = engine.train()
    after_state = engine.model.state_dict()

    assert report.epochs_run >= 1
    assert report.best_checkpoint.exists()
    assert any(not torch.equal(before_state[name], after_state[name]) for name in before_state)
