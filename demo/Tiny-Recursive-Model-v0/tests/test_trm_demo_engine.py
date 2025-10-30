from dataclasses import replace
from pathlib import Path

from trm_demo.config import DemoSettings, load_settings
from trm_demo.engine import TrmEngine


def test_training_report_returns_metrics(tmp_path):
    settings = load_settings(Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml")
    training = replace(
        settings.training,
        epochs=1,
        dataset_size=64,
        batch_size=16,
        validation_split=0.2,
        checkpoint_path=str(tmp_path / "demo.pt"),
    )
    tweaked_settings = DemoSettings(
        trm=settings.trm,
        training=training,
        thermostat=settings.thermostat,
        sentinel=settings.sentinel,
        ledger=settings.ledger,
    )
    engine = TrmEngine(tweaked_settings)
    report = engine.train()
    assert report.epochs_run >= 1
    assert report.train_loss > 0
    assert report.val_loss >= 0
    assert report.best_checkpoint.exists()
