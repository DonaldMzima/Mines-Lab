import {
  GAME_ID, isPositionList, isRecord, parseFairness, parseGameRound, parseProviderState,
  roundsEquivalent, SUPPORTED_BOMB_COUNTS,
} from "@/lib/mines";
import type { FairnessMetadata, GameMode, GameRound, ProviderState, RoundResult } from "@/lib/mines";

export type RoundStatus = "pending" | "active" | "completed" | "unknown";
export type RoundTrackingSource = "provider" | "import" | "manual" | "demo";
export const MAX_TRACKED_ROUNDS = 1000;
const MAX_TRACKED_EVENT_IDS = 2000;

export interface LiveMinesRound {
  id: string;
  gameId: string;
  status: RoundStatus;
  outcome: RoundResult;
  mineCount?: number;
  selectedTiles: number[];
  revealedMines?: number[];
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  cashoutAmount?: number;
  currency?: string;
  mode?: GameMode;
  fairness?: FairnessMetadata;
  providerState?: ProviderState;
  source: RoundTrackingSource;
}

interface EventIdentity {
  eventId?: string;
  sequence?: number;
}

export interface OpenRoundEvent extends EventIdentity {
  type: "round-start" | "round-update";
  roundId: string;
  gameId: string;
  occurredAt: string;
  mineCount?: number;
  selectedTiles: number[];
  status?: "pending" | "active" | "unknown";
  currency?: string;
  mode?: GameMode;
  fairness?: FairnessMetadata;
  providerState?: ProviderState;
}

export interface CompletedRoundEvent extends EventIdentity {
  type: "round-completed";
  occurredAt: string;
  round: GameRound;
}

export type MinesRoundEvent = OpenRoundEvent | CompletedRoundEvent;

interface RoundOrdering {
  occurredAt: string;
  sequence?: number;
  signature: string;
}

export interface RoundTrackerState {
  currentRound: LiveMinesRound | null;
  rounds: ReadonlyMap<string, LiveMinesRound>;
  completedRounds: ReadonlyMap<string, GameRound>;
  ordering: ReadonlyMap<string, RoundOrdering>;
  eventSignatures: ReadonlyMap<string, string>;
  // Keep terminal ids for the session even after their detailed state leaves the bounded maps.
  terminalIds: ReadonlySet<string>;
  lastCompletedAt: string | null;
}

export interface RoundTrackingResult {
  state: RoundTrackerState;
  completedRound?: GameRound;
  duplicate: boolean;
  ignored: boolean;
  issues: string[];
}

export function createRoundTrackerState(): RoundTrackerState {
  return {
    currentRound: null, rounds: new Map(), completedRounds: new Map(),
    ordering: new Map(), eventSignatures: new Map(), terminalIds: new Set(), lastCompletedAt: null,
  };
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty text.`);
  return value;
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${field} must be a valid timestamp.`);
  return new Date(result).toISOString();
}

export function parseMinesRoundEvent(value: unknown): MinesRoundEvent {
  if (!isRecord(value)) throw new Error("A round event must be an object.");
  const identity: EventIdentity = {};
  if (value.eventId !== undefined) identity.eventId = text(value.eventId, "eventId");
  if (value.sequence !== undefined) {
    if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
      throw new Error("Event sequence must be a non-negative safe integer.");
    }
    identity.sequence = value.sequence;
  }
  if (value.type === "round-completed") {
    const round = parseGameRound(value.round);
    const occurredAt = value.occurredAt === undefined ? round.timestamp : timestamp(value.occurredAt, "occurredAt");
    if (occurredAt !== round.timestamp) throw new Error("Completion event time must match the completed round timestamp.");
    return { type: "round-completed", ...identity, occurredAt, round };
  }
  if (value.type !== "round-start" && value.type !== "round-update") {
    throw new Error("Unsupported round event type. Use round-start, round-update, or round-completed.");
  }
  const roundId = text(value.roundId, "roundId");
  if (value.gameId !== GAME_ID) throw new Error("Round event is not for the supported Mines game.");
  const occurredAt = timestamp(value.occurredAt, "occurredAt");
  const mineCount = value.mineCount;
  if (mineCount !== undefined && (typeof mineCount !== "number" || !SUPPORTED_BOMB_COUNTS.some((count) => count === mineCount))) {
    throw new Error("Round event has an unsupported mine count.");
  }
  const selectedTiles = value.selectedTiles === undefined ? [] : value.selectedTiles;
  if (!isPositionList(selectedTiles)) throw new Error("Known selected tiles must be unique integer positions from 0 to 24.");
  if (value.revealedMines !== undefined || value.minePositions !== undefined || value.completedAt !== undefined) {
    throw new Error("Use an explicit round-completed event to provide a terminal outcome and revealed mines.");
  }
  const status = value.status;
  if (status !== undefined && status !== "pending" && status !== "active" && status !== "unknown") {
    throw new Error("A non-terminal update cannot establish completion.");
  }
  if (value.type === "round-start" && status !== undefined && status !== "active") {
    throw new Error("An explicit round-start event establishes an active round.");
  }
  const mode = value.mode;
  if (mode !== undefined && mode !== "demo" && mode !== "real" && mode !== "unknown") throw new Error("Unsupported round mode.");
  const currency = value.currency;
  if (currency !== undefined && (typeof currency !== "string" || !currency.trim() || currency.length > 24)) {
    throw new Error("Round currency must be non-empty text of at most 24 characters.");
  }
  const fairness = parseFairness(value.fairness);
  const providerState = parseProviderState(value.providerState);
  return {
    type: value.type, ...identity, roundId, gameId: GAME_ID, occurredAt,
    selectedTiles: [...selectedTiles],
    ...(mineCount !== undefined ? { mineCount } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(fairness !== undefined ? { fairness } : {}),
    ...(providerState !== undefined ? { providerState } : {}),
  };
}

