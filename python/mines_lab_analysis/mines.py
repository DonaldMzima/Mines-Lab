"""Reference combinatorial calculations for the 25-tile Mines board."""

from math import comb
from typing import Any

from .signals import GameSignal, signal
from .validation import confirmed, integer

TOTAL_TILES = 25
SUPPORTED_MINE_COUNTS = frozenset((2, 3, 5, 7))


def _validate(mines: int, picks: int) -> None:
    if isinstance(mines, bool) or not isinstance(mines, int) or mines not in SUPPORTED_MINE_COUNTS:
        raise ValueError("mines must be one of 2, 3, 5, or 7")
    if isinstance(picks, bool) or not isinstance(picks, int) or picks < 0 or picks > TOTAL_TILES - mines:
        raise ValueError("picks must be from 0 through the number of safe tiles")


def safe_selection_probability(mines: int, picks: int) -> float:
    """Probability that all selected tiles are safe under uniform mine placement."""
    _validate(mines, picks)
    return comb(TOTAL_TILES - picks, mines) / comb(TOTAL_TILES, mines)


def outcome_counts(mines: int, picks: int) -> tuple[int, int]:
    """Returns (all mine layouts, layouts surviving the selected picks)."""
    _validate(mines, picks)
    return comb(TOTAL_TILES, mines), comb(TOTAL_TILES - picks, mines)


def analyze(data: dict[str, Any]) -> GameSignal:
    mines = integer(data.get("mines"), "mines", 1, 24)
    picks = integer(data.get("picks"), "picks", 1, 25-mines)
    probability = comb(25-picks, mines)/comb(25, mines)
    return signal("mines", None, {"mines": mines, "picks": picks, "survivalProbability": probability,
                  "nextSafeProbability": (25-mines)/25}, verified=confirmed(data),
                  summary=f"{probability:.2%} chance to survive {picks} picks",
                  explanation="Uniform 25-tile mine placement. No tile has a known advantage; existing web suggestions remain experimental.")
