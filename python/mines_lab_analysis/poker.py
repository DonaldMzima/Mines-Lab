"""Standard 52-card five-card high poker and exact bounded draw enumeration.

This does not assume a 1win variant or provide bet/fold strategy without opponents.
"""

from collections import Counter
from itertools import combinations
from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, integer

RANKS = "23456789TJQKA"
SUITS = "CDHS"
CATEGORIES = ("HIGH CARD", "ONE PAIR", "TWO PAIR", "THREE OF A KIND", "STRAIGHT", "FLUSH", "FULL HOUSE", "FOUR OF A KIND", "STRAIGHT FLUSH")
DECK = tuple(rank+suit for rank in RANKS for suit in SUITS)


def parse_cards(value: Any) -> list[str]:
    if not isinstance(value, list) or len(value) != 5:
        raise ValueError("cards must contain exactly five distinct cards such as AS or TH")
    cards = []
    for card in value:
        if not isinstance(card, str):
            raise ValueError("cards must be strings")
        normalized = card.upper().replace("10", "T")
        if len(normalized) != 2 or normalized[0] not in RANKS or normalized[1] not in SUITS:
            raise ValueError("card must be a rank and suit, such as AS or TH")
        cards.append(normalized)
    if len(set(cards)) != 5:
        raise ValueError("cards must be unique")
    return cards


def hand_rank(cards: list[str]) -> tuple[int, ...]:
    """Lexicographically ordered category and kickers; wheel is five-high."""
    cards = parse_cards(cards)
    ranks = sorted((RANKS.index(card[0])+2 for card in cards), reverse=True)
    counts = Counter(ranks)
    groups = sorted(((count, rank) for rank, count in counts.items()), reverse=True)
    flush = len({card[1] for card in cards}) == 1
    unique = sorted(counts, reverse=True)
    straight = 5 if unique == [14, 5, 4, 3, 2] else unique[0] if len(unique) == 5 and unique[0]-unique[-1] == 4 else 0
    if straight and flush:
        return 8, straight
    if groups[0][0] == 4:
        return 7, groups[0][1], groups[1][1]
    if [group[0] for group in groups] == [3, 2]:
        return 6, groups[0][1], groups[1][1]
    if flush:
        return (5, *ranks)
    if straight:
        return 4, straight
    if groups[0][0] == 3:
        return (3, groups[0][1], *sorted((r for r in ranks if r != groups[0][1]), reverse=True))
    pairs = sorted((rank for rank, count in counts.items() if count == 2), reverse=True)
    if len(pairs) == 2:
        return 2, *pairs, next(rank for rank, count in counts.items() if count == 1)
    if pairs:
        return (1, pairs[0], *sorted((rank for rank, count in counts.items() if count == 1), reverse=True))
    return (0, *ranks)


def analyze(data: dict[str, Any]) -> GameSignal:
    if data.get("variant") != "five-card":
        raise ValueError("only standard five-card high poker is supported")
    cards = parse_cards(data.get("cards"))
    discarded = data.get("discardIndexes", [])
    if not isinstance(discarded, list) or len(discarded) > 2:
        raise ValueError("discardIndexes must contain zero, one or two indexes")
    discarded = [integer(value, "discardIndexes", 0, 4) for value in discarded]
    if len(set(discarded)) != len(discarded):
        raise ValueError("discardIndexes must be unique")
    if data.get("drawCount", 0) != 0:
        raise ValueError("specify discardIndexes, not drawCount")
    kept = [card for index, card in enumerate(cards) if index not in discarded]
    remaining = [card for card in DECK if card not in cards]
    counts: Counter[str] = Counter()
    for replacement in combinations(remaining, len(discarded)):
        counts[CATEGORIES[hand_rank(kept+list(replacement))[0]]] += 1
    total = sum(counts.values())
    rank = hand_rank(cards)
    return signal("poker", None, {"hand": CATEGORIES[rank[0]], "rank": list(rank),
                  "drawOutcomes": total, "categoryProbabilities": {category: counts[category]/total for category in CATEGORIES}},
                  verified=confirmed(data), explanation="Standard five-card high poker, one 52-card deck; exact replacement probabilities for the selected discards, no opponent prediction.")
