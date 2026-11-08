import { randomUUID } from "node:crypto";
import { GAME_IDS, isGameId } from "@/lib/game-registry";
import type { GameId } from "@/lib/game-registry";
import { isRecord, isPositionList, parseGameRound, roundsEquivalent } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import type { SignalResult } from "@/lib/signals/types";
import type { PenaltyMode } from "@/lib/penalty";
import type { GameSignal } from "@/lib/analysis";
import { parseAnalysisRecord, parseCompletedGameResult } from "@/lib/analysis-records";
import type { AnalysisRecord, CompletedGameResult } from "@/lib/analysis-records";

export interface TelegramUserState {
  chatId: number;
  selectedGame: GameId;
  mineCount: 2 | 3 | 5 | 7;
  suggestionCount: 1 | 2 | 3 | 4 | 5;
  penaltyMode: PenaltyMode;
  notificationsEnabled: boolean;
  selectedTiles: number[];
  latestSignal?: SignalResult;
  rounds: GameRound[];
  gameConfigs: Partial<Record<GameId, Record<string, unknown>>>;
  signalHistory: Partial<Record<GameId, AnalysisRecord[]>>;
  completedResults: Partial<Record<GameId, CompletedGameResult[]>>;
}

export class TelegramStoreError extends Error {
  constructor(message = "Telegram storage is unavailable.") { super(message); this.name = "TelegramStoreError"; }
}
export class TelegramStoreBusyError extends TelegramStoreError {
  constructor() { super("This Telegram update is being processed; retry later."); this.name = "TelegramStoreBusyError"; }
}

const userStates = new Map<number, TelegramUserState>();
const claims = new Map<number, { token: string; expires: number }>();
const userLocks = new Set<number>();
const actionTimes = new Map<number, number[]>();
const MAX_HISTORY = 20;
const LEASE_SECONDS = 120;
const DONE_SECONDS = 7 * 24 * 60 * 60;

function configuration(): { url: string; token: string; namespace: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return null;
  if (!url || !token) throw new TelegramStoreError("Both Redis REST settings are required.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new TelegramStoreError("Redis REST URL is invalid."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new TelegramStoreError("Redis REST URL must be an HTTPS origin.");
  const namespace = process.env.TELEGRAM_STORE_NAMESPACE ?? "mines-lab:telegram:v4";
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(namespace)) throw new TelegramStoreError("Telegram storage namespace is invalid.");
  return { url: parsed.origin, token, namespace };
}
export function telegramStorageMode(): "Redis configured (shared storage)" | "process-local (not durable)" {
  return configuration() ? "Redis configured (shared storage)" : "process-local (not durable)";
}
function key(suffix: string): string { return (configuration()?.namespace ?? "mines-lab:telegram:v4") + ":" + suffix; }

