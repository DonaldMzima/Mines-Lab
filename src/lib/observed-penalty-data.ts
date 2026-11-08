import { isRecord, parseFairness, parseProviderState } from "@/lib/mines";
import type { FairnessMetadata, GameMode, ProviderState } from "@/lib/mines";
import { PENALTY_GAME_ID } from "@/lib/penalty";

export const PENALTY_INTEGRATION_KEY = "vgsonewin2_penalty";

export interface ObservedPenaltyShotRequest {
  roundId: string;
  row: number;
  col: number;
  betAmount: number;
}

export interface ObservedPenaltyResponse {
  messageId: string;
  providerState: ProviderState;
  cashout?: number;
  fairness?: FairnessMetadata;
  /** Present in the observed schema, but its semantics and timing are unverified. */
  catches: unknown;
  status: "in-progress" | "unclassified";
  terminal: false;
}

export interface PenaltyObservationSession {
  request: ObservedPenaltyShotRequest;
  startedAt: string;
  lastObservedAt: string;
  responseFingerprints: ReadonlySet<string>;
}

export interface PenaltyObservationState {
  readonly sessions: ReadonlyMap<string, PenaltyObservationSession>;
}

export interface PenaltyObservationResult {
  state: PenaltyObservationState;
  response?: ObservedPenaltyResponse;
  duplicate: boolean;
  issue?: string;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error(`${field} must be non-empty text of at most 200 characters.`);
  return value.trim();
}

function timestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error("Observed time must be a valid timestamp.");
  return new Date(value).toISOString();
}

function coordinate(value: unknown, field: string): number {
  // The goal layout is not yet documented. Validate only structural safety;
  // do not infer a direction, grid size, or row-major mapping.
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 999) {
    throw new Error(`${field} must be a non-negative safe integer no greater than 999.`);
  }
  return value;
}

export function parseObservedPenaltyMode(value: unknown): GameMode {
  if (!isRecord(value) || typeof value.isDemo !== "boolean") throw new Error("Observed Penalty mode must include boolean isDemo.");
  // true is explicitly observed as demo. false is not enough evidence to claim
  // a real-money mode without a provider mode contract.
  return value.isDemo ? "demo" : "unknown";
}

export function parseObservedPenaltyShotRequest(value: unknown): ObservedPenaltyShotRequest {
  if (!isRecord(value)) throw new Error("Observed Penalty shot request must be an object.");
  const betAmount = value.bet_amount;
  if (typeof betAmount !== "number" || !Number.isFinite(betAmount) || betAmount <= 0) {
    throw new Error("bet_amount must be a finite positive number.");
  }
  return { roundId: text(value.id, "Round id"), row: coordinate(value.row, "row"), col: coordinate(value.col, "col"), betAmount };
}

export function parseObservedPenaltyResponse(value: unknown): ObservedPenaltyResponse {
  if (!isRecord(value) || !isRecord(value.outcome) || value.outcome.catches === undefined) {
    throw new Error("Observed Penalty response must include outcome.catches.");
  }
  const providerState = parseProviderState(value.state);
  if (providerState === undefined) throw new Error("Observed Penalty response must include a state code.");
  const cashout = value.cashout;
  if (cashout !== undefined && (typeof cashout !== "number" || !Number.isFinite(cashout) || cashout < 0)) {
    throw new Error("cashout must be a finite non-negative number when supplied.");
  }
  return {
    messageId: text(value.ms_id, "ms_id"),
    providerState,
    catches: value.outcome.catches,
    // Only state 2 has been observed in progress. No other state is mapped.
    status: providerState === 2 ? "in-progress" : "unclassified",
    terminal: false,
    ...(cashout === undefined ? {} : { cashout }),
    ...(value.fair === undefined ? {} : { fairness: parseFairness(value.fair) }),
  };
}

export function createPenaltyObservationState(): PenaltyObservationState {
  return { sessions: new Map() };
}

function withSession(state: PenaltyObservationState, id: string, session: PenaltyObservationSession): PenaltyObservationState {
  return { sessions: new Map(state.sessions).set(id, session) };
}

function fingerprint(response: ObservedPenaltyResponse): string {
  try {
    return JSON.stringify({ messageId: response.messageId, state: response.providerState, cashout: response.cashout, catches: response.catches });
  } catch {
    throw new Error("outcome.catches must be JSON-compatible observed data.");
  }
}

/** Records a gameplay observation only; it never issues a gameplay request. */
export function observePenaltyShot(
  state: PenaltyObservationState,
  payload: unknown,
  capturedAt: string,
): PenaltyObservationResult {
  try {
    const request = parseObservedPenaltyShotRequest(payload);
    const occurredAt = timestamp(capturedAt);
    const prior = state.sessions.get(request.roundId);
    if (prior) {
      const same = prior.request.row === request.row && prior.request.col === request.col && prior.request.betAmount === request.betAmount;
      return same ? { state, duplicate: true } : { state, duplicate: false, issue: `Observed Penalty round "${request.roundId}" was reused with different shot details.` };
    }
    return {
      state: withSession(state, request.roundId, { request, startedAt: occurredAt, lastObservedAt: occurredAt, responseFingerprints: new Set() }),
      duplicate: false,
    };
  } catch (error) {
    return { state, duplicate: false, issue: error instanceof Error ? error.message : "Invalid observed Penalty shot request." };
  }
}

/**
 * A response has no documented round identifier, so callers must supply the
 * independently observed request id. ms_id is retained as a message id only.
 * This intentionally never produces a completed result.
 */
export function observePenaltyResponse(
  state: PenaltyObservationState,
  payload: unknown,
  capturedAt: string,
  observedRoundId: string,
): PenaltyObservationResult {
  try {
    const roundId = text(observedRoundId, "Observed round id");
    const response = parseObservedPenaltyResponse(payload);
    const occurredAt = timestamp(capturedAt);
    const prior = state.sessions.get(roundId);
    if (!prior) return { state, duplicate: false, issue: `Observed Penalty response cannot be matched to round "${roundId}".` };
    if (Date.parse(occurredAt) < Date.parse(prior.lastObservedAt)) {
      return { state, duplicate: false, issue: `Observed Penalty response for round "${roundId}" is older than its known state.` };
    }
    const id = fingerprint(response);
    if (prior.responseFingerprints.has(id)) return { state, duplicate: true };
    const next = withSession(state, roundId, {
      ...prior,
      lastObservedAt: occurredAt,
      responseFingerprints: new Set([...prior.responseFingerprints, id]),
    });
    return { state: next, response, duplicate: false };
  } catch (error) {
    return { state, duplicate: false, issue: error instanceof Error ? error.message : "Invalid observed Penalty response." };
  }
}

export const OBSERVED_PENALTY_GAME_ID = PENALTY_GAME_ID;
