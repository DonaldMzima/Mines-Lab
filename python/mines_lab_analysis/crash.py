"""Retrospective crash history only: no inferred RNG, RTP-to-distribution shortcut, or forecast."""

from datetime import datetime, timezone
from statistics import mean, median
from typing import Any
from .contracts import GameId
from .evaluation import wilson_interval
from .signals import GameSignal, signal
from .validation import confirmed, gross_ev, number, timestamp

PROFILES: dict[str, dict[str, str]] = {
    "lucky-jet": {"name": "Lucky Jet", "evidence": "1win public game description: rising multiplier, crash", "url": "https://1win.com/"},
    "rocket-queen": {"name": "Rocket Queen", "evidence": "1win public game description: crash", "url": "https://1win.com/"},
    "rocket-x": {"name": "Rocket X", "evidence": "1win public casino description: in-house multiplier crash game; exact distribution and settlement remain unverified", "url": "https://1win.com/casino?provider=Pragmatic+Play"},
    "aviator": {"name": "Aviator", "evidence": "SPRIBE public game description: crash; RTP is not a survival distribution", "url": "https://www.spribe.co/games/aviator"},
    "speed-cash": {"name": "Speed & Cash", "evidence": "1win public description: two-car multiplier race; per-race multiplier history only", "url": "https://1win.com/"},
}


def validate_history(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 5000:
        raise ValueError("history must contain at most 5000 completed multiplier records")
    seen: set[str] = set()
    now = datetime.now(timezone.utc)
    records = []
    for record in value:
        if not isinstance(record, dict):
            raise ValueError("each history entry must be an object")
        round_id = record.get("roundId")
        if not isinstance(round_id, str) or not round_id.strip() or len(round_id) > 200:
            raise ValueError("roundId must be a nonempty string of at most 200 characters")
        round_id = round_id.strip()
        if round_id in seen:
            raise ValueError("history contains duplicate roundId")
        seen.add(round_id)
        completed = timestamp(record.get("completedAt"), "completedAt")
        if completed > now:
            raise ValueError("completedAt cannot be in the future")
        source = record.get("source")
        if source not in ("manual", "import"):
            raise ValueError("history source must be manual or import; provider verification is unavailable")
        multiplier = number(record.get("multiplier"), "multiplier", 1, 1000000000)
        records.append({"roundId": round_id, "completedAt": completed.isoformat(), "source": source, "multiplier": multiplier})
    return sorted(records, key=lambda record: record["completedAt"])


def analyze_history(game: GameId, data: dict[str, Any]) -> GameSignal:
    target = number(data.get("target", 2), "target", 1, 1000000)
    records = validate_history(data.get("history", []))
    confirmed(data)  # Validate the field, but history cannot establish a verified prediction.
    profile = PROFILES[game]
    if not records:
        return signal(game, None, {"sampleSize": 0, "target": target, "profile": profile}, unavailable=True,
                      explanation="Import genuine completed multiplier records to calculate historical risk. No next-round signal is available.", source="no completed data")
    values = [record["multiplier"] for record in records]
    successes = sum(value >= target for value in values)
    strictly_above = sum(value > target for value in values)
    probability = successes/len(values)
    interval = wilson_interval(successes, len(values))
    return signal(game, None, {"sampleSize": len(values), "target": target,
                  "atOrAboveTarget": successes, "strictlyAboveTarget": strictly_above,
                  "historicalAtOrAboveRate": probability,
                  "historicalStrictlyAboveRate": strictly_above/len(values),
                  "wilson95": list(interval) if interval else None,
                  "meanMultiplier": mean(values), "medianMultiplier": median(values),
                  "minimumMultiplier": min(values), "maximumMultiplier": max(values),
                  "historicalScenario": gross_ev(probability, target), "profile": profile,
                  "latestResult": records[-1]}, explanation="User-provided completed history; retrospective rates are not predictive accuracy. Scenario assumes gross target payout, zero on loss, no fees and equality as reached; actual equality settlement is unverified.", source="user-provided completed history")
