"""Aviator historical multiplier analysis; published RTP implies no next result."""
from typing import Any
from .crash import analyze_history
from .signals import GameSignal


def analyze(data: dict[str, Any]) -> GameSignal:
    return analyze_history("aviator", data)
