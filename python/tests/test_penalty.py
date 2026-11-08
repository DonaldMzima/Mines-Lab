import unittest
from fractions import Fraction

from mines_lab_analysis.penalty import series_analysis, turbo_score_probability


class PenaltyReferenceTests(unittest.TestCase):
    def test_turbo_probability_uses_documented_precision(self):
        self.assertEqual(turbo_score_probability(), Fraction(5333, 10000))

    def test_series_cumulative_probability_is_product_of_steps(self):
        steps = series_analysis()
        self.assertEqual(steps[1].cumulative_score_probability, steps[0].score_probability * steps[1].score_probability)

    def test_multiplier_diagnostic_is_not_payout_engine(self):
        step = series_analysis()[0]
        self.assertEqual(step.implied_gross_return, step.cumulative_score_probability * step.displayed_multiplier)
