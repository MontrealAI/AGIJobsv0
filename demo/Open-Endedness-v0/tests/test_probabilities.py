import importlib.util
import pathlib
import random


MODULE_PATH = pathlib.Path(__file__).parents[1] / "omni_demo.py"


def load_module():
    spec = importlib.util.spec_from_file_location("omni_demo", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    import sys

    sys.modules[spec.name] = module
    spec.loader.exec_module(module)  # type: ignore[misc]
    return module


OMNI_DEMO = load_module()
LearningProgressMeter = OMNI_DEMO.LearningProgressMeter
OmniEngine = OMNI_DEMO.OmniEngine
MoIClient = OMNI_DEMO.MoIClient
baseline_tasks = OMNI_DEMO.baseline_tasks


def test_learning_progress_increases_with_success():
    meter = LearningProgressMeter(fast_beta=0.1, slow_beta=0.01)
    for _ in range(10):
        meter.update("task", 0.0)
    base_lp = meter.lp["task"]
    for _ in range(5):
        meter.update("task", 1.0)
    assert meter.lp["task"] > base_lp


def test_distribution_respects_interesting_flag():
    specs = baseline_tasks()
    prompt_path = MODULE_PATH.parent / "prompts" / "interestingness_prompt.md"
    engine = OmniEngine(specs, MoIClient(prompt_path))
    for spec in specs:
        engine.update_task_outcome(spec.task_id, 1.0 if spec.task_id == "cta_opt" else 0.0)
    engine.interesting["cta_opt"] = False
    distribution = engine.distribution()
    assert distribution["cta_opt"] < 0.05


def test_sample_matches_distribution():
    specs = baseline_tasks()
    prompt_path = MODULE_PATH.parent / "prompts" / "interestingness_prompt.md"
    engine = OmniEngine(specs, MoIClient(prompt_path))
    rng = random.Random(7)
    for _ in range(100):
        engine.update_task_outcome("cta_opt", 1.0)
    counts = {spec.task_id: 0 for spec in specs}
    for _ in range(500):
        task = engine.sample_task(rng)
        counts[task.task_id] += 1
    distribution = engine.distribution()
    total = sum(counts.values())
    for task_id, observed in counts.items():
        expected = distribution[task_id]
        if expected > 0.0:
            assert abs(observed / total - expected) < 0.1
