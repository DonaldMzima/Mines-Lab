import { TOTAL_TILES } from "@/lib/mines";
import type { SignalEvaluation, SignalResult } from "@/lib/signals/types";

export function evaluateSignal(
  signal: SignalResult,
  actualMinePositions: number[],
): SignalEvaluation {
  if (
    actualMinePositions.length !== signal.mineCount ||
    new Set(actualMinePositions).size !== actualMinePositions.length ||
    actualMinePositions.some(
      (position) => !Number.isInteger(position) || position < 0 || position >= TOTAL_TILES,
    )
  ) {
    throw new RangeError(`Enter exactly ${signal.mineCount} unique mine positions from 1 to ${TOTAL_TILES}.`);
  }

  const mines = new Set(actualMinePositions);
  const incorrectSelections = signal.suggestedTiles.filter((tile) => mines.has(tile)).length;
  return {
    signalId: signal.id,
    actualMinePositions: [...actualMinePositions].sort((a, b) => a - b),
    correctSelections: signal.suggestedTiles.length - incorrectSelections,
    incorrectSelections,
    survivedAllSelections: incorrectSelections === 0,
    evaluatedAt: new Date().toISOString(),
  };
}
