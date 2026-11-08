import { GAME_ID, parseGameRound, SUPPORTED_BOMB_COUNTS, TOTAL_TILES } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { evaluateSignal } from "@/lib/signals/evaluator";
import type { SignalEvaluation, SignalResult } from "@/lib/signals/types";
import { isGameId } from "@/lib/game-registry";
import type { GameId } from "@/lib/game-registry";

const STORAGE_KEYS = {
  history: "mines-lab:history",
  signals: "mines-lab:signals",
  evaluations: "mines-lab:signal-evaluations",
  preferences: "mines-lab:settings",
} as const;
const STORAGE_VERSION = 1;
export const MAX_HISTORY = 500;
export const MAX_SIGNALS = 1000;

export type StorageCategory = keyof typeof STORAGE_KEYS;

export interface StorageLoadResult<T> {
  data: T;
  warnings: string[];
  writable: boolean;
}

export interface AppPreferences {
  activeGameId: GameId;
  mineCount: number;
  suggestedTileCount: number;
  theme: "dark" | "light";
  compactBoard: boolean;
  connection: {
    autoConnect: boolean;
    staleAfterSeconds: number;
  };
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  activeGameId: "mines",
  mineCount: 3,
  suggestedTileCount: 3,
  theme: "dark",
  compactBoard: false,
  connection: { autoConnect: false, staleAfterSeconds: 120 },
};

// Invalid originals stay untouched until the user explicitly backs them up.
const blockedCategories = new Set<StorageCategory>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoardPositions(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((position: unknown) =>
    typeof position === "number" && Number.isInteger(position) && position >= 0 && position < TOTAL_TILES,
  ) && new Set(value).size === value.length;
}

function parseSignal(value: unknown): SignalResult {
  if (!isRecord(value)) throw new Error("A saved signal is malformed.");
  const { id, createdAt, gameId, mineCount, suggestedTiles, method, source, confidence, roundId } = value;
  if (
    !isNonEmptyText(id) ||
    typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt)) ||
    gameId !== GAME_ID ||
    typeof mineCount !== "number" || !SUPPORTED_BOMB_COUNTS.some((count) => count === mineCount) ||
    !isBoardPositions(suggestedTiles) || suggestedTiles.length === 0 || suggestedTiles.length > TOTAL_TILES - mineCount ||
    !isNonEmptyText(method) || source !== "experimental" || confidence !== null ||
    (roundId !== undefined && !isNonEmptyText(roundId))
  ) {
    throw new Error("A saved signal has invalid or unsupported fields.");
  }
  return {
    id,
    createdAt: new Date(createdAt).toISOString(),
    gameId,
    mineCount,
    suggestedTiles: [...suggestedTiles],
    method,
    source,
    confidence,
    ...(roundId !== undefined ? { roundId } : {}),
  };
}

function parseEvaluationFields(value: unknown): SignalEvaluation {
  if (!isRecord(value)) throw new Error("A saved signal evaluation is malformed.");
  const { signalId, actualMinePositions, correctSelections, incorrectSelections, survivedAllSelections, evaluatedAt, roundId, association } = value;
  if (
    !isNonEmptyText(signalId) || !isBoardPositions(actualMinePositions) ||
    typeof correctSelections !== "number" || !Number.isInteger(correctSelections) || correctSelections < 0 ||
    typeof incorrectSelections !== "number" || !Number.isInteger(incorrectSelections) || incorrectSelections < 0 ||
    correctSelections + incorrectSelections > TOTAL_TILES ||
    typeof survivedAllSelections !== "boolean" || survivedAllSelections !== (incorrectSelections === 0) ||
    typeof evaluatedAt !== "string" || Number.isNaN(Date.parse(evaluatedAt)) ||
    (roundId !== undefined && !isNonEmptyText(roundId)) ||
    (association !== undefined && association !== "precommitted" && association !== "confirmed") ||
    ((roundId === undefined) !== (association === undefined))
  ) {
    throw new Error("A saved signal evaluation has invalid fields.");
  }
  return {
    signalId,
    actualMinePositions: [...actualMinePositions],
    correctSelections,
    incorrectSelections,
    survivedAllSelections,
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    ...(roundId !== undefined ? { roundId } : {}),
    ...(association !== undefined ? { association } : {}),
  };
}

