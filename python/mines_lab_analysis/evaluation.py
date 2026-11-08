"""Prospective prediction evaluation primitives; no model is supplied here."""

from dataclasses import dataclass
from datetime import datetime
from math import sqrt


@dataclass(frozen=True)
class PredictionRecord:
    game: str
    model_version: str
    data_source: str
    predicted_event: str
    created_at: datetime
    baseline_probability: float
    round_id: str | None = None


@dataclass(frozen=True)
class EvaluatedPrediction:
    prediction: PredictionRecord
    actual_event: str
    outcome_at: datetime
    correct: bool


def evaluate_prediction(prediction: PredictionRecord, actual_event: str, outcome_at: datetime) -> EvaluatedPrediction:
    if not 0 <= prediction.baseline_probability <= 1:
        raise ValueError("baseline_probability must be between 0 and 1")
    if outcome_at <= prediction.created_at:
        raise ValueError("outcome must occur after the prediction was recorded")
    return EvaluatedPrediction(prediction, actual_event, outcome_at, prediction.predicted_event == actual_event)


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float, float] | None:
    if total == 0:
        return None
    if successes < 0 or successes > total:
        raise ValueError("successes must be between 0 and total")
    rate = successes / total
    denominator = 1 + z * z / total
    center = (rate + z * z / (2 * total)) / denominator
    radius = z * sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator
    return max(0, center - radius), min(1, center + radius)
