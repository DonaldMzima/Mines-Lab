import {
  GAME_ID,
  isPositionList,
  isRecord,
  parseFairness,
  parseGameRound,
  parseProviderState,
  SUPPORTED_BOMB_COUNTS,
  TOTAL_TILES,
} from "@/lib/mines";
import type { FairnessMetadata, GameRound, ProviderState } from "@/lib/mines";
import type { MinesRoundEvent } from "@/lib/round-tracker";

/**
 * These parsers describe observed browser payloads only. They never send a
 * request, obtain credentials, or establish a provider connection.
 */
export interface ObservedRoundStartRequest {
  roundId: string;
  betAmount: number;
  isFreebet: boolean;
}

export interface ObservedTileSelectionRequest {
  roundId: string;
  row: number;
  col: number;
  tileIndex: number;
  isFreebet: boolean;
}

export interface ObservedCompletedRoundResponse {
  providerState: ProviderState;
  minePositions: number[];
  fairness?: FairnessMetadata;
  cashoutAmount?: number;
}

export interface ObservedRoundSession {
  start: ObservedRoundStartRequest;
  startedAt: string;
  selectedTiles: number[];
  lastObservedAt: string;
  completed?: ObservedCompletedRoundResponse;
}

export interface ObservedRoundSyncState {
  readonly sessions: ReadonlyMap<string, ObservedRoundSession>;
}

export type ObservedRoundSyncResult = {
  state: ObservedRoundSyncState;
  event?: MinesRoundEvent;
  duplicate: boolean;
  issue?: string;
  correlation?: "round-id" | "single-open-request";
};

function nonEmptyText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new Error(`${field} must be non-empty text of at most 200 characters.`);
  }
  return value.trim();
}

function observedTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error("Observed time must be a valid timestamp.");
  return new Date(value).toISOString();
}

function finitePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number.`);
  }
  return value;
}

function boardCoordinate(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) {
    throw new Error(`${field} must be an integer from 0 to 4.`);
  }
  return value;
}

function freebet(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("is_freebet must be a boolean.");
  return value;
}

export function parseObservedRoundStartRequest(value: unknown): ObservedRoundStartRequest {
  if (!isRecord(value)) throw new Error("Observed round-start request must be an object.");
  return {
    roundId: nonEmptyText(value.id, "Round id"),
    betAmount: finitePositive(value.bet_amount, "bet_amount"),
    isFreebet: freebet(value.is_freebet),
  };
}

export function parseObservedTileSelectionRequest(value: unknown): ObservedTileSelectionRequest {
  if (!isRecord(value)) throw new Error("Observed tile-selection request must be an object.");
  const row = boardCoordinate(value.row, "row");
  const col = boardCoordinate(value.col, "col");
  return {
    roundId: nonEmptyText(value.id, "Round id"),
    row,
    col,
    tileIndex: row * 5 + col,
    isFreebet: freebet(value.is_freebet),
  };
}

export function parseObservedCompletedRoundResponse(value: unknown): ObservedCompletedRoundResponse {
  if (!isRecord(value) || !isRecord(value.outcome)) {
    throw new Error("Observed completed result must include outcome.mines.");
  }
  const providerState = parseProviderState(value.state);
  if (providerState === undefined) throw new Error("Observed completed result must include a state code.");
  const minePositions = value.outcome.mines;
  if (!isPositionList(minePositions) || !SUPPORTED_BOMB_COUNTS.some((count) => count === minePositions.length)) {
    throw new Error("Observed outcome.mines must contain a supported number of unique positions from 0 to 24.");
  }
  const cashoutAmount = value.cashout_amount;
  if (cashoutAmount !== undefined && (typeof cashoutAmount !== "number" || !Number.isFinite(cashoutAmount) || cashoutAmount < 0)) {
    throw new Error("Observed cashout_amount must be a finite non-negative number.");
  }
  return {
    providerState,
    minePositions: [...minePositions].sort((first, second) => first - second),
    ...(value.fair !== undefined ? { fairness: parseFairness(value.fair) } : {}),
    ...(cashoutAmount !== undefined ? { cashoutAmount } : {}),
  };
}

export function createObservedRoundSyncState(): ObservedRoundSyncState {
  return { sessions: new Map() };
}

function result(state: ObservedRoundSyncState, event?: MinesRoundEvent, duplicate = false, issue?: string, correlation?: ObservedRoundSyncResult["correlation"]): ObservedRoundSyncResult {
  return { state, ...(event ? { event } : {}), duplicate, ...(issue ? { issue } : {}), ...(correlation ? { correlation } : {}) };
}

function withSession(state: ObservedRoundSyncState, id: string, session: ObservedRoundSession): ObservedRoundSyncState {
  return { sessions: new Map(state.sessions).set(id, session) };
}

export function observeRoundStart(
  state: ObservedRoundSyncState,
  payload: unknown,
  capturedAt: string,
): ObservedRoundSyncResult {
  try {
    const start = parseObservedRoundStartRequest(payload);
    const occurredAt = observedTimestamp(capturedAt);
    const prior = state.sessions.get(start.roundId);
    if (prior) {
      const sameStart = prior.start.betAmount === start.betAmount && prior.start.isFreebet === start.isFreebet;
      return sameStart
        ? result(state, undefined, true)
        : result(state, undefined, false, `Observed round "${start.roundId}" was reused with different start details.`);
    }
    const next = withSession(state, start.roundId, { start, startedAt: occurredAt, selectedTiles: [], lastObservedAt: occurredAt });
    return result(next, { type: "round-start", roundId: start.roundId, gameId: GAME_ID, occurredAt, selectedTiles: [] });
  } catch (error) {
    return result(state, undefined, false, error instanceof Error ? error.message : "Invalid observed round-start request.");
  }
}

export function observeTileSelection(
  state: ObservedRoundSyncState,
  payload: unknown,
  capturedAt: string,
): ObservedRoundSyncResult {
  try {
    const selection = parseObservedTileSelectionRequest(payload);
    const occurredAt = observedTimestamp(capturedAt);
    const prior = state.sessions.get(selection.roundId);
    if (!prior) return result(state, undefined, false, `Observed selection refers to unknown round "${selection.roundId}".`);
    if (prior.completed) return result(state, undefined, false, `Observed selection refers to completed round "${selection.roundId}".`);
    if (prior.start.isFreebet !== selection.isFreebet) return result(state, undefined, false, `Observed selection changed the freebet mode for round "${selection.roundId}".`);
    if (Date.parse(occurredAt) < Date.parse(prior.lastObservedAt)) return result(state, undefined, false, `Observed selection for round "${selection.roundId}" is older than its known state.`);
    if (prior.selectedTiles.includes(selection.tileIndex)) return result(state, undefined, true);
    const selectedTiles = [...prior.selectedTiles, selection.tileIndex];
    const next = withSession(state, selection.roundId, { ...prior, selectedTiles, lastObservedAt: occurredAt });
    return result(next, { type: "round-update", roundId: selection.roundId, gameId: GAME_ID, occurredAt, selectedTiles });
  } catch (error) {
    return result(state, undefined, false, error instanceof Error ? error.message : "Invalid observed tile-selection request.");
  }
}

/**
 * Completion payloads do not have a documented round id. A caller may provide
 * an independently observed id; otherwise there must be exactly one open,
 * non-future request in this local observation session.
 */
export function observeCompletedRound(
  state: ObservedRoundSyncState,
  payload: unknown,
  capturedAt: string,
  observedRoundId?: string,
): ObservedRoundSyncResult {
  try {
    const completed = parseObservedCompletedRoundResponse(payload);
    const occurredAt = observedTimestamp(capturedAt);
    const explicitId = observedRoundId === undefined ? undefined : nonEmptyText(observedRoundId, "Observed round id");
    const candidates = explicitId
      ? [state.sessions.get(explicitId)].filter((session): session is ObservedRoundSession => Boolean(session))
      : [...state.sessions.values()].filter((session) => !session.completed && Date.parse(session.lastObservedAt) <= Date.parse(occurredAt));
    if (candidates.length !== 1) {
      return result(state, undefined, false, explicitId
        ? `Observed completion cannot be matched to round "${explicitId}".`
        : "Observed completion has no documented round id and cannot be matched unambiguously to one open round.");
    }
    const session = candidates[0];
    const roundId = explicitId ?? session.start.roundId;
    if (session.completed) {
      const same = JSON.stringify(session.completed) === JSON.stringify(completed);
      return same ? result(state, undefined, true) : result(state, undefined, false, `Observed completion conflicts with the earlier result for round "${roundId}".`);
    }
    if (Date.parse(occurredAt) < Date.parse(session.lastObservedAt)) {
      return result(state, undefined, false, `Observed completion for round "${roundId}" is older than its known state.`);
    }
    const round: GameRound = parseGameRound({
      id: roundId,
      gameId: GAME_ID,
      timestamp: occurredAt,
      completed: true,
      bombCount: completed.minePositions.length,
      minePositions: completed.minePositions,
      selectedPositions: session.selectedTiles,
      // State codes have no documented result mapping, so completion remains unknown.
      result: "unknown",
      providerState: completed.providerState,
      ...(completed.fairness ? { fairness: completed.fairness } : {}),
      ...(completed.cashoutAmount !== undefined ? { cashoutAmount: completed.cashoutAmount } : {}),
    });
    const next = withSession(state, roundId, { ...session, completed, lastObservedAt: occurredAt });
    return result(next, { type: "round-completed", occurredAt, round }, false, undefined, explicitId ? "round-id" : "single-open-request");
  } catch (error) {
    return result(state, undefined, false, error instanceof Error ? error.message : "Invalid observed completed-round response.");
  }
}

export function tileIndexFromObservedCoordinates(row: number, col: number): number {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 4 || col < 0 || col > 4) {
    throw new RangeError("Observed row and col must be integers from 0 to 4.");
  }
  return row * 5 + col;
}

export const OBSERVED_MINES_BOARD_SIZE = TOTAL_TILES;
