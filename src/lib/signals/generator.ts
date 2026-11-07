import { GAME_ID, SUPPORTED_BOMB_COUNTS, TOTAL_TILES } from "@/lib/mines";
import type { SignalRequest, SignalResult } from "@/lib/signals/types";

function randomInteger(upperBound: number): number {
  if (!Number.isInteger(upperBound) || upperBound <= 0) {
    throw new RangeError("Random integer upper bound must be a positive integer.");
  }

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const range = 0x1_0000_0000;
    const limit = range - (range % upperBound);
    const values = new Uint32Array(1);
    do {
      cryptoApi.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % upperBound;
  }

  return Math.floor(Math.random() * upperBound);
}

function createSignalId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `signal-${Date.now()}-${randomInteger(1_000_000_000)}`;
}

export function generateSignal(request: SignalRequest): SignalResult {
  const { gameId, mineCount, suggestedTileCount } = request;
  const roundId = request.roundId?.trim();
  if (request.roundId !== undefined && (!roundId || roundId.length > 200)) {
    throw new RangeError("Round identifier must contain 1–200 characters.");
  }
  if (gameId !== GAME_ID) throw new RangeError("Unsupported game.");
  if (!SUPPORTED_BOMB_COUNTS.some((count) => count === mineCount)) {
    throw new RangeError("Choose one of the supported mine counts.");
  }
  if (
    !Number.isInteger(suggestedTileCount) ||
    suggestedTileCount < 1 ||
    suggestedTileCount > TOTAL_TILES - mineCount
  ) {
    throw new RangeError("Suggested tile count must be between 1 and the number of safe tiles.");
  }

  const shuffled = Array.from({ length: TOTAL_TILES }, (_, index) => index);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return {
    id: createSignalId(),
    createdAt: new Date().toISOString(),
    gameId,
    mineCount,
    suggestedTiles: shuffled.slice(0, suggestedTileCount).sort((a, b) => a - b),
    method: "Uniform random baseline",
    source: "experimental",
    confidence: null,
    ...(roundId ? { roundId } : {}),
  };
}
