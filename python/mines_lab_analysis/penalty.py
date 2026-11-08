"""Reference calculations from the supplied Penalty in-game rules."""

from dataclasses import dataclass
from fractions import Fraction

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
