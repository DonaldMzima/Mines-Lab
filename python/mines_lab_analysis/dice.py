"""Exact inclusive integer-range dice threshold counts."""

from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, gross_ev, integer, number


def analyze(data: dict[str, Any]) -> GameSignal:
    low = integer(data.get("min"), "min", -1000000, 1000000)
    high = integer(data.get("max"), "max", low, low+1000000)
    threshold = integer(data.get("threshold"), "threshold", low, high)
    direction = data.get("direction")
    if direction not in ("under", "over"):
        raise ValueError("direction must be under or over, strict comparison")
    from math import ceil, floor
    winners = max(0, min(high - low + 1, ceil(threshold) - low if direction == "under" else high - floor(threshold)))
    probability = winners / (high - low + 1)
    payout = number(data.get("grossPayout"), "grossPayout", 0, 1000000000)
    return signal("dice", None, {"winningOutcomes": winners, "totalOutcomes": high - low + 1,
                  "winProbability": probability, **gross_ev(probability, payout)}, verified=confirmed(data),
                  explanation="Exact configured threshold probability and gross-payout EV; no next-roll prediction.")