function parseEvaluation(
  value: unknown,
  signalsById: Map<string, SignalResult>,
  roundsById: Map<string, GameRound>,
): SignalEvaluation {
  const evaluation = parseEvaluationFields(value);
  const signal = signalsById.get(evaluation.signalId);
  if (!signal) throw new Error(`Evaluation references missing signal "${evaluation.signalId}".`);
  const expected = evaluateSignal(signal, evaluation.actualMinePositions);
  if (
    expected.correctSelections !== evaluation.correctSelections ||
    expected.incorrectSelections !== evaluation.incorrectSelections ||
    expected.survivedAllSelections !== evaluation.survivedAllSelections ||
    Date.parse(evaluation.evaluatedAt) < Date.parse(signal.createdAt) ||
    (signal.roundId !== undefined && evaluation.roundId !== undefined && signal.roundId !== evaluation.roundId) ||
    (evaluation.association === "precommitted" && signal.roundId !== evaluation.roundId)
  ) {
    throw new Error(`Saved evaluation for signal "${evaluation.signalId}" is inconsistent.`);
  }
  const round = evaluation.roundId === undefined ? undefined : roundsById.get(evaluation.roundId);
  if (round && (
    round.gameId !== signal.gameId || round.bombCount !== signal.mineCount ||
    round.minePositions.length !== evaluation.actualMinePositions.length ||
    round.minePositions.some((position) => !evaluation.actualMinePositions.includes(position)) ||
    Date.parse(signal.createdAt) >= Date.parse(round.timestamp)
  )) {
    throw new Error(`Saved evaluation for signal "${evaluation.signalId}" conflicts with its imported round.`);
  }
  return evaluation;
}

function parsePreferences(value: unknown): AppPreferences {
  if (
    !isRecord(value) ||
    typeof value.mineCount !== "number" || !SUPPORTED_BOMB_COUNTS.some((count) => count === value.mineCount) ||
    typeof value.suggestedTileCount !== "number" || !Number.isInteger(value.suggestedTileCount) ||
    value.suggestedTileCount < 1 || value.suggestedTileCount > TOTAL_TILES - value.mineCount ||
    (value.theme !== "dark" && value.theme !== "light") || typeof value.compactBoard !== "boolean"
  ) {
    throw new Error("Saved settings are invalid.");
  }
  const connection = value.connection === undefined ? DEFAULT_PREFERENCES.connection : value.connection;
  // Preferences saved before the game hub default safely to Mines.
  const activeGameId = value.activeGameId === undefined ? "mines" : value.activeGameId;
  if (!isGameId(activeGameId)) throw new Error("Saved active game is invalid.");
  if (!isRecord(connection) || typeof connection.autoConnect !== "boolean" ||
    typeof connection.staleAfterSeconds !== "number" || !Number.isInteger(connection.staleAfterSeconds) ||
    connection.staleAfterSeconds < 30 || connection.staleAfterSeconds > 3600) {
    throw new Error("Saved connection preferences are invalid. No credentials are stored.");
  }
  return {
    activeGameId,
    mineCount: value.mineCount,
    suggestedTileCount: value.suggestedTileCount,
    theme: value.theme,
    compactBoard: value.compactBoard,
    connection: { autoConnect: connection.autoConnect, staleAfterSeconds: connection.staleAfterSeconds },
  };
}

export function readRawStorage(category: StorageCategory): string | null {
  return window.localStorage.getItem(STORAGE_KEYS[category]);
}