/** Documented Upstash Redis REST command-array API; token is server-only. */
async function redis(command: (string | number)[]): Promise<unknown> {
  const config = configuration();
  if (!config) throw new TelegramStoreError();
  try {
    const response = await fetch(config.url, {
      method: "POST", headers: { Authorization: "Bearer " + config.token, "content-type": "application/json" },
      body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || "error" in payload || !("result" in payload)) throw new TelegramStoreError();
    return payload.result;
  } catch { throw new TelegramStoreError(); }
}
function defaults(chatId: number): TelegramUserState {
  return { chatId, selectedGame: "mines", mineCount: 3, suggestionCount: 3, penaltyMode: "turbo", notificationsEnabled: false, selectedTiles: [], rounds: [], gameConfigs: {}, signalHistory: {}, completedResults: {} };
}
/** Reject corrupt durable state instead of replacing it with empty history. Adds V4 fields to valid V3 records. */
export function parseTelegramUser(value: unknown, chatId: number): TelegramUserState {
  if (!isRecord(value) || value.chatId !== chatId || (typeof value.mineCount !== "number" || ![2, 3, 5, 7].includes(value.mineCount)) ||
    (typeof value.suggestionCount !== "number" || ![1, 2, 3, 4, 5].includes(value.suggestionCount)) || (typeof value.penaltyMode !== "string" || !["turbo", "series"].includes(value.penaltyMode)) ||
    typeof value.notificationsEnabled !== "boolean" || !isPositionList(value.selectedTiles) || !Array.isArray(value.rounds) || value.rounds.length > MAX_HISTORY) throw new TelegramStoreError("Saved Telegram state is invalid; it was preserved.");
  const state = { ...defaults(chatId), ...value } as TelegramUserState;
  if (!isGameId(state.selectedGame) || !isRecord(state.gameConfigs) || !isRecord(state.signalHistory) || !isRecord(state.completedResults)) throw new TelegramStoreError("Saved Telegram state is invalid; it was preserved.");
  for (const [id, config] of Object.entries(state.gameConfigs)) {
    if (!isGameId(id) || !isRecord(config) || JSON.stringify(config).length > 16_000) throw new TelegramStoreError("Saved game settings are invalid; they were preserved.");
  }
  const recordIds = new Set<string>();
  for (const [id, history] of Object.entries(state.signalHistory)) {
    if (!isGameId(id) || !Array.isArray(history) || history.length > MAX_HISTORY) throw new TelegramStoreError("Saved signal history is invalid; it was preserved.");
    const roundIds = new Set<string>();
    state.signalHistory[id] = history.map(value => {
      let record: AnalysisRecord;
      try { record = parseAnalysisRecord(value); } catch { throw new TelegramStoreError("Saved signal record is invalid; it was preserved."); }
      if (record.signal.gameId !== id || recordIds.has(record.id) || (record.signal.roundId !== undefined && roundIds.has(record.signal.roundId))) throw new TelegramStoreError("Duplicate or mismatched signal records were preserved for recovery.");
      recordIds.add(record.id);
      if (record.signal.roundId) roundIds.add(record.signal.roundId);
      return record;
    });
  }
  for (const [id, results] of Object.entries(state.completedResults)) {
    if (!isGameId(id) || !Array.isArray(results) || results.length > MAX_HISTORY) throw new TelegramStoreError("Saved completed results are invalid; they were preserved.");
    const ids = new Set<string>();
    state.completedResults[id] = results.map(value => {
      let result: CompletedGameResult;
      try { result = parseCompletedGameResult(value); } catch { throw new TelegramStoreError("Saved completed result is invalid; it was preserved."); }
      if (result.gameId !== id || ids.has(result.roundId)) throw new TelegramStoreError("Duplicate or mismatched completed results were preserved for recovery.");
      ids.add(result.roundId); return result;
    });
  }
  const minesIds = new Set<string>();
  state.rounds = state.rounds.map(round => {
    if (minesIds.has(round.id)) throw new TelegramStoreError("Duplicate saved Mines rounds were preserved for recovery.");
    minesIds.add(round.id);
    const parsed = parseGameRound(round);
    if (!["demo", "manual", "import", "provider", "live"].includes(round.source)) throw new TelegramStoreError("Saved round source is invalid.");
    return { ...parsed, source: round.source };
  });
  if (state.latestSignal !== undefined && (!isRecord(state.latestSignal) || !Array.isArray(state.latestSignal.suggestedTiles) || !isPositionList(state.latestSignal.suggestedTiles))) throw new TelegramStoreError("Saved Mines signal is invalid.");
  return state;
}
export async function getTelegramUser(chatId: number): Promise<TelegramUserState> {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) throw new TelegramStoreError("Private Telegram chat required.");
  if (!configuration()) return structuredClone(userStates.get(chatId) ?? defaults(chatId));
  const raw = await redis(["GET", key("user:" + chatId)]);
  if (raw === null) return defaults(chatId);
  if (typeof raw !== "string" || raw.length > 500_000) throw new TelegramStoreError("Saved Telegram state is invalid.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new TelegramStoreError("Saved Telegram state is invalid."); }
  return parseTelegramUser(parsed, chatId);
}
export async function updateTelegramUser(chatId: number, changes: Partial<Omit<TelegramUserState, "chatId">>): Promise<TelegramUserState> {
  const next = parseTelegramUser({ ...await getTelegramUser(chatId), ...changes, chatId }, chatId);
  if (JSON.stringify(next).length > 500_000) throw new TelegramStoreError("Telegram history capacity reached; saved records were preserved.");
  if (configuration()) {
    await redis(["SET", key("user:" + chatId), JSON.stringify(next)]);
    await redis(["SADD", key("users"), chatId]);
  } else {
    if (!userStates.has(chatId) && userStates.size >= 10_000) throw new TelegramStoreError("Process-local capacity reached; configure durable storage.");
    userStates.set(chatId, structuredClone(next));
  }
  return next;
}
export async function withTelegramUserLock<T>(chatId: number, action: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  if (configuration()) {
    if (await redis(["SET", key("lock:" + chatId), token, "NX", "EX", LEASE_SECONDS]) !== "OK") throw new TelegramStoreBusyError();
  } else {
    if (userLocks.has(chatId)) throw new TelegramStoreBusyError();
    userLocks.add(chatId);
  }
  try { return await action(); }
  finally {
    if (configuration()) await redis(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, key("lock:" + chatId), token]);
    else userLocks.delete(chatId);
  }
}
export async function claimTelegramUpdate(updateId: number): Promise<string | null> {
  const token = randomUUID();
  if (configuration()) {
    if (await redis(["SET", key("update:" + updateId), token, "NX", "EX", LEASE_SECONDS]) === "OK") return token;
    if (await redis(["GET", key("update:" + updateId)]) === "done") return null;
    throw new TelegramStoreBusyError();
  }
  const now = Date.now();
  for (const [id, claim] of claims) if (claim.expires <= now) claims.delete(id);
  const existing = claims.get(updateId);
  if (existing?.token === "done") return null;
  if (existing) throw new TelegramStoreBusyError();
  if (claims.size >= 10_000) throw new TelegramStoreError("Process-local deduplication capacity reached.");
  claims.set(updateId, { token, expires: now + LEASE_SECONDS * 1_000 });
  return token;
}
export async function completeTelegramUpdate(updateId: number, token: string): Promise<void> {
  if (configuration()) {
    const result = await redis(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],'done','EX',ARGV[2]); return 1 else return 0 end", 1, key("update:" + updateId), token, DONE_SECONDS]);
    if (result !== 1) throw new TelegramStoreBusyError();
  } else {
    if (claims.get(updateId)?.token !== token) throw new TelegramStoreBusyError();
    claims.set(updateId, { token: "done", expires: Date.now() + DONE_SECONDS * 1_000 });
  }
}
export async function releaseTelegramUpdate(updateId: number, token: string): Promise<void> {
  if (configuration()) await redis(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, key("update:" + updateId), token]);
  else if (claims.get(updateId)?.token === token) claims.delete(updateId);
}
export async function allowTelegramAction(chatId: number, now = Date.now()): Promise<boolean> {
  if (configuration()) {
    const count = await redis(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n == 1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, key("rate:" + chatId)]);
    return typeof count === "number" && count <= 20;
  }
  const recent = (actionTimes.get(chatId) ?? []).filter(time => now - time < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now); actionTimes.set(chatId, recent); return true;
}
export async function rememberTelegramSignal(chatId: number, signal: GameSignal, input: Record<string, unknown>): Promise<AnalysisRecord> {
  const state = await getTelegramUser(chatId);
  if (signal.roundId && ((state.signalHistory[signal.gameId] ?? []).some(record => record.signal.roundId === signal.roundId) || (state.completedResults[signal.gameId] ?? []).some(result => result.roundId === signal.roundId) || (signal.gameId === "mines" && state.rounds.some(round => round.id === signal.roundId)))) throw new TelegramStoreError("This round already has a signal or completed result; no replacement was stored.");
  const record: AnalysisRecord = { id: randomUUID(), signal, input: structuredClone(input), recordedAt: new Date().toISOString() };
  await updateTelegramUser(chatId, { signalHistory: { ...state.signalHistory, [signal.gameId]: [record, ...(state.signalHistory[signal.gameId as GameId] ?? [])].slice(0, MAX_HISTORY) } });
  return record;
}
export async function rememberTelegramCompletedResult(chatId: number, result: CompletedGameResult): Promise<boolean> {
  const state = await getTelegramUser(chatId);
  const history = state.completedResults[result.gameId] ?? [];
  const prior = history.find(item => item.roundId === result.roundId);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(result)) throw new TelegramStoreError("This round has a conflicting saved result; the original was preserved.");
    return false;
  }
  await updateTelegramUser(chatId, { completedResults: { ...state.completedResults, [result.gameId]: [result, ...history].sort((a,b) => Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0, MAX_HISTORY) } });
  return true;
}
/** Only a genuine server-side adapter may call this. Browser records are not automatically shared. */
export async function rememberTelegramRound(round: GameRound): Promise<TelegramUserState[]> {
  const parsed = parseGameRound(round);
  const checked = { ...parsed, source: round.source };
  const ids = configuration() ? await redis(["SMEMBERS", key("users")]) : [...userStates.keys()];
  if (!Array.isArray(ids)) throw new TelegramStoreError();
  const recipients: TelegramUserState[] = [];
  for (const raw of ids) {
    const chatId = Number(raw);
    if (!Number.isSafeInteger(chatId) || chatId <= 0) continue;
    await withTelegramUserLock(chatId, async () => {
      const user = await getTelegramUser(chatId);
      const prior = user.rounds.find(item => item.id === checked.id);
      if (prior) {
        if (!roundsEquivalent(prior, checked)) throw new TelegramStoreError("Conflicting completed round was preserved.");
        return;
      }
      const next = await updateTelegramUser(chatId, { rounds: [checked, ...user.rounds].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0, MAX_HISTORY) });
      if (next.notificationsEnabled) recipients.push(next);
    });
  }
  return recipients;
}
export const TELEGRAM_GAME_IDS = GAME_IDS;
