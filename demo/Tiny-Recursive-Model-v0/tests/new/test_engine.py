import torch

from trm_demo.config import TinyRecursiveModelConfig
from trm_demo.engine import TRMEngine


def test_trm_inference_halting_behaviour():
    config = TinyRecursiveModelConfig(inner_cycles=4, outer_steps=2, max_recursions=6)
    engine = TRMEngine(config)

    class DummyDataset(torch.utils.data.Dataset):
        def __len__(self):
            return 8

        def __getitem__(self, idx):
            return {
                "features": torch.zeros(config.input_dim),
                "label": torch.tensor(0, dtype=torch.long),
                "halt_target": torch.tensor(1, dtype=torch.long),
            }

    engine.train_model(DummyDataset(), epochs=1, batch_size=4)
    sample = torch.zeros(config.input_dim)
    result = engine.infer(sample.unsqueeze(0))
    assert result.steps_used <= config.total_possible_steps
    assert len(result.halt_probabilities) <= config.total_possible_steps

