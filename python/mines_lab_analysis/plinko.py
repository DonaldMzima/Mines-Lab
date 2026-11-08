"""Binomial board model; requires independent constant-bias rows, not inferred physics."""

from math import comb
from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, integer, number


def analyze(data: dict[str, Any]) -> GameSignal:
    rows = integer(data.get("rows"), "rows", 1, 32)
    p = number(data.get("rightProbability"), "rightProbability", 0, 1)
    payouts = data.get("payouts")
    if not isinstance(payouts, list) or len(payouts) != rows + 1:
        raise ValueError("payouts must contain rows+1 gross multipliers")
    payouts = [number(value, "payouts", 0, 1000000000) for value in payouts]
    distribution = [comb(rows, k) * p**k * (1-p)**(rows-k) for k in range(rows+1)]
    expected = sum(probability*payout for probability, payout in zip(distribution, payouts))
    return signal("plinko", None, {"slotProbabilities": distribution, "grossExpectedReturn": expected,
                  "netExpectedValue": expected-1}, verified=confirmed(data),
                  explanation="Independent-row binomial model for the configured board; no next-slot forecast.")
