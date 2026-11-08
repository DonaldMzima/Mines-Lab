"""Total-dependent multi-deck S17/DAS basic strategy, no surrender, peek game.

Reference: Blackjack Apprenticeship author's S17 chart (September 2024).
This profile must be confirmed against the actual table; no 1win mapping is claimed.
"""

from typing import Any
from .signals import GameSignal, signal
from .validation import boolean, confirmed

RANKS = {str(n): n for n in range(2, 11)} | {"T": 10, "J": 10, "Q": 10, "K": 10, "A": 11}


def card_value(card: Any) -> int:
    if not isinstance(card, str) or card.upper() not in RANKS:
        raise ValueError("cards must contain ranks 2–10, T, J, Q, K or A")
    return RANKS[card.upper()]


def hand_value(cards: list[str]) -> tuple[int, bool]:
    values = [card_value(card) for card in cards]
    total = sum(values)
    aces = values.count(11)
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total, aces > 0


def analyze(data: dict[str, Any]) -> GameSignal:
    if data.get("profile") != "multi-deck-s17-das":
        raise ValueError("only multi-deck-s17-das, peek, no surrender is supported")
    cards = data.get("cards")
    if not isinstance(cards, list) or len(cards) > 21:
        raise ValueError("cards must contain at most 21 known ranks")
    values = [card_value(card) for card in cards]
    dealer = None if data.get("dealer") in (None, "") else card_value(data.get("dealer"))
    can_double_input = boolean(data.get("canDouble", False), "canDouble")
    can_split_input = boolean(data.get("canSplit", False), "canSplit")
    after_split = boolean(data.get("afterSplit", False), "afterSplit")
    split_aces = boolean(data.get("splitAces", False), "splitAces")
    verified = confirmed(data)
    if not cards or dealer is None:
        return signal("blackjack", None, {}, unavailable=True, explanation="Enter your cards and the dealer upcard.")
    if len(cards) < 2:
        raise ValueError("at least two known player cards are required")
    total, soft = hand_value(cards)
    can_double = can_double_input and len(cards) == 2
    can_split = can_split_input and len(cards) == 2
    if split_aces:
        if not after_split or not any(card_value(card) == 11 for card in cards) or len(cards) != 2:
            raise ValueError("a split-ace hand must be afterSplit with an ace and exactly one extra card")
        return signal("blackjack", None, {"total": total, "soft": soft, "handComplete": True}, verified=verified,
                      explanation="This profile permits one extra card and no hitting split aces; resplitting needs separate table rules.", summary="Split-ace hand complete")
    if total > 21:
        return signal("blackjack", None, {"total": total, "soft": soft, "terminal": "bust"}, verified=verified,
                      unavailable=True, explanation="Hand is bust; no legal action remains.")
    if total == 21:
        return signal("blackjack", None, {"total": total, "soft": soft, "terminal": "21"}, verified=verified,
                      unavailable=True, explanation="Hand is complete; no decision remains.")
    if after_split and 11 in values and "splitAces" not in data:
        return signal("blackjack", None, {"total": total, "soft": soft}, unavailable=True,
                      explanation="Confirm whether this is a split-ace hand before requesting an action.")
    pair = values[0] if can_split and values[0] == values[1] else None
    split = pair in (11, 8) or (pair == 9 and dealer in (2, 3, 4, 5, 6, 8, 9)) or (pair == 7 and 2 <= dealer <= 7) or (pair == 6 and 2 <= dealer <= 6) or (pair == 4 and dealer in (5, 6)) or (pair in (2, 3) and 2 <= dealer <= 7)
    action = "SPLIT" if split else "HIT"
    if not split:
        if soft:
            double = (total in (13, 14) and dealer in (5, 6)) or (total in (15, 16) and 4 <= dealer <= 6) or (total in (17, 18) and 3 <= dealer <= 6)
            action = "DOUBLE" if double and can_double else "STAND" if total >= 19 or (total == 18 and dealer in (2, 3, 4, 5, 6, 7, 8)) else "HIT"
        else:
            double = (total == 9 and 3 <= dealer <= 6) or (total == 10 and 2 <= dealer <= 9) or (total == 11 and 2 <= dealer <= 10)
            action = "DOUBLE" if double and can_double else "STAND" if total >= 17 or (13 <= total <= 16 and 2 <= dealer <= 6) or (total == 12 and 4 <= dealer <= 6) else "HIT"
    return signal("blackjack", action, {"total": total, "soft": soft, "profile": "multi-deck-s17-das", "configuredAction": action,
                  "assumptions": ["4–8 decks", "dealer stands soft 17", "double any initial two", "DAS", "dealer peek", "no surrender"]}, verified=verified,
                  explanation="Basic strategy for the configured S17/DAS profile; no guaranteed outcome.")
