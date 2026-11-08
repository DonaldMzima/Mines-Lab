import type { GameSignal } from "./analysis";
import { calculateSurvivalProbability, tileIndexToNumber, TOTAL_TILES } from "./mines";
import type { SignalResult } from "./signals/types";

/** Keeps existing stored Mines suggestions while exposing the shared V4 contract. */
export function toMinesGameSignal(record: SignalResult): GameSignal {
  const survivalProbability = calculateSurvivalProbability(TOTAL_TILES, record.mineCount, record.suggestedTiles.length);
  return {
    gameId: "mines", ...(record.roundId ? { roundId: record.roundId } : {}),
    action: `Tiles: ${record.suggestedTiles.map(tileIndexToNumber).map(n => String(n).padStart(2, "0")).join(", ")}`,
    status: "experimental", source: "Uniform random baseline", generatedAt: record.createdAt,
    summary: `${(survivalProbability * 100).toFixed(2)}% baseline chance that all suggested tiles survive`,
    explanation: "Random tile suggestions for comparison. No suggested tile is confirmed safe; completed mine maps remain separate.",
    details: { mines: record.mineCount, picks: record.suggestedTiles.length, suggestedTiles: record.suggestedTiles, survivalProbability, legacySignalId: record.id, providerVerified: false, connectionStatus: "Not connected", accuracy: "Not evaluated" },
  };
}
