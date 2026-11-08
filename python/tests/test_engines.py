"""Independent mathematical fixtures. Written for explicit operator-approved execution."""

import unittest
from datetime import datetime, timedelta, timezone
from math import comb, nan

from mines_lab_analysis.blackjack import hand_value
from mines_lab_analysis.crash import validate_history
from mines_lab_analysis.poker import hand_rank
from mines_lab_analysis.registry import ENGINES, analyze_game, default_input


class EngineContractTests(unittest.TestCase):
    def test_all_fifteen_engines_are_registered(self):
        self.assertEqual(len(ENGINES), 15)
        for game in ENGINES:
            result = analyze_game(game, default_input(game)).to_dict()
            self.assertEqual(result["gameId"], game)
            self.assertIn(result["status"], ("validated", "experimental", "unavailable"))
            self.assertIsNone(result["action"])
            self.assertTrue(result["generatedAt"])

    def test_nonobject_input_is_explicitly_unavailable(self):
        result = analyze_game("dice", [])
        self.assertEqual(result.status, "unavailable")
        self.assertIn("validationErrors", result.details)

    def test_defaults_are_deep_copied(self):
        first = default_input("hilo")
        first["rankCounts"][0] = 0
        self.assertEqual(default_input("hilo")["rankCounts"][0], 4)

    def test_unknown_game_rejected(self):
        with self.assertRaises(ValueError):
            analyze_game("unknown", {})


class BlackjackTests(unittest.TestCase):
    def request(self, cards, dealer, **changes):
        data = default_input("blackjack")
        data.update(cards=cards, dealer=dealer, rulesConfirmed=True, **changes)
        return analyze_game("blackjack", data)

    def test_multiple_aces_are_adjusted(self):
        self.assertEqual(hand_value(["A", "A", "9"]), (21, True))
        self.assertEqual(hand_value(["A", "A", "9", "K"]), (21, False))

    def test_supported_chart_cells(self):
        fixtures = [(["8", "8"], "A", "SPLIT"), (["9", "9"], "7", "STAND"),
                    (["A", "7"], "4", "DOUBLE"), (["A", "7"], "A", "HIT"),
                    (["5", "6"], "A", "HIT"), (["5", "6"], "10", "DOUBLE"),
                    (["10", "2"], "3", "HIT"), (["10", "2"], "4", "STAND")]
        for cards, dealer, action in fixtures:
            self.assertEqual(self.request(cards, dealer).action, action)

    def test_double_fallback_and_unconfirmed_state(self):
        self.assertEqual(self.request(["A", "7"], "4", canDouble=False).action, "STAND")
        self.assertEqual(self.request(["5", "6"], "10", canDouble=False).action, "HIT")
        data = default_input("blackjack")
        data.update(cards=["8", "8"], dealer="6")
        self.assertIsNone(analyze_game("blackjack", data).action)

    def test_terminal_hand_has_no_action(self):
        self.assertIsNone(self.request(["K", "Q", "2"], "6").action)

    def test_split_ace_permissions_and_ordinary_split_hands(self):
        complete = self.request(["A", "6"], "6", afterSplit=True, splitAces=True)
        self.assertIsNone(complete.action)
        self.assertTrue(complete.details["handComplete"])
        self.assertEqual(self.request(["6", "A"], "6", afterSplit=True, splitAces=False).action, "DOUBLE")
        self.assertEqual(self.request(["6", "7"], "6", afterSplit=True, splitAces=True).status, "unavailable")

    def test_unknown_action_permissions_never_invent_double_or_split(self):
        result = analyze_game("blackjack", {"cards": ["5", "6"], "dealer": "10", "profile": "multi-deck-s17-das", "rulesConfirmed": True})
        self.assertEqual(result.action, "HIT")


