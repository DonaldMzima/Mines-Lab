export const TOTAL_TILES = 25;
export const SUPPORTED_BOMB_COUNTS = [2, 3, 5, 7] as const;
export const GAME_ID = "v_1wingames:mines";

export type RoundResult = "won" | "lost" | "cashed_out" | "unknown";
export type DataSource = "manual" | "import" | "demo" | "live" | "provider";
export type GameMode = "demo" | "real" | "unknown";
export type ProviderState = number | string;
export type TileStatus = "hidden" | "selected" | "safe" | "mine";

export interface FairnessMetadata {
  seedId?: string;
  serverSeedHash?: string;
  clientSeed?: string;
  nonce?: number;
  cursor?: number;
  bytesUsed?: number;
  algorithm?: string;
}

export interface GameRound {
  id: string;
  gameId: string;
  timestamp: string;
  bombCount: number;
  minePositions: number[];
  selectedPositions: number[];
  result: RoundResult;
  cashoutAmount?: number;
  currency?: string;
  mode?: GameMode;
  fairness?: FairnessMetadata;
  providerState?: ProviderState;
  source: DataSource;
}

export const MAX_IMPORT_ROUNDS = 5000;

export interface RoundImportReport {
  rounds: GameRound[];
  duplicates: number;
  rejected: number;
  errors: string[];
}

export function tileNumberToIndex(tileNumber: number): number {
  if (!Number.isInteger(tileNumber) || tileNumber < 1 || tileNumber > TOTAL_TILES) {
    throw new RangeError(`Tile number must be an integer from 1 to ${TOTAL_TILES}.`);
  }
  return tileNumber - 1;
}

export function tileIndexToNumber(tileIndex: number): number {
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= TOTAL_TILES) {
    throw new RangeError(`Tile index must be an integer from 0 to ${TOTAL_TILES - 1}.`);
  }
  return tileIndex + 1;
}

export function calculateSurvivalProbability(
  totalTiles: number,
  bombs: number,
  picks: number,
): number {
  if (!Number.isInteger(totalTiles) || totalTiles <= 0) {
    throw new RangeError("Total tiles must be a positive integer.");
  }
  if (!Number.isInteger(bombs) || bombs < 0 || bombs >= totalTiles) {
    throw new RangeError("Bomb count must be an integer from 0 to total tiles - 1.");
  }
  if (!Number.isInteger(picks) || picks < 0 || picks > totalTiles - bombs) {
    throw new RangeError("Pick count must be a non-negative integer no greater than the safe tiles.");
  }

  let probability = 1;
  for (let pick = 0; pick < picks; pick += 1) {
    probability *= (totalTiles - bombs - pick) / (totalTiles - pick);
  }
  return probability;
}

export function formatProbabilityAsPercent(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Probability must be a number from 0 to 1.");
  }
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(probability);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositionList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((position: unknown) =>
      typeof position === "number" &&
        Number.isInteger(position) &&
        position >= 0 &&
        position < TOTAL_TILES,
    ) &&
    new Set(value).size === value.length
  );
}

export function parseFairness(value: unknown): FairnessMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Fairness metadata must be an object.");

  const parsed: FairnessMetadata = {};
  if (value.algo !== undefined && value.algorithm !== undefined && value.algo !== value.algorithm) {
    throw new Error("Fairness algorithm identifiers conflict.");
  }
  for (const key of ["seedId", "serverSeedHash", "clientSeed", "algorithm"] as const) {
    const item = key === "algorithm" ? (value.algorithm === undefined ? value.algo : value.algorithm) : value[key];
    if (item !== undefined) {
      if (typeof item !== "string") throw new Error(`Fairness field "${key}" must be text.`);
      parsed[key] = item;
    }
  }
  for (const key of ["nonce", "cursor", "bytesUsed"] as const) {
    const item = value[key];
    if (item !== undefined) {
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) {
        throw new Error(`Fairness field "${key}" must be a non-negative integer.`);
      }
      parsed[key] = item;
    }
  }
  return parsed;
}

export function parseProviderState(value: unknown): ProviderState | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (isString(value) && value.length <= 200) return value;
  throw new Error("Provider state must be a safe integer or a non-empty text code.");
}

