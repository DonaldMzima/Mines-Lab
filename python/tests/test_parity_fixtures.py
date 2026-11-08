"""Shared expected values, read by both languages without executing either engine here."""

import json
from pathlib import Path
import unittest

from mines_lab_analysis.registry import analyze_game


class SharedFixtureTests(unittest.TestCase):
    def test_all_game_reference_values(self):
        fixture = json.loads((Path(__file__).parent.parent / "fixtures" / "analysis-cases.json").read_text())
        self.assertEqual(len(fixture["cases"]), 15)
        for case in fixture["cases"]:
            result = analyze_game(case["gameId"], case["input"]).to_dict()
            for check in case["checks"]:
                with self.subTest(game=case["gameId"], path=check["pythonPath"]):
                    value = result
                    for key in check["pythonPath"]:
                        value = value[key]
                    if isinstance(check["value"], (int, float)):
                        self.assertAlmostEqual(value, check["value"], delta=fixture["tolerance"])
                    else:
                        self.assertEqual(value, check["value"])
