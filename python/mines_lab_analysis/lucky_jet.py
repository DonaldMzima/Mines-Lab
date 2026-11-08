"""Lucky Jet historical multiplier analysis; no next-flight prediction."""
from typing import Any
from .crash import analyze_history
from .signals import GameSignal


def analyze(data: dict[str, Any]) -> GameSignal:
    return analyze_history("lucky-jet", data)
