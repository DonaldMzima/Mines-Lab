"""Shared signal contract. Validation describes arithmetic, never predictive accuracy."""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from .contracts import GameId

SignalStatus = Literal["validated", "experimental", "unavailable"]


@dataclass(frozen=True)
class GameSignal:
    gameId: GameId
    action: str | None
    status: SignalStatus
    source: str
    generatedAt: str
    explanation: str
    details: dict[str, Any] = field(default_factory=dict)
    gameMode: str | None = None
    roundId: str | None = None
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None or key == "action"}


def signal(game: GameId, action: str | None, details: dict[str, Any], *,
           verified: bool = False, explanation: str = "Configured mathematical model; 1win rules and data are not verified.",
           unavailable: bool = False, mode: str | None = None, source: str | None = None, summary: str | None = None) -> GameSignal:
    if source is None:
        source = "User-confirmed rule configuration; mathematical analysis only" if verified else "Unconfirmed example rule configuration"
    details = {**details, "providerVerified": False, "connectionStatus": "Not connected", "accuracy": "Not evaluated", "analysisVersion": "4.0.0"}
    return GameSignal(game, action if verified and not unavailable else None,
                      "unavailable" if unavailable else "validated" if verified else "experimental",
                      source, datetime.now(timezone.utc).isoformat(), explanation, details, mode, None,
                      summary or (action if verified else None) or explanation.split(".")[0])
