import pytest

from hgm_core.cmp import CMPAggregate, aggregate_cmp, merge_cmp_aggregates


def test_cmp_aggregate_add_and_mean():
    aggregate = CMPAggregate()
    aggregate.add(0.5)
    aggregate.add(1.0, weight=2.0)
    assert aggregate.total_weight == pytest.approx(3.0)
    assert aggregate.mean == pytest.approx((0.5 + 2.0) / 3.0)
    assert aggregate.variance >= 0.0


def test_aggregate_cmp_with_weights():
    aggregate = aggregate_cmp([0.1, 0.9], weights=[1.0, 3.0])
    assert aggregate.mean == pytest.approx((0.1 + 0.9 * 3) / 4)


def test_merge_cmp_aggregates():
    left = aggregate_cmp([0.2, 0.4])
    right = aggregate_cmp([0.6])
    merged = merge_cmp_aggregates([left, right])
    assert merged.total_weight == pytest.approx(3.0)
    assert merged.mean == pytest.approx((0.2 + 0.4 + 0.6) / 3)
