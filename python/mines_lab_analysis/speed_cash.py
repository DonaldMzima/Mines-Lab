"""Speed & Cash per-race multiplier history, never a guess at either car's next crash."""
from typing import Any
from .crash import analyze_history
from .signals import GameSignal


def analyze(data: dict[str, Any]) -> GameSignal:
    # Import one consistent race/market; no car coordinate, state code or provider schema is inferred.
    return analyze_history("speed-cash", data)
