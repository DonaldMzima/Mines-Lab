"""Exact strict-rank comparison from an explicitly supplied remaining distribution."""

from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, integer


def analyze(data: dict[str, Any]) -> GameSignal:
    counts = data.get("rankCounts")
    if not isinstance(counts, list) or len(counts) != 13:
        raise ValueError("rankCounts must give 13 remaining counts, Ace low through King")
    counts = [integer(value, "rankCounts", 0, 416) for value in counts]
    total = sum(counts)
    if total == 0:
        raise ValueError("remaining deck cannot be empty")
    ties = data.get("ties")
    if ties not in ("lose", "push", "win"):
        raise ValueError("ties must be lose, push or win")
    if data.get("currentRank") is None:
        return signal("hilo", None, {}, unavailable=True, explanation="Enter the current rank, Ace=1 through King=13.")
    rank = integer(data.get("currentRank"), "currentRank", 1, 13)
    equal = counts[rank - 1] / total
    higher = sum(counts[rank:]) / total
    lower = sum(counts[:rank - 1]) / total
    win_higher = higher + (equal if ties == "win" else 0)
    win_lower = lower + (equal if ties == "win" else 0)
    action = "HIGHER" if win_higher > win_lower else "LOWER" if win_lower > win_higher else None
    return signal("hilo", action, {"higherProbability": higher, "lowerProbability": lower,
                  "equalProbability": equal, "higherWinProbability": win_higher, "lowerWinProbability": win_lower,
                  "pushProbability": equal if ties == "push" else 0, "remainingCards": total,
                  "criterion": "largest chance of a winning rank, not maximum expected payout"}, verified=confirmed(data),
                  explanation="Configured remaining-card counts; Ace low. Recommendation compares win probabilities only.")
