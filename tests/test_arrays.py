import numpy as np

from nt2gui.data.arrays import even_sample, finite_list, minmax_indices


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
