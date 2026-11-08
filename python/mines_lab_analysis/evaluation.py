"""Prospective prediction evaluation primitives; no model is supplied here."""

from dataclasses import dataclass
from datetime import datetime
from math import isfinite, sqrt


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
    if isinstance(prediction.baseline_probability, bool) or not isinstance(prediction.baseline_probability, (int, float)) or not isfinite(prediction.baseline_probability) or not 0 <= prediction.baseline_probability <= 1:
        raise ValueError("baseline_probability must be between 0 and 1")
    if prediction.created_at.tzinfo is None or outcome_at.tzinfo is None:
        raise ValueError("prediction and outcome timestamps must include timezones")
    if not prediction.round_id or not prediction.game or not prediction.model_version:
        raise ValueError("prediction needs game, model_version and round_id")
    if not isinstance(actual_event, str) or not actual_event:
        raise ValueError("actual_event must be a nonempty string")
    if outcome_at <= prediction.created_at:
        raise ValueError("outcome must occur after the prediction was recorded")
    return EvaluatedPrediction(prediction, actual_event, outcome_at, prediction.predicted_event == actual_event)


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float, float] | None:
    if isinstance(total, bool) or isinstance(successes, bool) or not isinstance(total, int) or not isinstance(successes, int) or total < 0:
        raise ValueError("counts must be nonnegative integers")
    if isinstance(z, bool) or not isinstance(z, (int, float)) or not isfinite(z) or z <= 0:
        raise ValueError("z must be finite and positive")
    if successes < 0 or successes > total:
        raise ValueError("successes must be between 0 and total")
    if total == 0:
        return None
    if successes < 0 or successes > total:
        raise ValueError("successes must be between 0 and total")
    rate = successes / total
    denominator = 1 + z * z / total
    center = (rate + z * z / (2 * total)) / denominator
    radius = z * sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator
    return max(0, center - radius), min(1, center + radius)


@dataclass(frozen=True)
class CompletedOutcome:
    game: str
    round_id: str
    actual_event: str
    completed_at: datetime
    data_source: str
    provenance_verified: bool = False


def pair_prediction(prediction: PredictionRecord, outcome: CompletedOutcome) -> EvaluatedPrediction:
    """Require exact game, round, provenance class and prospective chronology."""
    if prediction.game != outcome.game or prediction.round_id != outcome.round_id:
        raise ValueError("prediction and outcome game/round IDs must match")
    if prediction.data_source != outcome.data_source:
        raise ValueError("prediction and outcome data sources must match")
    return evaluate_prediction(prediction, outcome.actual_event, outcome.completed_at)


def performance(records: list[EvaluatedPrediction]) -> dict[str, object]:
    """Retrospective descriptive evaluation, never a guarantee of future accuracy."""
    if not records:
        return {"sampleSize": 0, "successRate": None, "wilson95": None,
                "baselineExpectedRate": None, "validatedAccuracy": None}
    groups = {(record.prediction.game, record.prediction.model_version, record.prediction.data_source) for record in records}
    if len(groups) != 1:
        raise ValueError("evaluate each game, model version and provenance class independently")
    seen: set[str] = set()
    for record in records:
        checked = evaluate_prediction(record.prediction, record.actual_event, record.outcome_at)
        if checked.correct != record.correct:
            raise ValueError("stored success flag disagrees with the outcome")
        round_id = record.prediction.round_id
        if round_id in seen:
            raise ValueError("duplicate evaluated round")
        seen.add(round_id or "")
    successes = sum(record.correct for record in records)
    baseline = sum(record.prediction.baseline_probability for record in records)/len(records)
    return {"sampleSize": len(records), "successes": successes, "failures": len(records)-successes,
            "successRate": successes/len(records), "wilson95": wilson_interval(successes, len(records)),
            "baselineExpectedRate": baseline, "differenceFromBaseline": successes/len(records)-baseline,
            "validatedAccuracy": None, "limitation": "Chronology and matching are validated; imported provenance and predictive advantage are not independently established."}
