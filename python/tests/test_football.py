import unittest
from datetime import datetime, timedelta, timezone

from mines_lab_analysis.football import FootballAnalysisError, evaluate_forecasts, validate_provider_forecast


class FootballAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 3, 1, tzinfo=timezone.utc)
        self.forecast = {
            "fixtureId": 123,
            "kickoff": (self.now + timedelta(days=1)).isoformat(),
            "predictable": True,
            "markets": [
                {"key": "result", "name": "Full-time result", "outcomes": [
                    {"label": "Home", "probability": 50},
                    {"label": "Draw", "probability": 25},
                    {"label": "Away", "probability": 25},
                ]},
                {"key": "btts", "name": "Both teams to score", "outcomes": [
                    {"label": "Yes", "probability": 40},
                    {"label": "No", "probability": 60},
                ]},
            ],
        }

    def test_selects_provider_result_without_inventing_probabilities(self):
        result = validate_provider_forecast(self.forecast, self.now)
        self.assertEqual(result["status"], "validated")
        self.assertEqual(result["primaryOutcome"], {
            "marketKey": "result", "market": "Full-time result", "outcome": "Home", "probability": 50.0,
        })

    def test_unpredictable_or_started_fixtures_have_no_recommendation(self):
        unavailable = dict(self.forecast, predictable=False)
        self.assertIsNone(validate_provider_forecast(unavailable, self.now)["primaryOutcome"])
        started = dict(self.forecast, kickoff=(self.now - timedelta(minutes=1)).isoformat())
        self.assertIsNone(validate_provider_forecast(started, self.now)["primaryOutcome"])

    def test_rejects_bad_probability_distributions_and_duplicate_labels(self):
        invalid = dict(self.forecast)
        invalid["markets"] = [{"key": "result", "name": "Full-time result", "outcomes": [
            {"label": "Home", "probability": 50}, {"label": "Draw", "probability": 25},
            {"label": "Away", "probability": 10},
        ]}]
        with self.assertRaises(FootballAnalysisError):
            validate_provider_forecast(invalid, self.now)
        invalid["markets"][0]["outcomes"][2] = {"label": "Home", "probability": 25}
        with self.assertRaises(FootballAnalysisError):
            validate_provider_forecast(invalid, self.now)

    def test_evaluates_only_saved_prospective_forecasts_and_compares_baselines(self):
        forecast = dict(self.forecast, generatedAt=self.now.isoformat())
        records = [{
            "forecast": forecast,
            "result": {"home": 2, "away": 1, "completedAt": (self.now + timedelta(days=2)).isoformat()},
        }]
        evaluation = evaluate_forecasts(records, self.now + timedelta(days=3))
        self.assertEqual(evaluation["evaluatedFixtures"], 1)
        self.assertEqual(evaluation["topOutcomeAccuracy"], 1)
        self.assertAlmostEqual(evaluation["multiclassBrierScore"], (0.5**2 + 0.25**2 + 0.25**2) / 3)
        self.assertAlmostEqual(evaluation["uniformBaselineBrierScore"], 2 / 9)

    def test_excludes_forecasts_recorded_after_kickoff(self):
        forecast = dict(self.forecast, generatedAt=(self.now + timedelta(days=2)).isoformat())
        record = {"forecast": forecast, "result": {"home": 2, "away": 1, "completedAt": (self.now + timedelta(days=3)).isoformat()}}
        self.assertEqual(evaluate_forecasts([record], self.now + timedelta(days=4))["evaluatedFixtures"], 0)


if __name__ == "__main__":
    unittest.main()
