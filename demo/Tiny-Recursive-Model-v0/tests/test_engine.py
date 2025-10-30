from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))

from trm_demo.config import load_settings
from trm_demo.dataset import OperationSequenceDataset
from trm_demo.engine import TrmEngine


def test_inference_emits_reasonable_metadata():
    settings = load_settings(
        Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml"
    )
    engine = TrmEngine(settings)
    dataset = OperationSequenceDataset(
        size=1,
        vocab_path=Path(__file__).resolve().parent.parent / "data" / "operations_vocab.json",
        seed=7,
    )
    sample = dataset[0]
    result = engine.infer(sample, use_ema=False)

    assert 0 < result.steps_used <= settings.trm.max_inner_steps * settings.trm.max_outer_steps
    assert result.logits.shape[0] == settings.trm.max_outer_steps
    assert 0 <= result.confidence <= 1