function providerRound(value: Record<string, unknown>): Record<string, unknown> {
  const response = value.response;
  if (!isRecord(response) || !isRecord(response.outcome)) {
    throw new Error("A provider import needs a response with outcome.mines positions.");
  }
  for (const key of ["ms_id", "id"] as const) {
    if (response[key] !== undefined && !isString(response[key])) {
      throw new Error(`Provider ${key} must be a non-empty string if supplied.`);
    }
  }
  if (!isString(value.roundId)) {
    throw new Error("Provider responses need an explicit roundId; ms_id is a message identifier, not a verified round identifier.");
  }
  if (value.completed !== true) {
    throw new Error("Confirm completed:true for a provider outcome; a state code alone does not establish completion.");
  }
  if (value.result !== "lost" && value.result !== "cashed_out" && value.result !== "unknown") {
    throw new Error("Provider outcomes need an explicit result: lost, cashed_out, or unknown. State codes are not inferred.");
  }
  const state = parseProviderState(response.state);
  if (response.balance !== undefined && (typeof response.balance !== "number" || !Number.isFinite(response.balance) || response.balance < 0)) {
    throw new Error("Provider balance must be a finite, non-negative number if supplied. Balances are not stored.");
  }
  const mines = response.outcome.mines;
  if (!isPositionList(mines)) throw new Error("Provider outcome.mines must contain unique integer positions from 0 to 24.");
  const bombCount = value.bombCount ?? mines.length;
  for (const count of [value.bombCount, response.bombCount, response.mineCount]) {
    if (count !== undefined && count !== mines.length) {
      throw new Error("The supplied mine count does not match the completed mine positions.");
    }
  }
  return {
    id: value.roundId,
    gameId: value.gameId === undefined ? GAME_ID : value.gameId,
    timestamp: value.timestamp,
    bombCount,
    minePositions: mines,
    selectedPositions: value.selectedPositions,
    result: value.result,
    cashoutAmount: response.cashout_amount,
    currency: value.currency === undefined ? response.currency : value.currency,
    mode: value.mode,
    fairness: response.fair,
    providerState: state,
  };
}

