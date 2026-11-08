"""Offline JSON CLI: python -m mines_lab_analysis < request.json."""

import json
import sys
from .registry import ENGINE_VERSION, ENGINES, analyze_game, default_input


def reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON number: {value}")


def main() -> int:
    if sys.argv[1:] == ["--list"]:
        print(json.dumps({"engineVersion": ENGINE_VERSION, "games": list(ENGINES),
                          "exampleInputs": {game: default_input(game) for game in ENGINES}}))
        return 0
    if sys.argv[1:]:
        print(json.dumps({"error": "usage: python -m mines_lab_analysis [--list]"}))
        return 2
    try:
        raw = sys.stdin.buffer.read(1_048_577)
        if len(raw) > 1_048_576:
            raise ValueError("request exceeds 1 MiB")
        request = json.loads(raw, parse_constant=reject_constant)
        if not isinstance(request, dict) or not isinstance(request.get("gameId"), str):
            raise ValueError("request must contain gameId and input")
        result = analyze_game(request["gameId"], request.get("input"))
        print(json.dumps({"engineVersion": ENGINE_VERSION, "signal": result.to_dict()}, allow_nan=False))
        return 0 if result.source != "input validation" else 2
    except (ValueError, TypeError) as error:
        print(json.dumps({"error": str(error)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
