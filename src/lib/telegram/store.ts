import type { GameRound } from "@/lib/mines";
import type { SignalResult } from "@/lib/signals/types";

export interface TelegramUserState {
  chatId: number;
  mineCount: 2 | 3 | 5 | 7;
  selectedTiles: number[];
  latestSignal?: SignalResult;
  rounds: GameRound[];
}

const userStates = new Map<number, TelegramUserState>();
const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_UPDATES = 10_000;
const MAX_ROUNDS_PER_USER = 20;
const actionTimes = new Map<number, number[]>();
const ACTION_WINDOW_MS = 60_000;
const MAX_ACTIONS_PER_WINDOW = 20;

export function claimTelegramUpdate(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) return false;
  processedUpdateIds.add(updateId);
  while (processedUpdateIds.size > MAX_PROCESSED_UPDATES) {
    const oldest = processedUpdateIds.values().next().value;
    if (oldest === undefined) break;
    processedUpdateIds.delete(oldest);
  }
  return true;
}

/** Releases a failed update so Telegram's documented webhook retry can process it again. */
export function releaseTelegramUpdate(updateId: number): void {
  processedUpdateIds.delete(updateId);
}

export function getTelegramUser(chatId: number): TelegramUserState {
  const current = userStates.get(chatId);
  if (current) return current;
  const next: TelegramUserState = { chatId, mineCount: 3, selectedTiles: [], rounds: [] };
  userStates.set(chatId, next);
  return next;
}

export function updateTelegramUser(chatId: number, changes: Partial<Omit<TelegramUserState, "chatId">>): TelegramUserState {
  const next = { ...getTelegramUser(chatId), ...changes };
  userStates.set(chatId, next);
  return next;
}

export function allowTelegramAction(chatId: number, now = Date.now()): boolean {
  const recent = (actionTimes.get(chatId) ?? []).filter((time) => now - time < ACTION_WINDOW_MS);
  if (recent.length >= MAX_ACTIONS_PER_WINDOW) {
    actionTimes.set(chatId, recent);
    return false;
  }
  recent.push(now);
  actionTimes.set(chatId, recent);
  return true;
}

export function rememberTelegramRound(round: GameRound): TelegramUserState[] {
  const updated: TelegramUserState[] = [];
  for (const user of userStates.values()) {
    if (user.rounds.some((item) => item.id === round.id)) continue;
    const next = { ...user, rounds: [round, ...user.rounds].slice(0, MAX_ROUNDS_PER_USER) };
    userStates.set(user.chatId, next);
    updated.push(next);
  }
  return updated;
}

/** Process-local store only. Configure durable shared storage before multi-instance production deployment. */
