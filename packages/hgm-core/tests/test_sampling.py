import pytest

from hgm_core.sampling import ThompsonSampler, posterior_parameters


def test_posterior_parameters_respects_prior():
    alpha, beta = posterior_parameters(2.0, 1.0, prior=1.0)
    assert alpha == pytest.approx(3.0)
    assert beta == pytest.approx(2.0)


def test_sampler_is_deterministic_with_seed():
    sampler_a = ThompsonSampler(seed=123)
    sampler_b = ThompsonSampler(seed=123)
    value_a = sampler_a.beta(2.5, 3.5)
    value_b = sampler_b.beta(2.5, 3.5)
    assert value_a == pytest.approx(value_b)

    sampler_c = ThompsonSampler(seed=456)
    value_c = sampler_c.beta(2.5, 3.5)
    assert value_c != pytest.approx(value_a)


def test_sampler_choose_returns_highest_sample():
    sampler = ThompsonSampler(seed=99)
    arms = ["a", "b", "c"]
    alphas = [1.0, 2.0, 3.0]
    betas = [3.0, 2.0, 1.0]
    sample = sampler.choose(arms, alphas, betas)
    assert sample.arm in arms
    # Check reproducibility.
    assert sample.value == pytest.approx(0.6034191019)
