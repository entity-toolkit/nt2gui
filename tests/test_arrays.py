import numpy as np
import pytest

from nt2gui.data.arrays import (
    block_factor,
    block_mean,
    even_sample,
    finite_list,
    minmax_indices,
)


def test_finite_list_rounds_and_nulls_non_finite():
    assert finite_list([0.1234567891, np.nan, np.inf, 1e-30]) == [0.1234568, None, None, 1e-30]
    assert finite_list([0.1234567891], digits=None) == [0.1234567891]


def test_even_sample_keeps_ends_and_respects_the_cap():
    values = np.arange(10_000)
    sample = even_sample(values, 101)
    assert len(sample) == 101 and sample[0] == 0 and sample[-1] == 9_999
    assert even_sample(values[:50], 101) is not None and len(even_sample(values[:50], 101)) == 50


class TestMinmaxIndices:
    def test_short_lines_are_kept_whole(self):
        assert minmax_indices([np.arange(10.0)], 3000).tolist() == list(range(10))

    def test_long_lines_fit_the_budget_and_keep_extremes_and_ends(self):
        rng = np.random.default_rng(0)
        line = rng.normal(size=1_000_000)
        line[123_457] = 50.0  # a single-cell spike
        line[987_654] = -50.0
        keep = minmax_indices([line], 3000)

        assert len(keep) <= 3000
        assert {0, 999_999, 123_457, 987_654} <= set(keep.tolist())
        assert np.all(np.diff(keep) > 0)  # sorted, no repeats

    def test_budget_is_shared_between_lines(self):
        lines = [np.sin(np.linspace(0, 50, 100_000) + k) for k in range(3)]
        keep = minmax_indices(lines, 3000)
        assert len(keep) <= 3000
        for line in lines:
            assert line[keep].max() == line.max() and line[keep].min() == line.min()

    def test_all_nan_buckets_do_not_break_it(self):
        line = np.full(100_000, np.nan)
        line[50_000] = 1.0
        keep = minmax_indices([line], 1000)
        assert 50_000 in keep and len(keep) <= 1000


class TestBlockMean:
    def test_factor(self):
        assert block_factor(4096, 4096) == 1
        assert block_factor(4097, 4096) == 2
        assert block_factor(10_000, 4096) == 3

    def test_averages_blocks_including_a_partial_one(self):
        values = np.arange(10, dtype=float).reshape(2, 5)
        np.testing.assert_allclose(
            block_mean(values, (1, 2)), [[0.5, 2.5, 4], [5.5, 7.5, 9]]
        )
        np.testing.assert_allclose(block_mean(values, (2, 5)), [[4.5]])

    def test_ignores_nans_and_keeps_all_nan_blocks(self):
        values = np.array([[1.0, np.nan, np.nan, np.nan]])
        np.testing.assert_allclose(block_mean(values, (1, 2)), [[1.0, np.nan]])

    @pytest.mark.parametrize("with_nan", [False, True])
    def test_matches_a_reference_mean_with_partial_blocks(self, with_nan):
        values = np.random.default_rng(0).random((7, 5))
        if with_nan:
            values[0, 0] = values[6, 3] = np.nan
        reference = [
            [np.nanmean(values[i : i + 3, j : j + 2]) for j in range(0, 5, 2)]
            for i in range(0, 7, 3)
        ]
        np.testing.assert_allclose(block_mean(values, (3, 2)), reference)

    def test_factor_one_is_a_no_op(self):
        values = np.arange(6.0).reshape(2, 3)
        np.testing.assert_array_equal(block_mean(values, (1, 1)), values)