export function parseGameRound(value: unknown): GameRound {
  if (!isRecord(value)) throw new Error("Each round must be an object.");
  if (value.ms_id !== undefined && !isString(value.ms_id)) throw new Error("ms_id must be non-empty text if supplied; it is not used as the round identifier.");
  if ("outcome" in value && !("response" in value)) {
    throw new Error("Wrap provider responses in {roundId, timestamp, completed:true, result, response}. Message ids and state codes alone are insufficient.");
  }
  if ("response" in value) value = providerRound(value);
  // Canonical files are completed-round records. Explicit incomplete flags are never accepted.
  if (!isRecord(value)) throw new Error("Each round must be an object.");
  if (value.completed !== undefined && value.completed !== true) {
    throw new Error("Incomplete rounds cannot be imported as completed results.");
  }
  const {
    id,
    gameId,
    timestamp,
    bombCount,
    minePositions,
    selectedPositions,
    result,
    cashoutAmount,
    currency,
    mode,
    fairness,
    providerState,
  } = value;

  if (!isString(id)) throw new Error("Each round needs a non-empty id.");
  if (!isString(gameId)) throw new Error(`Round "${id}" needs a gameId.`);
  if (gameId !== GAME_ID) throw new Error(`Round "${id}" is not from a supported game.`);
  if (!isString(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Round "${id}" needs a valid timestamp.`);
  }
  if (
    typeof bombCount !== "number" ||
    !Number.isInteger(bombCount) ||
    !SUPPORTED_BOMB_COUNTS.some((count) => count === bombCount)
  ) {
    throw new Error(`Round "${id}" has an unsupported bomb count.`);
  }
  if (!isPositionList(minePositions) || minePositions.length !== bombCount) {
    throw new Error(`Round "${id}" must contain exactly ${bombCount} unique mine positions from 0 to 24.`);
  }
  const parsedSelectedPositions =
    selectedPositions === undefined ? [] : selectedPositions;
  if (!isPositionList(parsedSelectedPositions)) {
    throw new Error(`Round "${id}" has invalid selected positions.`);
  }
  if (
    result !== "won" &&
    result !== "lost" &&
    result !== "cashed_out" &&
    result !== "unknown"
  ) {
    throw new Error(`Round "${id}" has an unsupported result.`);
  }
  if (
    (result === "won" || result === "cashed_out") &&
    parsedSelectedPositions.some((position) => minePositions.includes(position))
  ) {
    throw new Error(`Round "${id}" marks a mine as selected in a non-losing result.`);
  }
  if (
    cashoutAmount !== undefined &&
    (typeof cashoutAmount !== "number" ||
      !Number.isFinite(cashoutAmount) ||
      cashoutAmount < 0)
  ) {
    throw new Error(`Round "${id}" has an invalid cash-out amount.`);
  }
  if (currency !== undefined && (!isString(currency) || currency.length > 24)) {
    throw new Error(`Round "${id}" has an invalid currency.`);
  }
  if (mode !== undefined && mode !== "demo" && mode !== "real" && mode !== "unknown") {
    throw new Error(`Round "${id}" has an unsupported game mode.`);
  }
  const parsedState = parseProviderState(providerState);

  return {
    id,
    gameId,
    timestamp: new Date(timestamp).toISOString(),
    bombCount,
    minePositions: [...minePositions].sort((a, b) => a - b),
    selectedPositions: [...parsedSelectedPositions],
    result,
    ...(cashoutAmount !== undefined ? { cashoutAmount } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(fairness !== undefined ? { fairness: parseFairness(fairness) } : {}),
    ...(parsedState !== undefined ? { providerState: parsedState } : {}),
    source: "import",
  };
}

export function roundsEquivalent(first: GameRound, second: GameRound): boolean {
  const comparable = (round: GameRound) => ({
    id: round.id,
    gameId: round.gameId,
    timestamp: round.timestamp,
    bombCount: round.bombCount,
    minePositions: [...round.minePositions].sort((a, b) => a - b),
    selectedPositions: round.selectedPositions,
    result: round.result,
    cashoutAmount: round.cashoutAmount,
    currency: round.currency,
    mode: round.mode,
    providerState: round.providerState,
    fairness: round.fairness ? {
      seedId: round.fairness.seedId,
      serverSeedHash: round.fairness.serverSeedHash,
      clientSeed: round.fairness.clientSeed,
      nonce: round.fairness.nonce,
      cursor: round.fairness.cursor,
      bytesUsed: round.fairness.bytesUsed,
      algorithm: round.fairness.algorithm,
    } : undefined,
  });
  return JSON.stringify(comparable(first)) === JSON.stringify(comparable(second));
}

export function parseGameRoundImport(value: unknown): RoundImportReport {
  const records = Array.isArray(value) ? value : [value];
  if (records.length === 0) throw new Error("The import contains no rounds.");
  if (records.length > MAX_IMPORT_ROUNDS) throw new Error(`Import at most ${MAX_IMPORT_ROUNDS} rounds at a time.`);
  const roundsById = new Map<string, GameRound>();
  const conflictingIds = new Set<string>();
  const duplicateCounts = new Map<string, number>();
  const report: RoundImportReport = { rounds: [], duplicates: 0, rejected: 0, errors: [] };
  records.forEach((record, index) => {
    try {
      const round = parseGameRound(record);
      if (conflictingIds.has(round.id)) throw new Error(`Conflicting round id "${round.id}" is excluded from this import.`);
      const previous = roundsById.get(round.id);
      if (previous) {
        if (!roundsEquivalent(previous, round)) {
          roundsById.delete(round.id);
          conflictingIds.add(round.id);
          throw new Error(`Conflicting records use round id "${round.id}"; all versions of that round are excluded.`);
        }
        duplicateCounts.set(round.id, (duplicateCounts.get(round.id) ?? 0) + 1);
      } else {
        roundsById.set(round.id, round);
      }
    } catch (error) {
      report.errors.push(`Record ${index + 1}: ${error instanceof Error ? error.message : "Invalid completed round."}`);
    }
  });
  report.rounds = [...roundsById.values()];
  report.duplicates = [...duplicateCounts].reduce((count, [id, duplicates]) => count + (roundsById.has(id) ? duplicates : 0), 0);
  report.rejected = records.length - report.rounds.length - report.duplicates;
  return report;
}

export function parseGameRounds(value: unknown): GameRound[] {
  const report = parseGameRoundImport(value);
  if (report.errors.length > 0) throw new Error(report.errors.join(" "));
  return report.rounds;
}
