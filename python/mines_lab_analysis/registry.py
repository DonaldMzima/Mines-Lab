"""Versioned transport adapter for all 15 offline engines.

JSON inputs use camelCase like the Next.js contract. No network or provider access.
"""

from copy import deepcopy
from typing import Any, Callable, cast

from . import aviator, blackjack, coinflip, dice, hilo, keno, lucky_jet, mines, penalty, plinko, poker, rocket_queen, rocket_x, speed_cash, towers
from .contracts import GameId
from .signals import GameSignal, signal
from dataclasses import replace
from .validation import confirmed, object_input

ENGINE_VERSION = "4.0.0"
ENGINES: dict[str, Callable[[dict[str, Any]], GameSignal]] = {
    "mines": mines.analyze, "penalty": penalty.analyze, "blackjack": blackjack.analyze,
    "hilo": hilo.analyze, "dice": dice.analyze, "plinko": plinko.analyze, "keno": keno.analyze,
    "towers": towers.analyze, "coinflip": coinflip.analyze, "poker": poker.analyze,
    "lucky-jet": lucky_jet.analyze, "rocket-queen": rocket_queen.analyze,
    "rocket-x": rocket_x.analyze, "aviator": aviator.analyze, "speed-cash": speed_cash.analyze,
}
DEFAULT_INPUTS: dict[str, dict[str, Any]] = {
    "mines": {"mines": 3, "picks": 3, "rulesConfirmed": False},
    "penalty": {"mode": "series", "step": 1},
    "blackjack": {"cards": [], "dealer": None, "profile": "multi-deck-s17-das", "canDouble": True, "canSplit": True, "afterSplit": False, "splitAces": False, "rulesConfirmed": False},
    "hilo": {"currentRank": None, "rankCounts": [4]*13, "ties": "lose", "rulesConfirmed": False},
    "dice": {"min": 0, "max": 99, "threshold": 50, "direction": "under", "grossPayout": 1.9, "rulesConfirmed": False},
    "coinflip": {"headsProbability": .5, "grossPayout": 1.9, "headsGrossPayout": None, "tailsGrossPayout": None, "rulesConfirmed": False},
    "plinko": {"rows": 8, "rightProbability": .5, "payouts": [5, 2, 1, .5, .2, .5, 1, 2, 5], "rulesConfirmed": False},
    "keno": {"pool": 80, "drawn": 20, "selections": [1, 2, 3, 4, 5], "payouts": {}, "rulesConfirmed": False},
    "towers": {"rows": [{"tiles": 3, "hazards": 1} for _ in range(3)], "steps": 1, "grossPayout": None, "rulesConfirmed": False},
    "poker": {"variant": "five-card", "cards": [], "discardIndexes": [], "rulesConfirmed": False},
    **{game: {"history": [], "target": 2, "rulesConfirmed": False} for game in ("lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash")},
}


def default_input(game: str) -> dict[str, Any]:
    if game not in ENGINES:
        raise ValueError("unsupported gameId")
    return deepcopy(DEFAULT_INPUTS[game])


def analyze_game(game: str, data: Any) -> GameSignal:
    """Return a safe explicit unavailable signal on invalid supported-game inputs."""
    if game not in ENGINES:
        raise ValueError("unsupported gameId")
    try:
        parsed = object_input(data)
        confirmed(parsed)
        round_id = parsed.get("roundId")
        if round_id is not None and (not isinstance(round_id, str) or not round_id.strip() or len(round_id) > 200):
            raise ValueError("roundId must be a nonempty string of at most 200 characters")
        result = ENGINES[game](parsed)
        if round_id is not None:
            result = replace(result, roundId=round_id.strip())
    except (ValueError, TypeError) as error:
        return signal(cast(GameId, game), None, {"validationErrors": [str(error)]}, unavailable=True,
                      explanation="Correct the game configuration before requesting analysis.", source="input validation")
    return result
