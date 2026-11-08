"""Strict JSON-boundary validation; booleans are never accepted as numbers."""

from datetime import datetime, timezone
from math import isfinite
import re
from typing import Any


def number(value: Any, name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return float(value)


def integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    result = number(value, name, minimum, maximum)
    if result != int(result):
        raise ValueError(f"{name} must be an integer")
    return int(result)


def boolean(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be a boolean")
    return value


def timestamp(value: Any, name: str) -> datetime:
    if not isinstance(value, str) or len(value) > 40 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})", value):
        raise ValueError(f"{name} must be an ISO timestamp with timezone and at most millisecond precision")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{name} must be an ISO timestamp") from error
    if result.tzinfo is None:
        raise ValueError(f"{name} must include a timezone")
    return result.astimezone(timezone.utc)


def object_input(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("input must be an object")
    return value


def confirmed(data: dict[str, Any]) -> bool:
    return boolean(data.get("rulesConfirmed", False), "rulesConfirmed")


def gross_ev(probability: float, gross_payout: float) -> dict[str, float]:
    """One unit stake; payout includes returned stake, losing payout is zero."""
    return {"grossExpectedReturn": probability * gross_payout,
            "netExpectedValue": probability * gross_payout - 1}
