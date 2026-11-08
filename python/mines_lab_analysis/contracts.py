"""Versioned, transport-neutral contracts for offline analysis work."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

CONTRACT_VERSION = "1.0"
GameId = Literal[
    "mines", "penalty", "blackjack", "hilo", "dice", "plinko", "keno", "towers",
    "coinflip", "poker", "lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash",
]
DataSource = Literal["demo", "import", "manual", "provider", "simulation", "none"]
ValidationStatus = Literal["calculated", "unavailable", "evaluated"]


@dataclass(frozen=True)
class AnalysisRequest:
    game: GameId
    analysis_type: str
    rule_version: str
    data_source: DataSource
    mode: str | None = None


@dataclass(frozen=True)
class AnalysisResult:
    contract_version: str
    game: GameId
    analysis_type: str
    value: float | None
    units: str
    assumptions: tuple[str, ...]
    data_source: DataSource
    validation_status: ValidationStatus
    limitations: tuple[str, ...]
    generated_at: datetime
