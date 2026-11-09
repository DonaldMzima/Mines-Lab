"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseGameRoundImport, roundsEquivalent } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { evaluateSignal } from "@/lib/signals/evaluator";
import { evaluateImportedRound, mergeCompletedRounds, reconcileRoundEvaluations } from "@/lib/round-processing";
import type { SignalEvaluation, SignalResult } from "@/lib/signals/types";
import {
  DEFAULT_PREFERENCES, loadWorkspaceStorage, MAX_HISTORY, MAX_SIGNALS,
  recoverStorageCategory, saveHistory, savePreferences, saveSignalEvaluations, saveSignals,
} from "@/lib/storage";
import type { AppPreferences, StorageCategory } from "@/lib/storage";
import { createRoundTrackerState, trackRoundEvent } from "@/lib/round-tracker";
import type { CompletedRoundEvent, MinesRoundEvent, RoundTrackerState, RoundTrackingSource } from "@/lib/round-tracker";
import { DEFAULT_MINES_PROVIDER_CONFIG } from "@/lib/provider-config";
import type { MinesProviderConfig } from "@/lib/provider-config";
import type { GameDataAdapter } from "@/lib/game-data-adapter";
import { useProviderConnection } from "@/components/use-provider-connection";
import type { ConnectionTestResult, ConnectionTestState, ProviderConnectionStatus } from "@/components/use-provider-connection";
import { useDemoMines } from "@/components/use-demo-mines";
import type { DemoConnectionState } from "@/components/use-demo-mines";

interface Workspace {
  preferences: AppPreferences;
  history: GameRound[];
  signals: SignalResult[];
  evaluations: SignalEvaluation[];
}

interface CategoryStatus { writable: boolean; warnings: string[]; error: string }
type StorageStatus = Record<StorageCategory, CategoryStatus>;

export interface RoundImportResult {
  added: number;
  duplicates: number;
  rejected: number;
  notStored: number;
  evaluated: number;
  issues: string[];
}

