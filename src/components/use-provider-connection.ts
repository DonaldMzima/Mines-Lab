"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readValidatedCompletedRounds, subscribeToGameData } from "@/lib/game-data-adapter";
import type { ConnectionStatus, GameDataAdapter, InitialRoundSync } from "@/lib/game-data-adapter";
import type { GameRound } from "@/lib/mines";
import type { MinesRoundEvent } from "@/lib/round-tracker";
import { DEFAULT_MINES_PROVIDER_CONFIG, getProviderConnectionBlockers, parseMinesProviderConfig } from "@/lib/provider-config";
import type { MinesProviderConfig } from "@/lib/provider-config";

export interface ProviderConnectionStatus {
  state: ConnectionStatus;
  available: boolean;
  adapterImplemented: boolean;
  dataVerified: boolean;
  unavailableReasons: string[];
  lastReceivedAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  lastConnectedAt: string | null;
  stale: boolean;
}

export interface ConnectionTestResult {
  status: "success" | "error" | "unavailable" | "cancelled";
  checkedAt: string;
  message: string;
  source: string;
  transportConnected: boolean;
  historyReadVerified: boolean;
  completedRoundCount: number;
  documentedLiveRounds: boolean;
  documentedCompletedRounds: boolean;
  observedEvents: { start: boolean; update: boolean; completed: boolean };
}

export interface ConnectionTestState {
  status: "idle" | "testing" | ConnectionTestResult["status"];
  result: ConnectionTestResult | null;
}

interface InitialSyncWaiter {
  generation: number;
  settled: boolean;
  promise: Promise<InitialRoundSync>;
  resolve: (value: InitialRoundSync) => void;
  reject: (error: Error) => void;
}

function initialSyncWaiter(generation: number): InitialSyncWaiter {
  let resolvePromise!: (value: InitialRoundSync) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<InitialRoundSync>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  // Connecting without a test is valid; a failed initial check still has an error listener.
  void promise.catch(() => {});
  const waiter: InitialSyncWaiter = {
    generation, settled: false, promise,
    resolve: (value) => { if (!waiter.settled) { waiter.settled = true; resolvePromise(value); } },
    reject: (error) => { if (!waiter.settled) { waiter.settled = true; rejectPromise(error); } },
  };
  return waiter;
}

interface ConnectionOptions {
  adapter?: GameDataAdapter;
  config: MinesProviderConfig;
  autoConnect: boolean;
  staleAfterSeconds: number;
  onRounds: (rounds: GameRound[]) => void;
  onRoundEvent: (event: MinesRoundEvent) => void;
}

