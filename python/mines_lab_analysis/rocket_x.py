"""1win Rocket X crash-history analysis; exact distribution and settlement unverified."""
from typing import Any
from .crash import analyze_history
from .signals import GameSignal


def analyze(data: dict[str, Any]) -> GameSignal:
    return analyze_history("rocket-x", data)
