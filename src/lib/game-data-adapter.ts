import { parseGameRoundImport, roundsEquivalent } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { parseMinesRoundEvent } from "@/lib/round-tracker";
import type { MinesRoundEvent } from "@/lib/round-tracker";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type AdapterConnectionState = ConnectionStatus;

export interface GameDataAdapter {
  // Implementations must make these idempotent and cancel pending connection/reconnect work on disconnect.
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  isConnected(): boolean;
  getConnectionState(): AdapterConnectionState;
  getCompletedRounds(): Promise<GameRound[]>;
  onCompletedRound(listener: (round: GameRound) => void): () => void;
  onRoundEvent?(listener: (event: unknown) => void): () => void;
  onConnectionStateChange(
    listener: (state: AdapterConnectionState) => void,
  ): () => void;
  onError(listener: (error: Error) => void): () => void;
}

export interface GameDataHandlers {
  onRounds(rounds: GameRound[]): void;
  onStatus(status: ConnectionStatus): void;
  onError(message: string): void;
  onRoundEvent?(event: MinesRoundEvent): void;
  onInitialSync?(result: InitialRoundSync): void;
}

export interface InitialRoundSync {
  completedRoundCount: number;
  checkedAt: string;
}

export interface GameDataSubscriptionOptions {
  readInitialHistory?: boolean;
}

/** A supported read-only adapter request plus schema validation, not a transport-only check. */
export async function readValidatedCompletedRounds(adapter: GameDataAdapter): Promise<GameRound[]> {
  const payload: unknown = await adapter.getCompletedRounds();
  if (!Array.isArray(payload)) throw new Error("Completed-round history must be returned as an array.");
  if (payload.length === 0) return [];
  const report = parseGameRoundImport(payload);
  if (report.rejected || report.errors.length) throw new Error(report.errors.slice(0, 5).join(" ") || "Completed-round history contains invalid records.");
  return report.rounds.map((round) => ({ ...round, source: "provider" }));
}

const adapterSubscriptions = new WeakMap<GameDataAdapter, () => void>();

/** Starts only the supplied adapter; no provider transport or endpoint is configured here. */
export function subscribeToGameData(
  adapter: GameDataAdapter,
  handlers: GameDataHandlers,
  options: GameDataSubscriptionOptions = {},
): () => void {
  adapterSubscriptions.get(adapter)?.();
  let active = true;
  const unsubscribe: (() => void)[] = [];
  const seen = new Map<string, GameRound>();

  function report(error: unknown) {
    if (active) handlers.onError(error instanceof Error ? error.message : "The data source reported an error.");
  }

  function receive(payload: unknown): boolean {
    if (!active) return false;
    if (Array.isArray(payload) && payload.length === 0) return true;
    try {
      const result = parseGameRoundImport(payload);
      let valid = result.rejected === 0;
      for (const error of result.errors) report(new Error(error));
      const incoming: GameRound[] = [];
      for (const round of result.rounds) {
        const previous = seen.get(round.id);
        if (!previous) incoming.push({ ...round, source: "provider" });
        else if (!roundsEquivalent(previous, round)) {
          valid = false;
          report(new Error(`The data source sent conflicting results for round "${round.id}". The original result was retained.`));
        }
      }
      if (incoming.length > 0) {
        // A single snapshot reaches the application as one batch, including evaluation/statistic updates.
        handlers.onRounds(incoming);
        for (const round of incoming) seen.set(round.id, round);
        // The lifecycle engine/history retain terminal identity beyond this recent-payload cache.
        while (seen.size > 1000) {
          const oldest = seen.keys().next().value;
          if (oldest === undefined) break;
          seen.delete(oldest);
        }
      }
      return valid;
    } catch (error) {
      report(error);
      return false;
    }
  }

  function receiveEvent(payload: unknown) {
    if (!active) return;
    try {
      const event = parseMinesRoundEvent(payload);
      // Lifecycle consumers need the event identity and ordering even for terminal messages.
      if (handlers.onRoundEvent) handlers.onRoundEvent(event);
      else if (event.type === "round-completed") receive(event.round);
    } catch (error) {
      report(error);
    }
  }

  function statusChanged(status: ConnectionStatus) {
    if (!active) return;
    if (!["disconnected", "connecting", "connected", "reconnecting", "error"].includes(status)) {
      report(new Error("The data source reported an invalid connection status."));
      return;
    }
    handlers.onStatus(status);
  }

  async function disconnect() {
    // A new subscription may already own this adapter after an earlier connect resolves.
    const owner = adapterSubscriptions.get(adapter);
    if (owner && owner !== stop) return;
    try {
      await adapter.disconnect();
    } catch (error) {
      report(error);
    }
  }

  async function start() {
    try {
      // Subscribe before the initial snapshot to avoid losing rounds received while it loads.
      unsubscribe.push(adapter.onCompletedRound(receive));
      if (adapter.onRoundEvent) unsubscribe.push(adapter.onRoundEvent(receiveEvent));
      unsubscribe.push(adapter.onConnectionStateChange(statusChanged));
      unsubscribe.push(adapter.onError(report));
      statusChanged(adapter.getStatus() === "connected" ? "connected" : "connecting");
      await adapter.connect();
      if (!active) {
        // Cleanup may have run while connect was pending; close that late connection too.
        await disconnect();
        return;
      }
      if (adapter.getStatus() !== "connected") throw new Error("The adapter did not establish a connected state.");
      statusChanged("connected");
      if (options.readInitialHistory !== false) {
        const rounds = await readValidatedCompletedRounds(adapter);
        if (!active) return;
        if (!receive(rounds)) throw new Error("Completed-round history failed application validation.");
        handlers.onInitialSync?.({ completedRoundCount: rounds.length, checkedAt: new Date().toISOString() });
      }
    } catch (error) {
      if (active) statusChanged("error");
      report(error);
      stop();
    }
  }

  function stop() {
    if (!active) return;
    active = false;
    for (const release of unsubscribe) {
      try { release(); } catch { /* Continue releasing the remaining subscriptions. */ }
    }
    seen.clear();
    if (adapterSubscriptions.get(adapter) === stop) adapterSubscriptions.delete(adapter);
    void disconnect();
  }

  adapterSubscriptions.set(adapter, stop);
  void start();
  return stop;
}
