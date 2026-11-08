"""Hypergeometric hits for uniform drawing without replacement."""

from math import comb
from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, integer, number


def analyze(data: dict[str, Any]) -> GameSignal:
    pool = integer(data.get("pool"), "pool", 1, 100)
    drawn = integer(data.get("drawn"), "drawn", 0, pool)
    selections = data.get("selections")
    if not isinstance(selections, list) or not 1 <= len(selections) <= pool:
        raise ValueError("selections must contain distinct numbers within the pool")
    selected = [integer(value, "selections", 1, pool) for value in selections]
    if len(set(selected)) != len(selected):
        raise ValueError("selections must be unique")
    n = len(selected)
    probabilities = {str(hits): comb(n, hits)*comb(pool-n, drawn-hits)/comb(pool, drawn)
                     for hits in range(max(0, drawn-(pool-n)), min(n, drawn)+1)}
    payouts = data.get("payouts", {})
    if not isinstance(payouts, dict):
        raise ValueError("payouts must map hit counts to gross multipliers")
    parsed: dict[str, float] = {}
    for key, value in payouts.items():
        if not isinstance(key, str) or not key.isdigit() or str(int(key)) != key or not 0 <= int(key) <= n:
            raise ValueError("payout hit counts must be canonical integers within the selection count")
        parsed[key] = number(value, "payouts", 0, 1000000000)
    details: dict[str, Any] = {"hitProbabilities": probabilities, "expectedHits": n*drawn/pool,
                              "payoutTableComplete": len(parsed) == n+1}
    if len(parsed) == n+1:
        # Full explicit paytable: zero payouts must be supplied, never inferred.
        expected = sum(probability*parsed.get(key, 0) for key, probability in probabilities.items())
        details.update(grossExpectedReturn=expected, netExpectedValue=expected-1)
    return signal("keno", None, details, verified=confirmed(data),
                  explanation="Uniform draws without replacement. EV requires a complete explicit gross payout table including zeros; no winning-number forecast.")
