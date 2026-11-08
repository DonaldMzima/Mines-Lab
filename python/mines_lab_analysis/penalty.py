"""Reference calculations from the supplied Penalty in-game rules."""

from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from .signals import GameSignal, signal
from .validation import integer

PENALTY_RTP = Fraction(94, 100)
TURBO_SCORE_PROBABILITY = Fraction(5333, 10000)
SERIES_SCORE_PROBABILITIES = (
    Fraction(5333, 10000),
    Fraction(5333, 10000),
    Fraction(4667, 10000),
    Fraction(4667, 10000),
    Fraction(3333, 10000),
)
SERIES_MULTIPLIERS = (Fraction(181, 100), Fraction(341, 100), Fraction(730, 100), Fraction(1565, 100), Fraction(4697, 100))


@dataclass(frozen=True)
class SeriesStep:
    step: int
    score_probability: Fraction
    save_probability: Fraction
    cumulative_score_probability: Fraction
    displayed_multiplier: Fraction
    implied_gross_return: Fraction


def turbo_score_probability() -> Fraction:
    return TURBO_SCORE_PROBABILITY


def series_analysis() -> tuple[SeriesStep, ...]:
    cumulative = Fraction(1, 1)
    steps: list[SeriesStep] = []
    for index, (score, multiplier) in enumerate(zip(SERIES_SCORE_PROBABILITIES, SERIES_MULTIPLIERS), start=1):
        cumulative *= score
        steps.append(SeriesStep(
            step=index,
            score_probability=score,
            save_probability=1 - score,
            cumulative_score_probability=cumulative,
            displayed_multiplier=multiplier,
            # Diagnostic only: full provider cash-out/payout mechanics remain unknown.
            implied_gross_return=cumulative * multiplier,
        ))
    return tuple(steps)


def analyze(data: dict[str, Any]) -> GameSignal:
    mode = data.get("mode")
    if mode not in ("turbo", "series"):
        raise ValueError("mode must be turbo or series")
    step = integer(data.get("step", 1), "step", 1, 1 if mode == "turbo" else 5)
    row = series_analysis()[step-1]
    details = {"scoringProbability": float(TURBO_SCORE_PROBABILITY if mode == "turbo" else row.score_probability),
               "cumulativeProbability": float(TURBO_SCORE_PROBABILITY if mode == "turbo" else row.cumulative_score_probability),
               "publishedRtp": float(PENALTY_RTP), "directionAvailable": False}
    if mode == "series":
        details.update(displayedMultiplier=float(row.displayed_multiplier), multiplierDiagnostic=float(row.implied_gross_return))
    return signal("penalty", None, details, unavailable=True, mode=mode,
                  summary=f"Scoring chance: {details['scoringProbability']:.2%}",
                  explanation="Supplied in-game score probabilities. Direction, shooting grid, outcome.catches semantics and full payout rules remain unverified; multiplier product is diagnostic only.",
                  source="user-supplied Penalty in-game rules")
