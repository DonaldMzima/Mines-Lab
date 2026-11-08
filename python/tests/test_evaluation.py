import unittest
from datetime import datetime, timedelta, timezone

from mines_lab_analysis.evaluation import CompletedOutcome, PredictionRecord, pair_prediction, performance, wilson_interval


class ProspectiveEvaluationTests(unittest.TestCase):
    def prediction(self):
        return PredictionRecord("hilo", "model-1", "import", "HIGHER", datetime(2026, 1, 1, tzinfo=timezone.utc), .5, "round-1")

    def test_requires_matching_round_and_prospective_time(self):
        prediction = self.prediction()
        valid = CompletedOutcome("hilo", "round-1", "HIGHER", prediction.created_at+timedelta(seconds=1), "import")
        self.assertTrue(pair_prediction(prediction, valid).correct)
        for invalid in [CompletedOutcome("hilo", "round-2", "HIGHER", valid.completed_at, "import"),
                        CompletedOutcome("hilo", "round-1", "HIGHER", prediction.created_at, "import"),
                        CompletedOutcome("mines", "round-1", "HIGHER", valid.completed_at, "import")]:
            with self.assertRaises(ValueError):
                pair_prediction(prediction, invalid)

    def test_duplicate_evaluations_do_not_inflate_accuracy(self):
        prediction = self.prediction()
        record = pair_prediction(prediction, CompletedOutcome("hilo", "round-1", "HIGHER", prediction.created_at+timedelta(seconds=1), "import"))
        with self.assertRaises(ValueError):
            performance([record, record])

    def test_report_separates_sample_rate_from_validated_accuracy(self):
        prediction = self.prediction()
        record = pair_prediction(prediction, CompletedOutcome("hilo", "round-1", "LOWER", prediction.created_at+timedelta(seconds=1), "import"))
        result = performance([record])
        self.assertEqual(result["successRate"], 0)
        self.assertEqual(result["baselineExpectedRate"], .5)
        self.assertIsNone(result["validatedAccuracy"])

    def test_wilson_known_fixture_and_invalid_counts(self):
        lower, upper = wilson_interval(50, 100)
        self.assertAlmostEqual(lower, .4038315303659956)
        self.assertAlmostEqual(upper, .5961684696340044)
        self.assertIsNone(wilson_interval(0, 0))
        for successes, total in [(1, 0), (0, -1), (True, 10), (2, 1)]:
            with self.assertRaises(ValueError):
                wilson_interval(successes, total)