class ProbabilityTests(unittest.TestCase):
    def test_hilo_uses_supplied_remaining_deck_and_ties(self):
        result = analyze_game("hilo", {"currentRank": 8, "rankCounts": [4]*13, "ties": "lose", "rulesConfirmed": True})
        self.assertAlmostEqual(result.details["higherProbability"], 5/13)
        self.assertAlmostEqual(result.details["lowerProbability"], 7/13)
        self.assertEqual(result.action, "LOWER")

    def test_dice_strict_threshold_not_inclusive(self):
        data = default_input("dice")
        result = analyze_game("dice", data)
        self.assertEqual(result.details["winProbability"], .5)
        self.assertAlmostEqual(result.details["netExpectedValue"], -.05)
        data.update(threshold=49, direction="over")
        self.assertEqual(analyze_game("dice", data).details["winningOutcomes"], 50)

    def test_coinflip_does_not_pick_a_side(self):
        result = analyze_game("coinflip", default_input("coinflip"))
        self.assertIsNone(result.action)
        self.assertEqual(result.details["headsProbability"], .5)
        self.assertAlmostEqual(result.details["heads"]["netExpectedValue"], -.05)

    def test_coinflip_accepts_distinct_side_payouts(self):
        data = default_input("coinflip")
        data.update(headsGrossPayout=1.8, tailsGrossPayout=2.1, rulesConfirmed=True)
        result = analyze_game("coinflip", data)
        self.assertAlmostEqual(result.details["heads"]["netExpectedValue"], -.1)
        self.assertAlmostEqual(result.details["tails"]["netExpectedValue"], .05)
        self.assertIsNone(result.action)

    def test_coinflip_missing_one_side_uses_common_payout(self):
        data = default_input("coinflip")
        data["headsGrossPayout"] = 2
        result = analyze_game("coinflip", data)
        self.assertEqual(result.details["heads"]["netExpectedValue"], 0)
        self.assertAlmostEqual(result.details["tails"]["netExpectedValue"], -.05)

    def test_coinflip_without_payouts_has_probability_only(self):
        result = analyze_game("coinflip", {"headsProbability": .5})
        self.assertEqual(result.details["heads"], {})
        self.assertEqual(result.details["tails"], {})

    def test_plinko_distribution_and_ev(self):
        result = analyze_game("plinko", {"rows": 2, "rightProbability": .5, "payouts": [2, 0, 2]})
        self.assertEqual(result.details["slotProbabilities"], [.25, .5, .25])
        self.assertEqual(result.details["grossExpectedReturn"], 1)

    def test_keno_exact_probability_and_normalization(self):
        data = {"pool": 80, "drawn": 20, "selections": [1, 2, 3, 4, 5], "payouts": {}}
        result = analyze_game("keno", data)
        probabilities = result.details["hitProbabilities"]
        self.assertAlmostEqual(sum(probabilities.values()), 1)
        self.assertAlmostEqual(probabilities["5"], comb(75, 15)/comb(80, 20))
        self.assertEqual(result.details["expectedHits"], 1.25)

    def test_towers_survival_multiplies_rows(self):
        data = {"rows": [{"tiles": 3, "hazards": 1}, {"tiles": 4, "hazards": 1}], "steps": 2, "grossPayout": 2}
        result = analyze_game("towers", data)
        self.assertEqual(result.details["survivalProbability"], .5)
        self.assertEqual(result.details["netExpectedValue"], 0)

    def test_boolean_and_nan_inputs_are_rejected(self):
        for value in (True, nan):
            data = default_input("dice")
            data["max"] = value
            self.assertEqual(analyze_game("dice", data).status, "unavailable")

    def test_duplicate_keno_numbers_rejected(self):
        data = default_input("keno")
        data["selections"] = [1, 1]
        self.assertEqual(analyze_game("keno", data).status, "unavailable")


class PokerTests(unittest.TestCase):
    def test_wheel_is_lower_than_six_high_straight(self):
        wheel = hand_rank(["AS", "2H", "3C", "4D", "5S"])
        six_high = hand_rank(["2S", "3H", "4C", "5D", "6S"])
        self.assertEqual(wheel, (4, 5))
        self.assertLess(wheel, six_high)

    def test_kickers_and_category_order(self):
        self.assertLess(hand_rank(["2S", "2H", "AC", "KD", "QS"]), hand_rank(["3S", "3H", "4C", "5D", "6S"]))
        self.assertEqual(hand_rank(["AS", "KS", "QS", "JS", "TS"]), (8, 14))

    def test_exact_one_card_draw_to_flush(self):
        result = analyze_game("poker", {"variant": "five-card", "cards": ["AS", "KS", "QS", "JS", "2H"], "discardIndexes": [4]})
        probabilities = result.details["categoryProbabilities"]
        self.assertEqual(result.details["drawOutcomes"], 47)
        self.assertAlmostEqual(probabilities["FLUSH"]+probabilities["STRAIGHT FLUSH"], 9/47)
        self.assertAlmostEqual(sum(probabilities.values()), 1)

    def test_discard_indexes_bounded_and_distinct(self):
        data = {"variant": "five-card", "cards": ["AS", "KS", "QS", "JS", "2H"], "discardIndexes": [0, 0]}
        self.assertEqual(analyze_game("poker", data).status, "unavailable")


class CrashTests(unittest.TestCase):
    def records(self):
        now = datetime.now(timezone.utc)-timedelta(hours=1)
        return [{"roundId": str(index), "completedAt": (now+timedelta(seconds=index)).isoformat(timespec="milliseconds"), "multiplier": multiplier, "source": "import"}
                for index, multiplier in enumerate([1, 2, 3, 4])]

    def test_every_crash_game_uses_its_own_identity(self):
        for game in ("lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash"):
            result = analyze_game(game, {"history": self.records(), "target": 2})
            self.assertEqual(result.gameId, game)
            self.assertEqual(result.details["historicalAtOrAboveRate"], .75)
            self.assertEqual(result.details["historicalStrictlyAboveRate"], .5)
            self.assertIsNone(result.action)

    def test_rejects_duplicate_rounds_and_fake_provider_provenance(self):
        records = self.records()
        with self.assertRaises(ValueError):
            validate_history(records+[records[0]])
        records[0]["source"] = "provider"
        with self.assertRaises(ValueError):
            validate_history(records)

    def test_rejects_future_completed_result(self):
        records = self.records()
        records[0]["completedAt"] = (datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec="milliseconds")
        with self.assertRaises(ValueError):
            validate_history(records)