interface AppContextValue extends Workspace {
  ready: boolean;
  notice: string;
  storageStatus: StorageStatus;
  lastImport: (RoundImportResult & { receivedAt: string }) | null;
  tracking: RoundTrackerState;
  connection: ProviderConnectionStatus;
  providerConfig: MinesProviderConfig;
  connectProvider: () => void;
  disconnectProvider: () => void;
  testProviderConnection: () => Promise<ConnectionTestResult>;
  connectGame: () => Promise<ConnectionTestResult>;
  connectionTest: ConnectionTestState;
  demoConnection: DemoConnectionState;
  connectDemo: () => void;
  disconnectDemo: () => void;
  startDemo: (mineCount: number) => void;
  pauseDemo: () => void;
  resetDemo: () => void;
  dismissNotice: () => void;
  updatePreferences: (preferences: AppPreferences) => void;
  addRounds: (rounds: unknown) => RoundImportResult;
  clearHistory: () => void;
  addSignal: (signal: SignalResult) => void;
  evaluate: (evaluation: SignalEvaluation) => void;
  linkRound: (signalId: string, roundId: string) => void;
  clearSignals: () => void;
  recoverStorage: (category: StorageCategory) => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const initialWorkspace: Workspace = { preferences: DEFAULT_PREFERENCES, history: [], signals: [], evaluations: [] };
const initialStorageStatus: StorageStatus = {
  history: { writable: false, warnings: [], error: "" },
  signals: { writable: false, warnings: [], error: "" },
  evaluations: { writable: false, warnings: [], error: "" },
  preferences: { writable: false, warnings: [], error: "" },
};

// An approved adapter must be instantiated by a Client Component, never passed from a Server Component.
export function AppProvider({ children, adapter, config = DEFAULT_MINES_PROVIDER_CONFIG }: { children: ReactNode; adapter?: GameDataAdapter; config?: MinesProviderConfig }) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const current = useRef(workspace);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageStatus, setStorageStatus] = useState(initialStorageStatus);
  const [lastImport, setLastImport] = useState<AppContextValue["lastImport"]>(null);
  const [tracking, setTracking] = useState(createRoundTrackerState);
  const tracker = useRef(tracking);
  const commitTracking = useCallback((next: RoundTrackerState) => { tracker.current = next; setTracking(next); }, []);

  // Update the ref at the event boundary so consecutive deliveries cannot use stale ids.
  const commit = useCallback((next: Workspace) => {
    current.current = next;
    setWorkspace(next);
  }, []);

  useEffect(() => {
    const loaded = loadWorkspaceStorage();
    let recoveredTracker = createRoundTrackerState();
    for (const round of loaded.history.data) {
      recoveredTracker = trackRoundEvent(recoveredTracker, { type: "round-completed", round }, round.source === "provider" || round.source === "demo" ? round.source : "import").state;
    }
    // Restore browser-local round state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This synchronizes persisted external state.
    commitTracking(recoveredTracker);
    const reconciled = loaded.signals.writable && loaded.evaluations.writable
      ? reconcileRoundEvaluations(loaded.history.data, loaded.signals.data, loaded.evaluations.data)
      : { evaluations: loaded.evaluations.data, evaluated: 0, issues: ["Automatic evaluations are paused until signal and evaluation storage has been recovered."] };
    commit({
      history: loaded.history.data, signals: loaded.signals.data,
      evaluations: reconciled.evaluations, preferences: loaded.preferences.data,
    });
    const statuses = { ...initialStorageStatus };
    for (const category of Object.keys(statuses) as StorageCategory[]) {
      statuses[category] = { writable: loaded[category].writable, warnings: loaded[category].warnings, error: "" };
    }
    setStorageStatus(statuses);
    const warnings = Object.values(loaded).flatMap((item) => item.warnings);
    if (warnings.length || reconciled.issues.length) {
      setNotice([...warnings, ...reconciled.issues, "Storage recovery is available in Settings."].join(" "));
    }
    setReady(true);
  }, [commit, commitTracking]);

  const persist = useCallback((category: StorageCategory, save: () => void) => {
    try {
      save();
      setStorageStatus((status) => status[category].error ? { ...status, [category]: { ...status[category], error: "" } } : status);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not save ${category}.`;
      setStorageStatus((status) => ({ ...status, [category]: { ...status[category], error: message } }));
      return false;
    }
  }, []);

  const { history, signals, evaluations, preferences } = workspace;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Storage failures update the recovery status.
    if (ready && storageStatus.history.writable) persist("history", () => saveHistory(history));
  }, [history, ready, storageStatus.history.writable, persist]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Storage failures update the recovery status.
    if (ready && storageStatus.signals.writable) persist("signals", () => saveSignals(signals));
  }, [signals, ready, storageStatus.signals.writable, persist]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Storage failures update the recovery status.
    if (ready && storageStatus.evaluations.writable) persist("evaluations", () => saveSignalEvaluations(evaluations));
  }, [evaluations, ready, storageStatus.evaluations.writable, persist]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Storage failures update the recovery status.
    if (ready && storageStatus.preferences.writable) persist("preferences", () => savePreferences(preferences));
  }, [preferences, ready, storageStatus.preferences.writable, persist]);

  const updatePreferences = useCallback((value: AppPreferences) => {
    commit({ ...current.current, preferences: value });
  }, [commit]);

  const processCompletedRounds = useCallback((incoming: unknown, source: RoundTrackingSource, terminalEvent?: CompletedRoundEvent): RoundImportResult => {
    const parsed = parseGameRoundImport(incoming);
    const previous = current.current;
    const processingIssues: string[] = [];
    const accepted: GameRound[] = [];
    let nextTracking = tracker.current;
    for (const round of parsed.rounds) {
      const prior = previous.evaluations.find((item) => item.roundId === round.id);
      const original = prior ? previous.signals.find((item) => item.id === prior.signalId) : undefined;
      if ((prior && [...prior.actualMinePositions].sort((a, b) => a - b).join(",") !== [...round.minePositions].sort((a, b) => a - b).join(",")) ||
        (original && (original.gameId !== round.gameId || original.mineCount !== round.bombCount || Date.parse(original.createdAt) >= Date.parse(round.timestamp)))) {
        processingIssues.push(`Round "${round.id}" conflicts with its original evaluation and was rejected. The original evaluation is unchanged.`);
        continue;
      }
      const savedRound = previous.history.find((item) => item.id === round.id);
      if (savedRound && roundsEquivalent(savedRound, round)) { accepted.push(savedRound); continue; }
      const result = trackRoundEvent(nextTracking, terminalEvent ?? { type: "round-completed", round }, source);
      if (result.ignored && !result.duplicate) {
        processingIssues.push(result.issues.join(" ") || `Round "${round.id}" has stale or inconsistent lifecycle data and was rejected.`);
        continue;
      }
      const normalized = result.completedRound ?? nextTracking.completedRounds.get(round.id) ?? round;
      if (savedRound && !roundsEquivalent(savedRound, normalized)) {
        processingIssues.push(`Round "${round.id}" conflicts with a saved completed result; the original was preserved.`);
        continue;
      }
      accepted.push(normalized);
      nextTracking = result.state;
    }
    const merged = mergeCompletedRounds(previous.history, accepted, MAX_HISTORY);
    const storedIds = new Set(merged.history.map((round) => round.id));
    const evaluationRounds = [...merged.history, ...accepted.filter((round) => !storedIds.has(round.id))];
    const canEvaluate = storageStatus.signals.writable && !storageStatus.signals.error && storageStatus.evaluations.writable;
    const linked = canEvaluate
      ? reconcileRoundEvaluations(evaluationRounds, previous.signals, previous.evaluations)
      : { evaluations: previous.evaluations, evaluated: 0, issues: ["Rounds were processed; automatic evaluations are paused until signal and evaluation storage is recovered in Settings."] };
    const result: RoundImportResult = {
      added: merged.added, duplicates: merged.duplicates + parsed.duplicates,
      rejected: parsed.rejected + merged.conflicts.length + processingIssues.length, notStored: merged.notStored,
      evaluated: linked.evaluated, issues: [...parsed.errors, ...merged.conflicts, ...processingIssues, ...linked.issues],
    };
    commitTracking(nextTracking);
    commit({ ...previous, history: merged.history, evaluations: linked.evaluations });
    if (source === "import") setLastImport({ ...result, receivedAt: new Date().toISOString() });
    else if (result.issues.length || result.notStored) setNotice([...result.issues.slice(0, 5), ...(result.notStored ? [`${result.notStored} completed rounds could not be saved: history is full. Export records in Settings.`] : [])].join(" "));
    return result;
  }, [commit, commitTracking, storageStatus.signals.writable, storageStatus.signals.error, storageStatus.evaluations.writable]);

  const addRounds = useCallback((incoming: unknown) => processCompletedRounds(incoming, "import"), [processCompletedRounds]);
  const receiveProviderRounds = useCallback((rounds: GameRound[]) => {
    const result = processCompletedRounds(rounds, "provider");
    if (result.rejected) throw new Error(result.issues.slice(0, 5).join(" ") || "Provider round data was rejected.");
  }, [processCompletedRounds]);
  const receiveProviderEvent = useCallback((event: MinesRoundEvent) => {
    if (event.type === "round-completed") {
      const result = processCompletedRounds(event.round, "provider", event);
      if (result.rejected) throw new Error(result.issues.slice(0, 5).join(" ") || "Provider completion was rejected.");
      return;
    }
    const result = trackRoundEvent(tracker.current, event, "provider");
    if (result.issues.length) { setNotice(result.issues.join(" ")); throw new Error(result.issues.join(" ")); }
    if (!result.ignored) commitTracking(result.state);
  }, [commitTracking, processCompletedRounds]);
  const receiveDemoEvent = useCallback((event: MinesRoundEvent) => {
    if (event.type === "round-completed") {
      const result = processCompletedRounds(event.round, "demo", event);
      if (result.rejected) throw new Error(result.issues.slice(0, 5).join(" ") || "Demo round data was rejected.");
      return;
    }
    const result = trackRoundEvent(tracker.current, event, "demo");
    if (result.issues.length) throw new Error(result.issues.join(" "));
    if (!result.ignored) commitTracking(result.state);
  }, [commitTracking, processCompletedRounds]);
  const { demoConnection, connectDemo, disconnectDemo, startDemo, pauseDemo, resetDemo: resetDemoConnection } = useDemoMines(receiveDemoEvent);
  const resetDemo = useCallback(() => {
    resetDemoConnection();
    commitTracking(createRoundTrackerState());
  }, [commitTracking, resetDemoConnection]);
  const { connection, connect: connectProvider, disconnect: disconnectProvider, providerConfig, testConnection: testProviderConnection, connectionTest, connectGame } = useProviderConnection({
    adapter: ready ? adapter : undefined, config,
    autoConnect: preferences.connection.autoConnect, staleAfterSeconds: preferences.connection.staleAfterSeconds,
    onRounds: receiveProviderRounds, onRoundEvent: receiveProviderEvent,
  });

  const clearHistory = useCallback(() => {
    commit({ ...current.current, history: [] });
  }, [commit]);

  const addSignal = useCallback((signal: SignalResult) => {
    const previous = current.current;
    if (previous.signals.some((item) => item.id === signal.id)) throw new Error("This signal is already recorded.");
    if (signal.roundId && (
      previous.history.some((round) => round.id === signal.roundId) ||
      tracker.current.terminalIds.has(signal.roundId) ||
      previous.signals.some((item) => item.roundId === signal.roundId) ||
      previous.evaluations.some((item) => item.roundId === signal.roundId)
    )) throw new Error("This round identifier is already recorded. Use a new round identifier before its outcome is known.");
    // Retention is explicit: do not silently delete unevaluated or historical recommendations.
    if (previous.signals.length >= MAX_SIGNALS) throw new Error(`The ${MAX_SIGNALS}-signal limit is reached. Export your records in Settings before clearing signal history.`);
    commit({ ...previous, signals: [signal, ...previous.signals] });
  }, [commit]);

  const evaluate = useCallback((evaluation: SignalEvaluation) => {
    if (!storageStatus.signals.writable || storageStatus.signals.error || !storageStatus.evaluations.writable) {
      throw new Error("Recover signal and evaluation storage in Settings before recording evaluations. Existing history is preserved.");
    }
    const previous = current.current;
    const signal = previous.signals.find((item) => item.id === evaluation.signalId);
    if (!signal) throw new Error("This signal is no longer available.");
    if (previous.evaluations.some((item) => item.signalId === signal.id)) throw new Error("This signal has already been evaluated; its original result is preserved.");
    if (signal.roundId && previous.evaluations.some((item) => item.roundId === signal.roundId)) {
      throw new Error("This round has already been evaluated.");
    }
    const knownRound = previous.history.find((round) => round.id === signal.roundId);
    const validated = knownRound
      ? evaluateImportedRound(signal, knownRound, "confirmed")
      : { ...evaluateSignal(signal, evaluation.actualMinePositions), ...(signal.roundId ? { roundId: signal.roundId, association: "confirmed" as const } : {}) };
    if (knownRound && [...evaluation.actualMinePositions].sort((a, b) => a - b).join(",") !== [...knownRound.minePositions].sort((a, b) => a - b).join(",")) {
      throw new Error("These mine positions differ from the imported round. Use the imported result or check the source data.");
    }
    commit({ ...previous, evaluations: [validated, ...previous.evaluations] });
  }, [commit, storageStatus.signals.writable, storageStatus.signals.error, storageStatus.evaluations.writable]);

  const linkRound = useCallback((signalId: string, roundId: string) => {
    if (!storageStatus.signals.writable || storageStatus.signals.error || !storageStatus.evaluations.writable) {
      throw new Error("Recover signal and evaluation storage in Settings before linking results. Existing history is preserved.");
    }
    const previous = current.current;
    const signal = previous.signals.find((item) => item.id === signalId);
    const round = previous.history.find((item) => item.id === roundId);
    if (!signal || !round) throw new Error("Choose an existing signal and imported round.");
    if (previous.signals.some((item) => item.id !== signalId && item.roundId === roundId)) {
      throw new Error("This round identifier is already assigned to another original signal.");
    }
    if (previous.evaluations.some((item) => item.signalId === signalId || item.roundId === roundId)) {
      throw new Error("This signal or round has already been evaluated. Existing evaluations cannot be replaced.");
    }
    const evaluation = evaluateImportedRound(signal, round, "confirmed");
    commit({ ...previous, evaluations: [evaluation, ...previous.evaluations] });
  }, [commit, storageStatus.signals.writable, storageStatus.signals.error, storageStatus.evaluations.writable]);

  const clearSignals = useCallback(() => {
    commit({ ...current.current, signals: [], evaluations: [] });
  }, [commit]);

  const recoverStorage = useCallback((category: StorageCategory) => {
    const backupKey = recoverStorageCategory(category);
    setStorageStatus((status) => ({ ...status, [category]: { writable: true, warnings: [], error: "" } }));
    const snapshot = current.current;
    const save = {
      history: () => saveHistory(snapshot.history), signals: () => saveSignals(snapshot.signals),
      evaluations: () => saveSignalEvaluations(snapshot.evaluations), preferences: () => savePreferences(snapshot.preferences),
    };
    const saved = persist(category, save[category]);
    const signalReady = category === "signals" ? saved : storageStatus.signals.writable && !storageStatus.signals.error;
    const evaluationReady = category === "evaluations" ? saved : storageStatus.evaluations.writable && !storageStatus.evaluations.error;
    let evaluationMessage = "";
    if ((category === "signals" || category === "evaluations") && signalReady && evaluationReady) {
      const retainedIds = new Set(snapshot.history.map((round) => round.id));
      const knownRounds = [...snapshot.history, ...[...tracker.current.completedRounds.values()].filter((round) => !retainedIds.has(round.id))];
      const reconciled = reconcileRoundEvaluations(knownRounds, snapshot.signals, snapshot.evaluations);
      if (reconciled.evaluated) commit({ ...snapshot, evaluations: reconciled.evaluations });
      evaluationMessage = ` ${reconciled.evaluated} pending exact-ID evaluations completed. ${reconciled.issues.join(" ")}`;
    }
    setNotice((backupKey ? `Original ${category} data backed up as ${backupKey}. Recovery attempted; check the storage status in Settings.` : `Saving ${category} retried. Check the storage status in Settings.`) + evaluationMessage);
  }, [persist, commit, storageStatus.signals.writable, storageStatus.signals.error, storageStatus.evaluations.writable, storageStatus.evaluations.error]);

  const value = useMemo<AppContextValue>(() => ({
    ...workspace, ready, notice, storageStatus, lastImport, tracking, connection, providerConfig, connectProvider, disconnectProvider, testProviderConnection, connectionTest, connectGame, demoConnection, connectDemo, disconnectDemo, startDemo, pauseDemo, resetDemo, dismissNotice: () => setNotice(""),
    updatePreferences, addRounds, clearHistory, addSignal, evaluate, linkRound, clearSignals, recoverStorage,
  }), [workspace, ready, notice, storageStatus, lastImport, tracking, connection, providerConfig, connectProvider, disconnectProvider, testProviderConnection, connectionTest, connectGame, demoConnection, connectDemo, disconnectDemo, startDemo, pauseDemo, resetDemo, updatePreferences, addRounds, clearHistory, addSignal, evaluate, linkRound, clearSignals, recoverStorage]);

  // Keep route children in the prerendered tree so instant navigation can validate them.
  // Browser storage hydrates the initial workspace without blocking page rendering.
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used within AppProvider.");
  return context;
}