export function useProviderConnection({ adapter, config, autoConnect, staleAfterSeconds, onRounds, onRoundEvent }: ConnectionOptions) {
  const setup = useMemo(() => {
    try { return { config: parseMinesProviderConfig(config), error: null }; }
    catch (error) { return { config: DEFAULT_MINES_PROVIDER_CONFIG, error: error instanceof Error ? error.message : "Invalid provider configuration." }; }
  }, [config]);
  const unavailableReasons = useMemo(() => {
    const reasons = getProviderConnectionBlockers(setup.config);
    if (setup.error) reasons.unshift(setup.error);
    if (!adapter) reasons.push("A provider-approved read-only adapter has not been implemented.");
    return reasons;
  }, [adapter, setup]);
  const available = unavailableReasons.length === 0;
  const configIdentity = JSON.stringify(setup.config);
  const supportsLiveRounds = setup.config.supportsLiveRounds === true;
  const supportsCompletedRounds = setup.config.supportsCompletedRounds === true;
  const [state, setState] = useState<ConnectionStatus>("disconnected");
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [dataVerified, setDataVerified] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({ status: "idle", result: null });
  const [connectionStartedAt, setConnectionStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const stateRef = useRef<ConnectionStatus>("disconnected");
  const attemptPending = useRef(false);
  const release = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const initialSync = useRef<InitialSyncWaiter | null>(null);
  const liveData = useRef<InitialSyncWaiter | null>(null);
  const verifiedGeneration = useRef<number | null>(null);
  const readInFlight = useRef<{ generation: number; promise: Promise<GameRound[]> } | null>(null);
  const observedEvents = useRef({ start: false, update: false, completed: false });
  const pendingTest = useRef<{ kind: "history" | "live"; promise: Promise<ConnectionTestResult>; cancel: (message: string, updateState?: boolean) => void } | null>(null);
  const callbacks = useRef({ onRounds, onRoundEvent });
  useEffect(() => { callbacks.current = { onRounds, onRoundEvent }; }, [onRounds, onRoundEvent]);

  const disconnect = useCallback(() => {
    pendingTest.current?.cancel("Connection check cancelled because the source was disconnected.");
    generation.current += 1;
    initialSync.current?.reject(new Error("The source was disconnected before the read-only check completed."));
    initialSync.current = null;
    liveData.current?.reject(new Error("The source was disconnected before supported round data arrived."));
    liveData.current = null;
    verifiedGeneration.current = null;
    setDataVerified(false);
    readInFlight.current = null;
    release.current?.();
    release.current = null;
    attemptPending.current = false;
    stateRef.current = "disconnected";
    setState("disconnected");
    setConnectionStartedAt(null);
  }, []);

  const received = useCallback((eventAt: string | null) => {
    const timestamp = Date.now();
    setLastReceivedAt(new Date(timestamp).toISOString());
    setNow(timestamp);
    if (eventAt) setLastEventAt((previous) => !previous || Date.parse(eventAt) > Date.parse(previous) ? eventAt : previous);
  }, []);

  const verifyData = useCallback((epoch: number) => {
    if (generation.current !== epoch) return;
    verifiedGeneration.current = epoch;
    setDataVerified(true);
    if (stateRef.current === "connected") liveData.current?.resolve({ completedRoundCount: 0, checkedAt: new Date().toISOString() });
  }, []);

  const connect = useCallback(() => {
    if (!available || !adapter) {
      setLastError("Connection unavailable: official provider access and an approved adapter are required.");
      return;
    }
    if (attemptPending.current || ["connecting", "connected", "reconnecting"].includes(stateRef.current)) return;
    pendingTest.current?.cancel("Connection check cancelled because a new connection attempt started.");
    generation.current += 1;
    const epoch = generation.current;
    initialSync.current?.reject(new Error("The previous connection was replaced."));
    initialSync.current = supportsCompletedRounds ? initialSyncWaiter(epoch) : null;
    liveData.current?.reject(new Error("The previous connection was replaced."));
    liveData.current = supportsLiveRounds ? initialSyncWaiter(epoch) : null;
    verifiedGeneration.current = null;
    setDataVerified(false);
    readInFlight.current = null;
    observedEvents.current = { start: false, update: false, completed: false };
    release.current?.();
    setLastError(null);
    setLastReceivedAt(null);
    setLastEventAt(null);
    const started = Date.now();
    setConnectionStartedAt(started);
    setNow(started);
    stateRef.current = "connecting";
    attemptPending.current = true;
    setState("connecting");
    release.current = subscribeToGameData(adapter, {
      onStatus: (next) => {
        if (generation.current !== epoch) return;
        if (next !== "connected") {
          verifiedGeneration.current = null;
          setDataVerified(false);
          if (supportsLiveRounds && liveData.current?.settled) liveData.current = initialSyncWaiter(epoch);
        }
        if (next === "connected" && stateRef.current !== "connected") setLastConnectedAt(new Date().toISOString());
        if (next === "error" || (next === "disconnected" && !attemptPending.current)) {
          initialSync.current?.reject(new Error("The data source did not remain connected for the read-only check."));
          liveData.current?.reject(new Error("The data source did not remain connected while waiting for round data."));
        }
        if (next === "connected" || next === "error") attemptPending.current = false;
        if (attemptPending.current && next === "disconnected") return;
        stateRef.current = next;
        setState(next);
        if (next === "connected" && verifiedGeneration.current === epoch) liveData.current?.resolve({ completedRoundCount: 0, checkedAt: new Date().toISOString() });
      },
      onError: (message) => {
        if (generation.current !== epoch) return;
        setLastError(message);
        initialSync.current?.reject(new Error(message));
        liveData.current?.reject(new Error(message));
      },
      onRounds: (rounds) => {
        if (generation.current !== epoch) return;
        if (!supportsCompletedRounds) { setLastError("This source has no documented completed-round capability; its results were ignored."); return; }
        callbacks.current.onRounds(rounds);
        if (rounds.length) verifyData(epoch);
        received(rounds.reduce<string | null>((latest, round) => !latest || Date.parse(round.timestamp) > Date.parse(latest) ? round.timestamp : latest, null));
      },
      onRoundEvent: (event) => {
        if (generation.current !== epoch) return;
        if (event.type === "round-completed" ? !supportsCompletedRounds : !supportsLiveRounds) {
          setLastError("The source sent an event outside its documented capabilities; it was ignored.");
          return;
        }
        callbacks.current.onRoundEvent(event);
        const kind = event.type === "round-start" ? "start" : event.type === "round-update" ? "update" : "completed";
        observedEvents.current[kind] = true;
        verifyData(epoch);
        received(event.occurredAt);
      },
      onInitialSync: (result) => {
        if (generation.current !== epoch) return;
        received(null);
        verifyData(epoch);
        initialSync.current?.resolve(result);
      },
    }, { readInitialHistory: supportsCompletedRounds });
  }, [adapter, available, supportsLiveRounds, supportsCompletedRounds, received, verifyData]);

  const sourceLabel = setup.config.availability === "documented"
    ? `1win Mines · ${setup.config.supportedMode} · ${setup.config.transport}`
    : "1win Mines · not configured";

  const runConnectionCheck = useCallback((kind: "history" | "live"): Promise<ConnectionTestResult> => {
    const checkLive = kind === "live";
    const makeResult = (status: ConnectionTestResult["status"], message: string, completedRoundCount = 0, historyReadVerified = false): ConnectionTestResult => {
      let transportConnected = false;
      try { transportConnected = available && adapter?.getStatus() === "connected"; } catch { /* No transport proof is available. */ }
      return {
        status, checkedAt: new Date().toISOString(), message, source: sourceLabel,
        transportConnected: status === "cancelled" ? false : transportConnected,
        historyReadVerified, completedRoundCount,
        documentedLiveRounds: supportsLiveRounds, documentedCompletedRounds: supportsCompletedRounds,
        observedEvents: available ? { ...observedEvents.current } : { start: false, update: false, completed: false },
      };
    };
    if (pendingTest.current) return pendingTest.current.kind === kind
      ? pendingTest.current.promise
      : Promise.resolve(makeResult("unavailable", "Another supported connection check is already running. Wait for it to finish or disconnect before starting a different check."));
    if (!available || !adapter || (checkLive ? !supportsLiveRounds : !supportsCompletedRounds)) {
      const result = makeResult("unavailable", !available || !adapter
        ? `Game connection unavailable. ${unavailableReasons.join(" ")}`
        : checkLive ? "This source has no documented supported round-event feed. A transport connection alone cannot verify game data."
          : "This source has no documented read-only completed-round history check. Opening its transport does not verify game-data synchronization.");
      setConnectionTest({ status: result.status, result });
      return Promise.resolve(result);
    }
    if (!checkLive && stateRef.current === "reconnecting") {
      const result = makeResult("error", "The source is reconnecting. Wait for a connected status before checking read-only history.");
      setConnectionTest({ status: result.status, result });
      return Promise.resolve(result);
    }
    const openedForTest = !["connected", "connecting", "reconnecting"].includes(stateRef.current) && !attemptPending.current;
    if (openedForTest) connect();
    const epoch = generation.current;
    const initial = checkLive ? liveData.current : initialSync.current;
    let resolveResult!: (result: ConnectionTestResult) => void;
    let rejectCancellation!: (error: Error) => void;
    const promise = new Promise<ConnectionTestResult>((resolve) => { resolveResult = resolve; });
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    let timer: number | undefined;
    const finish = (result: ConnectionTestResult, updateState = true) => {
      if (pendingTest.current?.promise !== promise) return;
      if (timer !== undefined) window.clearTimeout(timer);
      pendingTest.current = null;
      if (updateState) {
        setConnectionTest({ status: result.status, result });
        if (result.status === "error") setLastError(result.message);
      }
      resolveResult(result);
    };
    pendingTest.current = {
      kind,
      promise,
      cancel: (message, updateState = true) => {
        finish(makeResult("cancelled", message), updateState);
        rejectCancellation(new Error(message));
      },
    };
    setConnectionTest({ status: "testing", result: null });
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(checkLive
        ? "No supported round data arrived within 15 seconds. An open transport alone does not verify the game connection. Continue a demo round and retry, or review source access."
        : "The read-only connection check timed out after 15 seconds. This check did not verify history access.")), 15_000);
    });
    const work = async (): Promise<number> => {
      let count: number;
      if (checkLive) {
        if (verifiedGeneration.current !== epoch || stateRef.current !== "connected") {
          if (!initial || initial.generation !== epoch) throw new Error("No supported round-event subscription is ready. Reconnect the source.");
          await initial.promise;
        }
        if (verifiedGeneration.current !== epoch) throw new Error("No validated round data is available for this connection.");
        count = 0;
      } else if (initial && initial.generation === epoch && (openedForTest || !initial.settled || stateRef.current !== "connected")) {
        count = (await initial.promise).completedRoundCount;
      } else {
        if (adapter.getStatus() !== "connected") throw new Error("Connect the source before checking its read-only history.");
        let read = readInFlight.current;
        if (!read || read.generation !== epoch) {
          read = { generation: epoch, promise: readValidatedCompletedRounds(adapter) };
          readInFlight.current = read;
          const request = read;
          void read.promise.then(
            () => { if (readInFlight.current === request) readInFlight.current = null; },
            () => { if (readInFlight.current === request) readInFlight.current = null; },
          );
        }
        const rounds = await read.promise;
        if (generation.current !== epoch || pendingTest.current?.promise !== promise) throw new Error("Connection check was cancelled.");
        if (adapter.getStatus() !== "connected") throw new Error("The source disconnected before its history could be verified.");
        if (rounds.length) {
          callbacks.current.onRounds(rounds);
        }
        received(rounds.reduce<string | null>((latest, round) => !latest || Date.parse(round.timestamp) > Date.parse(latest) ? round.timestamp : latest, null));
        count = rounds.length;
      }
      if (generation.current !== epoch || pendingTest.current?.promise !== promise) throw new Error("Connection check was cancelled.");
      if (stateRef.current !== "connected" || adapter.getStatus() !== "connected") throw new Error("The source is no longer connected. Data access was not verified.");
      verifyData(epoch);
      return count;
    };
    void (async () => {
      try {
        const count = await Promise.race([work(), timeout, cancellation]);
        if (generation.current !== epoch || pendingTest.current?.promise !== promise) return;
        finish(makeResult("success", checkLive
          ? "The game source is connected and supported round data was received and validated. Only information actually supplied by the source can be displayed."
          : count === 0
          ? "The source connected and its read-only history returned a valid empty list. This check alone does not verify completed-round synchronization or live lifecycle events."
          : `Read-only history returned ${count} validated completed round${count === 1 ? "" : "s"}. This history check alone does not verify live event delivery; observed lifecycle events are listed separately.`, count, !checkLive));
      } catch (error) {
        if (pendingTest.current?.promise !== promise) return;
        if (generation.current !== epoch) { finish(makeResult("cancelled", "Connection check cancelled because the data source changed.")); return; }
        const message = error instanceof Error ? error.message : "The read-only connection check failed.";
        finish(makeResult("error", message));
        if (openedForTest || verifiedGeneration.current !== epoch) {
          generation.current += 1;
          initialSync.current?.reject(new Error(message));
          initialSync.current = null;
          liveData.current?.reject(new Error(message));
          liveData.current = null;
          verifiedGeneration.current = null;
          setDataVerified(false);
          readInFlight.current = null;
          release.current?.();
          release.current = null;
          attemptPending.current = false;
          stateRef.current = "error";
          setState("error");
          setConnectionStartedAt(null);
        }
      }
    })();
    return promise;
  }, [adapter, available, connect, received, sourceLabel, supportsLiveRounds, supportsCompletedRounds, unavailableReasons, verifyData]);

  const testConnection = useCallback(() => runConnectionCheck("history"), [runConnectionCheck]);
  const connectGame = useCallback(() => runConnectionCheck(supportsCompletedRounds ? "history" : "live"), [runConnectionCheck, supportsCompletedRounds]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset connection state when its external source changes.
    disconnect();
    setLastConnectedAt(null);
    setConnectionTest({ status: "idle", result: null });
    return () => {
      pendingTest.current?.cancel("Connection check cancelled because the source changed or the workspace closed.", false);
      generation.current += 1;
      initialSync.current?.reject(new Error("The data source changed or the workspace closed."));
      initialSync.current = null;
      liveData.current?.reject(new Error("The data source changed or the workspace closed."));
      liveData.current = null;
      verifiedGeneration.current = null;
      readInFlight.current = null;
      release.current?.(); release.current = null; attemptPending.current = false; stateRef.current = "disconnected";
    };
  }, [adapter, available, configIdentity, disconnect]);

  useEffect(() => {
    // A preference change never starts a retry loop; documented adapters own their recovery policy.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This starts an explicitly enabled external adapter.
    if (available && autoConnect) connect();
  }, [available, autoConnect, connect, configIdentity]);

  useEffect(() => {
    if (state !== "connected" && state !== "reconnecting") return;
    // This timer checks local freshness only; it sends no network requests.
    const timer = window.setInterval(() => setNow(Date.now()), Math.min(10_000, staleAfterSeconds * 1000));
    const checkFreshness = () => setNow(Date.now());
    document.addEventListener("visibilitychange", checkFreshness);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", checkFreshness); };
  }, [state, staleAfterSeconds]);

  const freshnessStart = lastReceivedAt
    ? Math.min(Date.parse(lastReceivedAt), lastEventAt ? Date.parse(lastEventAt) : Date.parse(lastReceivedAt))
    : connectionStartedAt;
  const stale = (state === "connected" || state === "reconnecting") && freshnessStart !== null && now - freshnessStart >= staleAfterSeconds * 1000;
  const connection: ProviderConnectionStatus = {
    state: available ? state : "disconnected", available, adapterImplemented: Boolean(adapter), dataVerified, unavailableReasons,
    lastReceivedAt, lastEventAt, lastError: setup.error ?? lastError, lastConnectedAt, stale: available && stale,
  };
  return { connection, connect, disconnect, connectGame, testConnection, connectionTest, providerConfig: setup.config };
}
