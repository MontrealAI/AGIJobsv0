import pathlib
import sys

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from muzero_demo.configuration import load_demo_config


def test_load_demo_config(tmp_path):
    config_path = tmp_path / "demo.yaml"
    config_path.write_text(
        """
environment:
  max_jobs: 3
  starting_budget: 90.0
planner:
  num_simulations: 20
training:
  batch_size: 4
thermostat:
  min_simulations: 6
  max_simulations: 32
sentinel:
  alert_mae: 1.0
""",
        encoding="utf-8",
    )

    demo = load_demo_config(config_path)
    assert demo.environment.max_jobs == 3
    assert demo.training.batch_size == 4
    assert demo.planner.num_simulations == 20
    assert demo.thermostat.min_simulations == 6
    assert demo.sentinel.alert_mae == 1.0