function mergeFairness(previous?: FairnessMetadata, incoming?: FairnessMetadata): FairnessMetadata | undefined {
  if (!previous) return incoming;
  if (!incoming) return previous;
  for (const key of ["seedId", "serverSeedHash", "clientSeed", "nonce", "algorithm"] as const) {
    if (previous[key] !== undefined && incoming[key] !== undefined && previous[key] !== incoming[key]) {
      throw new Error(`Fairness ${key} changed within the same round.`);
    }
  }
  return { ...previous, ...incoming };
}

export function trackRoundEvent(
  state: RoundTrackerState,
  input: unknown,
  source: RoundTrackingSource = "provider",
): RoundTrackingResult {
  const ignore = (issue?: string, duplicate = false): RoundTrackingResult => ({
    state, duplicate, ignored: true, issues: issue ? [issue] : [],
  });
  try {
    const event = parseMinesRoundEvent(input);
    const id = event.type === "round-completed" ? event.round.id : event.roundId;
    const signature = JSON.stringify(event);
    if (event.eventId !== undefined) {
      const priorSignature = state.eventSignatures.get(event.eventId);
      if (priorSignature !== undefined) return priorSignature === signature
        ? ignore(undefined, true) : ignore(`Event "${event.eventId}" was reused with conflicting data.`);
    }
    const prior = state.rounds.get(id);
    const priorOrder = state.ordering.get(id);
    const terminal = state.completedRounds.get(id);
    if (!prior && state.terminalIds.has(id)) return ignore(`Round "${id}" already completed earlier in this tracking session; repeated events were ignored.`);
    if (!prior && state.rounds.size >= MAX_TRACKED_ROUNDS && ![...state.rounds.values()].some((round) => round.status === "completed")) {
      return ignore(`The tracker already holds ${MAX_TRACKED_ROUNDS} unfinished rounds; new round state was rejected.`);
    }
    if (terminal && event.type !== "round-completed") {
      return ignore(Date.parse(event.occurredAt) > Date.parse(terminal.timestamp)
        ? `Round "${id}" is completed and cannot be reopened.` : undefined);
    }
    if (priorOrder && !terminal) {
      if (priorOrder.signature === signature) return ignore(undefined, true);
      if (event.sequence !== undefined && priorOrder.sequence !== undefined && event.sequence <= priorOrder.sequence) {
        return ignore(event.sequence === priorOrder.sequence ? `Round "${id}" reused a sequence number with different data.` : undefined);
      }
      if (Date.parse(event.occurredAt) < Date.parse(priorOrder.occurredAt)) return ignore();
    }

    let completedRound: GameRound | undefined;
    let nextRound: LiveMinesRound;
    if (event.type === "round-completed") {
      if (prior?.mineCount !== undefined && prior.mineCount !== event.round.bombCount) throw new Error(`Round "${id}" changed mine count.`);
      if (prior?.mode && prior.mode !== "unknown" && event.round.mode && event.round.mode !== "unknown" && prior.mode !== event.round.mode) {
        throw new Error(`Round "${id}" changed game mode.`);
      }
      if (prior?.currency && event.round.currency && prior.currency !== event.round.currency) throw new Error(`Round "${id}" changed currency.`);
      const normalized = parseGameRound({
        ...event.round,
        selectedPositions: [...new Set([...(prior?.selectedTiles ?? []), ...event.round.selectedPositions])],
        fairness: mergeFairness(prior?.fairness, event.round.fairness),
        currency: event.round.currency ?? prior?.currency,
        mode: event.round.mode === "unknown" ? prior?.mode ?? event.round.mode : event.round.mode ?? prior?.mode,
        providerState: event.round.providerState ?? prior?.providerState,
      });
      if (terminal) return roundsEquivalent(terminal, normalized)
        ? ignore(undefined, true) : ignore(`Completed round "${id}" has conflicting data; the original result is immutable.`);
      completedRound = { ...normalized, source };
      nextRound = {
        id, gameId: completedRound.gameId, status: "completed", outcome: completedRound.result,
        mineCount: completedRound.bombCount, selectedTiles: [...completedRound.selectedPositions],
        revealedMines: [...completedRound.minePositions], completedAt: completedRound.timestamp,
        ...(prior?.startedAt ? { startedAt: prior.startedAt } : {}), updatedAt: event.occurredAt,
        cashoutAmount: completedRound.cashoutAmount, currency: completedRound.currency,
        mode: completedRound.mode, fairness: completedRound.fairness,
        providerState: completedRound.providerState, source,
      };
    } else {
      if (event.type === "round-start" && prior?.startedAt) return ignore(
        `Round "${id}" already started; conflicting start data cannot replace its original event.`,
      );
      if (prior?.mineCount !== undefined && event.mineCount !== undefined && prior.mineCount !== event.mineCount) throw new Error(`Round "${id}" changed mine count.`);
      if (prior?.mode && prior.mode !== "unknown" && event.mode && event.mode !== "unknown" && prior.mode !== event.mode) throw new Error(`Round "${id}" changed game mode.`);
      if (prior?.currency && event.currency && prior.currency !== event.currency) throw new Error(`Round "${id}" changed currency.`);
      const startedAt = event.type === "round-start" ? event.occurredAt : prior?.startedAt;
      const requestedStatus = event.type === "round-start" ? "active" : event.status ?? prior?.status ?? "active";
      nextRound = {
        id, gameId: event.gameId, status: startedAt ? (requestedStatus === "pending" ? "active" : requestedStatus) : requestedStatus === "pending" ? "pending" : "unknown",
        outcome: "unknown", mineCount: event.mineCount ?? prior?.mineCount,
        selectedTiles: [...new Set([...(prior?.selectedTiles ?? []), ...event.selectedTiles])],
        ...(startedAt ? { startedAt } : {}), updatedAt: event.occurredAt,
        currency: event.currency ?? prior?.currency,
        mode: event.mode === "unknown" ? prior?.mode ?? event.mode : event.mode ?? prior?.mode,
        fairness: mergeFairness(prior?.fairness, event.fairness),
        providerState: event.providerState ?? prior?.providerState, source,
      };
    }

    const rounds = new Map(state.rounds).set(id, nextRound);
    const completedRounds = new Map(state.completedRounds);
    const terminalIds = new Set(state.terminalIds);
    if (completedRound) {
      completedRounds.set(id, completedRound);
      terminalIds.add(id);
    }
    const ordering = new Map(state.ordering).set(id, {
      occurredAt: event.occurredAt, sequence: event.sequence ?? priorOrder?.sequence, signature,
    });
    const eventSignatures = new Map(state.eventSignatures);
    if (event.eventId !== undefined) eventSignatures.set(event.eventId, signature);
    while (eventSignatures.size > MAX_TRACKED_EVENT_IDS) {
      const oldest = eventSignatures.keys().next().value;
      if (oldest === undefined) break;
      eventSignatures.delete(oldest);
    }
    for (const [roundId, round] of rounds) {
      if (rounds.size <= MAX_TRACKED_ROUNDS) break;
      if (round.status !== "completed") continue;
      rounds.delete(roundId);
      completedRounds.delete(roundId);
      ordering.delete(roundId);
    }
    const currentRound = !state.currentRound || state.currentRound.id === id || Date.parse(nextRound.updatedAt) > Date.parse(state.currentRound.updatedAt)
      ? nextRound : state.currentRound;
    const lastCompletedAt = completedRound && (!state.lastCompletedAt || Date.parse(completedRound.timestamp) > Date.parse(state.lastCompletedAt))
      ? completedRound.timestamp : state.lastCompletedAt;
    return {
      state: { currentRound, rounds, completedRounds, ordering, eventSignatures, terminalIds, lastCompletedAt },
      ...(completedRound ? { completedRound } : {}), duplicate: false, ignored: false, issues: [],
    };
  } catch (error) {
    return ignore(error instanceof Error ? error.message : "Invalid round event.");
  }
}
