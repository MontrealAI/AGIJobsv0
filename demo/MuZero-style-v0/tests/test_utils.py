import pathlib
import sys

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from muzero_demo.utils import discounted_returns


def test_discounted_returns_basic():
    rewards = [1.0, 2.0, 3.0]
    discount = 0.5
    returns = discounted_returns(rewards, discount)
    assert returns == [1.0 + 2.0 * 0.5 + 3.0 * 0.25, 2.0 + 3.0 * 0.5, 3.0]