function readVersionedData(category: StorageCategory): unknown | undefined {
  const raw = readRawStorage(category);
  if (raw === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Saved ${category} data contains malformed JSON.`);
  }
  const field = category === "history" ? "rounds" : "data";
  if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !(field in parsed)) {
    throw new Error(`Saved ${category} data is invalid or from an unsupported version.`);
  }
  return parsed[field];
}

function unavailable<T>(category: StorageCategory, fallback: T, error: unknown): StorageLoadResult<T> {
  blockedCategories.add(category);
  return {
    data: fallback,
    writable: false,
    warnings: [
      `${error instanceof Error ? error.message : `Saved ${category} data could not be read.`} Original storage is preserved. Back up and recover this category in Settings to resume saving it.`,
    ],
  };
}

function loadArray<T>(
  category: StorageCategory,
  validate: (value: unknown) => T,
  identifiers: (value: T) => string[],
  limit: number,
): StorageLoadResult<T[]> {
  try {
    const data = readVersionedData(category);
    if (data === undefined) {
      blockedCategories.delete(category);
      return { data: [], warnings: [], writable: true };
    }
    if (!Array.isArray(data)) throw new Error(`Saved ${category} data must be an array.`);
    const valid: T[] = [];
    const seen = new Set<string>();
    const reasons: string[] = [];
    let rejected = 0;
    for (const item of data) {
      try {
        const parsed = validate(item);
        const ids = identifiers(parsed);
        if (ids.some((id) => seen.has(id))) throw new Error(`Duplicate ${category} identifier.`);
        for (const id of ids) seen.add(id);
        valid.push(parsed);
      } catch (error) {
        rejected += 1;
        if (reasons.length < 3) reasons.push(error instanceof Error ? error.message : "Invalid record.");
      }
    }
    if (valid.length > limit) {
      reasons.push(`${valid.length - limit} valid records exceed the ${limit}-record limit and remain in the original storage.`);
    }
    if (rejected > 0 || valid.length > limit) {
      return unavailable(category, valid.slice(0, limit), new Error(
        `${category}: loaded ${Math.min(valid.length, limit)} valid records; ${rejected} invalid or duplicate records were skipped. ${reasons.join(" ")}`,
      ));
    }
    blockedCategories.delete(category);
    return { data: valid, warnings: [], writable: true };
  } catch (error) {
    return unavailable(category, [], error);
  }
}

function loadHistoryResult(): StorageLoadResult<GameRound[]> {
  return loadArray("history", parseStoredRound, (round) => [round.id], MAX_HISTORY);
}

function parseStoredRound(value: unknown): GameRound {
  const round = parseGameRound(value);
  // Import parsing always strips claimed provenance; only the local persistence boundary restores it.
  if (isRecord(value) && value.source !== undefined) {
    if (value.source !== "provider" && value.source !== "import" && value.source !== "manual" && value.source !== "demo" && value.source !== "live") {
      throw new Error("Saved round source is invalid.");
    }
    round.source = value.source;
  }
  return round;
}

function loadSignalsResult(): StorageLoadResult<SignalResult[]> {
  return loadArray("signals", parseSignal, (signal) => [signal.id], MAX_SIGNALS);
}

function loadEvaluationsResult(signals: SignalResult[], history: GameRound[]): StorageLoadResult<SignalEvaluation[]> {
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  const roundsById = new Map(history.map((round) => [round.id, round]));
  return loadArray("evaluations", (value) => parseEvaluation(value, signalsById, roundsById), (evaluation) => [
    `signal:${evaluation.signalId}`,
    ...(evaluation.roundId !== undefined ? [`round:${evaluation.roundId}`] : []),
  ], MAX_SIGNALS);
}

function loadPreferencesResult(): StorageLoadResult<AppPreferences> {
  try {
    const stored = readVersionedData("preferences");
    const data = stored === undefined ? { ...DEFAULT_PREFERENCES } : parsePreferences(stored);
    blockedCategories.delete("preferences");
    return { data, warnings: [], writable: true };
  } catch (error) {
    return unavailable("preferences", { ...DEFAULT_PREFERENCES }, error);
  }
}

export function loadWorkspaceStorage() {
  const history = loadHistoryResult();
  const signals = loadSignalsResult();
  const evaluations = loadEvaluationsResult(signals.data, history.data);
  const preferences = loadPreferencesResult();
  return { history, signals, evaluations, preferences };
}

function saveVersionedData(category: StorageCategory, data: unknown): void {
  if (blockedCategories.has(category)) {
    throw new Error(`${category} storage is protected until it is backed up and recovered in Settings.`);
  }
  const field = category === "history" ? "rounds" : "data";
  window.localStorage.setItem(STORAGE_KEYS[category], JSON.stringify({ version: STORAGE_VERSION, [field]: data }));
}

export function recoverStorageCategory(category: StorageCategory): string | null {
  const original = readRawStorage(category);
  let backupKey: string | null = null;
  if (original !== null) {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    backupKey = `${STORAGE_KEYS[category]}:recovery:${suffix}`;
    window.localStorage.setItem(backupKey, original);
    if (window.localStorage.getItem(backupKey) !== original) {
      throw new Error(`The original ${category} data could not be backed up. Recovery was cancelled.`);
    }
  }
  blockedCategories.delete(category);
  return backupKey;
}

export function loadHistory(): GameRound[] {
  return loadHistoryResult().data;
}

function assertUniqueIdentifiers<T>(records: T[], identifiers: (record: T) => string[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const ids = identifiers(record);
    if (ids.some((id) => seen.has(id))) throw new Error("Duplicate identifiers cannot be saved.");
    for (const id of ids) seen.add(id);
  }
}

export function saveHistory(rounds: GameRound[]): void {
  if (rounds.length > MAX_HISTORY) throw new Error(`Round history exceeds the ${MAX_HISTORY}-record storage limit.`);
  const parsed = rounds.map(parseStoredRound);
  assertUniqueIdentifiers(parsed, (round) => [round.id]);
  saveVersionedData("history", parsed);
}

export function loadSignals(): SignalResult[] {
  return loadSignalsResult().data;
}

export function saveSignals(signals: SignalResult[]): void {
  if (signals.length > MAX_SIGNALS) throw new Error(`Signal history exceeds the ${MAX_SIGNALS}-record storage limit.`);
  const parsed = signals.map(parseSignal);
  assertUniqueIdentifiers(parsed, (signal) => [signal.id]);
  saveVersionedData("signals", parsed);
}

export function loadSignalEvaluations(signals: SignalResult[]): SignalEvaluation[] {
  return loadEvaluationsResult(signals, loadHistoryResult().data).data;
}

export function saveSignalEvaluations(evaluations: SignalEvaluation[]): void {
  if (evaluations.length > MAX_SIGNALS) throw new Error(`Signal evaluations exceed the ${MAX_SIGNALS}-record storage limit.`);
  const parsed = evaluations.map(parseEvaluationFields);
  assertUniqueIdentifiers(parsed, (evaluation) => [
    `signal:${evaluation.signalId}`,
    ...(evaluation.roundId !== undefined ? [`round:${evaluation.roundId}`] : []),
  ]);
  saveVersionedData("evaluations", parsed);
}

export function loadPreferences(): AppPreferences {
  return loadPreferencesResult().data;
}

export function savePreferences(preferences: AppPreferences): void {
  saveVersionedData("preferences", parsePreferences(preferences));
}
