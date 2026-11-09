"""Provider-probability validation and prospective football forecast evaluation."""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any


MODEL_VERSION = "mines-lab-football-evaluation-1"
SUPPORTED_MARKETS = {"result", "double-chance", "btts", "goals-15", "goals-25", "goals-35", "correct-score"}
RESULT_LABELS = {"home", "draw", "away"}


class FootballAnalysisError(ValueError):
    """Raised when a football request does not match the shared JSON contract."""


def _record(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise FootballAnalysisError(f"{label} must be an object.")
    return value


def _aware_datetime(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise FootballAnalysisError(f"{label} must be an ISO timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise FootballAnalysisError(f"{label} must be an ISO timestamp.") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise FootballAnalysisError(f"{label} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def _market_outcomes(value: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not 1 <= len(value) <= 100:
        raise FootballAnalysisError(f"{label} must contain between 1 and 100 outcomes.")
    outcomes: list[dict[str, Any]] = []
    labels: set[str] = set()
    for outcome in value:
        item = _record(outcome, f"{label} outcome")
        name, probability = item.get("label"), item.get("probability")
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            raise FootballAnalysisError(f"{label} contains an invalid outcome label.")
        if isinstance(probability, bool) or not isinstance(probability, (int, float)) or not math.isfinite(probability) or not 0 <= probability <= 100:
            raise FootballAnalysisError(f"{label} contains a probability outside 0-100 percent.")
        normalized = name.strip().casefold()
        if normalized in labels:
            raise FootballAnalysisError(f"{label} contains duplicate outcome labels.")
        labels.add(normalized)
        outcomes.append({"label": name.strip(), "probability": float(probability)})
    return outcomes


def validate_markets(raw_markets: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_markets, list) or len(raw_markets) > 20:
        raise FootballAnalysisError("markets must be a list of at most 20 supported markets.")
    markets: list[dict[str, Any]] = []
    keys: set[str] = set()
    for raw_market in raw_markets:
        market = _record(raw_market, "market")
        key, name = market.get("key"), market.get("name")
        if not isinstance(key, str) or key not in SUPPORTED_MARKETS:
            continue
        if key in keys:
            raise FootballAnalysisError("markets contains a duplicate market.")
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            raise FootballAnalysisError("A supported market is missing its display name.")
        outcomes = _market_outcomes(market.get("outcomes"), key)
        labels = {item["label"].casefold() for item in outcomes}
        total = sum(item["probability"] for item in outcomes)
        if key == "result" and (labels != RESULT_LABELS or abs(total - 100) > 1.5):
            raise FootballAnalysisError("The full-time result market must contain home, draw, and away probabilities summing to 100 percent.")
        if key == "btts" and (labels != {"yes", "no"} or abs(total - 100) > 1.5):
            raise FootballAnalysisError("The both-teams-to-score market must contain yes and no probabilities summing to 100 percent.")
        if key.startswith("goals-") and (labels != {"over", "under"} or abs(total - 100) > 1.5):
            raise FootballAnalysisError("A goals market must contain over and under probabilities summing to 100 percent.")
        if key == "double-chance" and (len(outcomes) != 3 or abs(total - 100) > 1.5):
            raise FootballAnalysisError("The double-chance market must contain three probabilities summing to 100 percent.")
        if key == "correct-score" and (len(outcomes) < 2 or abs(total - 100) > 2.0):
            raise FootballAnalysisError("The correct-score distribution must contain at least two outcomes summing to 100 percent.")
        keys.add(key)
        markets.append({"key": key, "name": name.strip(), "outcomes": outcomes})
    return markets


def _primary(markets: list[dict[str, Any]]) -> dict[str, Any] | None:
    priority = ("result", "btts", "goals-15", "goals-25", "goals-35", "double-chance", "correct-score")
    for key in priority:
        market = next((item for item in markets if item["key"] == key), None)
        if market and market["outcomes"]:
            outcome = max(market["outcomes"], key=lambda item: item["probability"])
            return {
                "marketKey": market["key"],
                "market": market["name"],
                "outcome": outcome["label"],
                "probability": outcome["probability"],
            }
    return None


def validate_provider_forecast(payload: Any, now: datetime | None = None) -> dict[str, Any]:
    data = _record(payload, "request")
    fixture_id = data.get("fixtureId")
    if isinstance(fixture_id, bool) or not isinstance(fixture_id, int) or fixture_id <= 0:
        raise FootballAnalysisError("fixtureId must be a positive integer.")
    kickoff = _aware_datetime(data.get("kickoff"), "kickoff")
    if not isinstance(data.get("predictable"), bool):
        raise FootballAnalysisError("predictable must be a boolean.")
    if data["predictable"] is not True:
        return {"status": "unavailable", "modelVersion": MODEL_VERSION, "primaryOutcome": None, "markets": [], "message": "The provider does not mark this fixture as predictable."}
    current_time = now or datetime.now(timezone.utc)
    if kickoff <= current_time.astimezone(timezone.utc):
        return {"status": "unavailable", "modelVersion": MODEL_VERSION, "primaryOutcome": None, "markets": [], "message": "Predictions are only validated before kickoff."}
    markets = validate_markets(data.get("markets"))
    if not markets:
        return {"status": "unavailable", "modelVersion": MODEL_VERSION, "primaryOutcome": None, "markets": [], "message": "No supported provider probability markets were returned."}
    return {
        "status": "validated",
        "modelVersion": MODEL_VERSION,
        "primaryOutcome": _primary(markets),
        "markets": markets,
        "message": "Provider probabilities passed contract and distribution checks; this is not a guarantee or independent accuracy claim.",
    }


def _result_market(forecast: dict[str, Any]) -> dict[str, Any] | None:
    try:
        markets = validate_markets(forecast.get("markets"))
    except FootballAnalysisError:
        return None
    return next((market for market in markets if market["key"] == "result"), None)


def _probability_map(market: dict[str, Any]) -> dict[str, float]:
    return {outcome["label"].casefold(): outcome["probability"] / 100 for outcome in market["outcomes"]}


def _actual_result(result: dict[str, Any]) -> str | None:
    home, away = result.get("home"), result.get("away")
    if any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in (home, away)):
        return None
    return "home" if home > away else "away" if away > home else "draw"


def _bookmaker_snapshots(forecast: dict[str, Any], kickoff: datetime) -> list[dict[str, Any]]:
    raw = forecast.get("referenceOdds")
    if not isinstance(raw, list):
        return []
    snapshots = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            observed = _aware_datetime(item.get("retrievedAt"), "referenceOdds.retrievedAt")
        except FootballAnalysisError:
            continue
        values = item.get("decimalOdds")
        if observed >= kickoff or not isinstance(values, dict) or not isinstance(item.get("bookmaker"), str):
            continue
        if any(isinstance(values.get(label), bool) or not isinstance(values.get(label), (int, float)) or not math.isfinite(values[label]) or values[label] <= 1 for label in ("home", "draw", "away")):
            continue
        implied = {label: 1 / float(values[label]) for label in ("home", "draw", "away")}
        total = sum(implied.values())
        if total <= 0:
            continue
        snapshots.append({
            "bookmaker": item["bookmaker"],
            "probabilities": {label: probability / total for label, probability in implied.items()},
            "decimalOdds": {label: float(values[label]) for label in ("home", "draw", "away")},
        })
    return snapshots


def evaluate_forecasts(records: Any, now: datetime | None = None) -> dict[str, Any]:
    if not isinstance(records, list) or len(records) > 500:
        raise FootballAnalysisError("records must be a list of at most 500 forecast records.")
    settled: list[dict[str, Any]] = []
    for row in records:
        if not isinstance(row, dict) or not isinstance(row.get("forecast"), dict) or not isinstance(row.get("result"), dict):
            continue
        forecast, result = row["forecast"], row["result"]
        market = _result_market(forecast)
        if market is None:
            continue
        try:
            kickoff = _aware_datetime(forecast.get("kickoff"), "forecast.kickoff")
            generated = _aware_datetime(forecast.get("generatedAt"), "forecast.generatedAt")
            completed = _aware_datetime(result.get("completedAt"), "result.completedAt")
        except FootballAnalysisError:
            continue
        if generated >= kickoff or completed <= kickoff or (now is not None and completed > now.astimezone(timezone.utc)):
            continue
        actual = _actual_result(result)
        if actual is None:
            continue
        probabilities = _probability_map(market)
        predicted = max(("home", "draw", "away"), key=lambda label: probabilities[label])
        brier = sum((probabilities[label] - (1.0 if label == actual else 0.0)) ** 2 for label in ("home", "draw", "away")) / 3
        snapshots = _bookmaker_snapshots(forecast, kickoff)
        settled.append({
            "actual": actual,
            "predicted": predicted,
            "confidence": probabilities[predicted],
            "brier": brier,
            "bookmaker": snapshots[0] if snapshots else None,
            "odds": snapshots,
        })
    count = len(settled)
    bins = []
    for lower in (0.0, 0.2, 0.4, 0.6, 0.8):
        upper = lower + 0.2
        bucket = [item for item in settled if lower <= item["confidence"] < upper or upper == 1.0 and item["confidence"] == 1.0]
        bins.append({
            "lower": lower,
            "upper": upper,
            "count": len(bucket),
            "meanConfidence": sum(item["confidence"] for item in bucket) / len(bucket) if bucket else None,
            "empiricalAccuracy": sum(item["actual"] == item["predicted"] for item in bucket) / len(bucket) if bucket else None,
        })
    bookmaker_records = [item for item in settled if item["bookmaker"]]
    bookmaker_brier = None
    if bookmaker_records:
        bookmaker_brier = sum(sum(
            (item["bookmaker"]["probabilities"][label] - (1.0 if item["actual"] == label else 0.0)) ** 2
            for label in ("home", "draw", "away")
        ) / 3 for item in bookmaker_records) / len(bookmaker_records)
    betting_records = [item for item in settled if item["odds"]]
    net_units = 0.0
    for item in betting_records:
        top = item["predicted"]
        best_odds = max(snapshot["decimalOdds"][top] for snapshot in item["odds"])
        net_units += best_odds - 1 if item["actual"] == top else -1
    return {
        "modelVersion": MODEL_VERSION,
        "evaluatedFixtures": count,
        "topOutcomeAccuracy": sum(item["actual"] == item["predicted"] for item in settled) / count if count else None,
        "multiclassBrierScore": sum(item["brier"] for item in settled) / count if count else None,
        "uniformBaselineBrierScore": 2 / 9 if count else None,
        "bookmakerBrierScore": bookmaker_brier,
        "bookmakerEvaluatedFixtures": len(bookmaker_records),
        "hypotheticalTopOutcomeBets": len(betting_records),
        "hypotheticalOneUnitNetReturn": round(net_units, 6) if betting_records else None,
        "calibrationBins": bins,
        "disclaimer": "Chronological, saved pre-kickoff provider forecasts only. Bookmaker and one-unit outcomes use recorded pre-kickoff odds; neither metric establishes future accuracy or profitability.",
    }
