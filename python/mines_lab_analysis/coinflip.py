"""Configured independent flip probability, without a guessed winning side."""

from typing import Any
from .signals import GameSignal, signal
from .validation import confirmed, gross_ev, number


def analyze(data: dict[str, Any]) -> GameSignal:
    probability = number(data.get("headsProbability"), "headsProbability", 0, 1)
    fallback = data.get("grossPayout")
    heads_payout = data.get("headsGrossPayout")
    tails_payout = data.get("tailsGrossPayout")
    heads_payout = fallback if heads_payout is None else heads_payout
    tails_payout = fallback if tails_payout is None else tails_payout
    heads = {} if heads_payout is None else gross_ev(probability, number(heads_payout, "headsGrossPayout", 0, 1000000000))
    tails = {} if tails_payout is None else gross_ev(1-probability, number(tails_payout, "tailsGrossPayout", 0, 1000000000))
    return signal("coinflip", None, {"headsProbability": probability, "tailsProbability": 1-probability,
                  "heads": heads, "tails": tails}, verified=confirmed(data),
                  explanation="Configured flip probability and separate gross side payouts; an independent flip has no known next side. A common payout is only a fallback when a side payout is absent.")
