"""Reference combinatorial calculations for the 25-tile Mines board."""

from math import comb

TOTAL_TILES = 25
SUPPORTED_MINE_COUNTS = frozenset((2, 3, 5, 7))


def _validate(mines: int, picks: int) -> None:
    if mines not in SUPPORTED_MINE_COUNTS:
        raise ValueError("mines must be one of 2, 3, 5, or 7")
    if not isinstance(picks, int) or picks < 0 or picks > TOTAL_TILES - mines:
        raise ValueError("picks must be from 0 through the number of safe tiles")


def safe_selection_probability(mines: int, picks: int) -> float:
    """Probability that all selected tiles are safe under uniform mine placement."""
    _validate(mines, picks)
    return comb(TOTAL_TILES - picks, mines) / comb(TOTAL_TILES, mines)


def outcome_counts(mines: int, picks: int) -> tuple[int, int]:
    """Returns (all mine layouts, layouts surviving the selected picks)."""
    _validate(mines, picks)
    return comb(TOTAL_TILES, mines), comb(TOTAL_TILES - picks, mines)
