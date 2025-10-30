from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from demo.open_endedness_v0 import ModelOfInterestingness, OmniCurriculumEngine


@pytest.fixture()
def engine() -> OmniCurriculumEngine:
    descriptions = {
        "cta_opt": "Optimise premium CTA",
        "discount": "Optimise hiring discount",
        "match": "Autonomous talent matching",
    }
    rng = random.Random(5)
    return OmniCurriculumEngine(descriptions, rng=rng, moi_client=ModelOfInterestingness())


def test_learning_progress_increases_with_success(engine: OmniCurriculumEngine) -> None:
    for _ in range(10):
        engine.update_task_outcome("cta_opt", 0.0)
    base_lp = engine.tasks["cta_opt"].learning_progress
    for _ in range(5):
        engine.update_task_outcome("cta_opt", 1.0)
    assert engine.tasks["cta_opt"].learning_progress > base_lp


def test_distribution_respects_disabled_tasks(engine: OmniCurriculumEngine) -> None:
    engine.update_task_outcome("cta_opt", 1.0)
    engine.update_task_outcome("discount", 1.0)
    engine.refresh_partition(force=True)
    engine.set_task_disabled("cta_opt", True)
    distribution = engine.distribution
    assert distribution["cta_opt"] == pytest.approx(0.0)
    assert distribution["discount"] > distribution["cta_opt"]


def test_sample_matches_distribution(engine: OmniCurriculumEngine) -> None:
    for _ in range(20):
        engine.update_task_outcome("cta_opt", 1.0)
    engine.refresh_partition(force=True)
    counts = {task_id: 0 for task_id in engine.task_descriptions}
    trials = 500
    for _ in range(trials):
        task_id = engine.sample_task()
        counts[task_id] += 1
    for task_id, count in counts.items():
        expected = engine.distribution[task_id]
        if expected > 0:
            observed = count / trials
            assert pytest.approx(observed, rel=0.2) == expected
