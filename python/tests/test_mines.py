import unittest

from mines_lab_analysis.mines import outcome_counts, safe_selection_probability


class MinesReferenceTests(unittest.TestCase):
    def test_zero_picks_always_survive(self):
        self.assertEqual(safe_selection_probability(3, 0), 1.0)

    def test_probability_matches_combinatorial_counts(self):
        total, surviving = outcome_counts(5, 3)
        self.assertEqual(safe_selection_probability(5, 3), surviving / total)

    def test_rejects_unsupported_mine_count(self):
        with self.assertRaises(ValueError):
            safe_selection_probability(4, 1)
