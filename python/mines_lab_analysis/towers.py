"""Configured per-row survival; no hidden hazard coordinates are inferred."""

from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, gross_ev, integer, number


def analyze(data: dict[str, Any]) -> GameSignal:
    rows = data.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 32:
        raise ValueError("rows must contain 1–32 configured layouts")
    probabilities = []
    cumulative = 1.0
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("each row must specify tiles and hazards")
        tiles = integer(row.get("tiles"), "tiles", 2, 100)
        hazards = integer(row.get("hazards"), "hazards", 0, tiles)
        cumulative *= (tiles-hazards)/tiles
        probabilities.append(cumulative)
    steps = integer(data.get("steps"), "steps", 1, len(rows))
    details: dict[str, Any] = {"survivalProbability": probabilities[steps-1], "cumulativeProbabilities": probabilities}
    if data.get("grossPayout") is not None:
        payout = number(data["grossPayout"], "grossPayout", 0, 1000000000)
        details.update(gross_ev(probabilities[steps-1], payout))
    return signal("towers", None, details, verified=confirmed(data),
                  explanation="Uniform hazards, one pick per independent row; hazard positions remain unknown.")
