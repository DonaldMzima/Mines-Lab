"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { analyzeGame, GAME_FIELDS, getDefaultInput, type GameField, type GameSignal } from "@/lib/analysis";
import { evaluateGameRecord, parseCompletedGameResult, summarizeEvaluations, type CompletedGameResult, type GameEvaluation } from "@/lib/analysis-records";
import { exportGameAnalysis, readGameAnalysis, writeGameAnalysis, type SavedGameAnalysis } from "@/lib/analysis-client-storage";
import { getGameDefinition, type GameId } from "@/lib/game-registry";
import { getGameDataSourceStatus } from "@/lib/game-data-sources";

const pct = (p: number) => `${(p * 100).toFixed(2)}%`;
const advancedKeys = new Set(["profile", "afterSplit", "splitAces", "history", "headsGrossPayout", "tailsGrossPayout"]);

function resultText(result: CompletedGameResult): string {
  switch (result.gameId) {
    case "penalty": return `${result.data.mode} · Step ${result.data.step} · ${result.data.scored ? "Scored" : "Saved"}`;
    case "hilo": return `Next rank: ${result.data.rank}`;
    case "dice": return `Rolled: ${result.data.value}`;
    case "coinflip": return String(result.data.side).toUpperCase();
    case "blackjack": return String(result.data.outcome).toUpperCase();
    case "towers": return `${result.data.steps} rows · ${result.data.survived ? "Survived" : "Hit a hazard"}`;
    case "plinko": return `Bucket: ${result.data.slot}`;
    case "keno": return `Draw: ${(result.data.drawnNumbers as number[]).join(", ")}`;
    case "poker": return (result.data.cards as string[]).join(" · ");
    default: return `${result.data.multiplier}×`;
  }
}

function emptyResultData(gameId: GameId): Record<string, unknown> {
  switch (gameId) {
    case "penalty": return { mode: "series", step: 1, scored: true };
    case "hilo": return { rank: 8 };
    case "dice": return { value: 42 };
    case "coinflip": return { side: "heads" };
    case "blackjack": return { outcome: "win" };
    case "towers": return { survived: true, steps: 1 };
    case "plinko": return { slot: 4 };
    case "keno": return { drawnNumbers: [1, 2, 3] };
    case "poker": return { cards: ["As", "Kd", "Qh", "Jc", "Ts"] };
    default: return { multiplier: 1.5 };
  }
}

/** All controls analyze entered evidence; none sends a gameplay request. */
export function GameWorkspace({ gameId }: { gameId: GameId }) {
  const game = getGameDefinition(gameId);
  const defaults = getDefaultInput(gameId);
  const [state, setState] = useState<SavedGameAnalysis>({ config: defaults, records: [], results: [] });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [signal, setSignal] = useState<GameSignal | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(true);
  const [resultDraft, setResultDraft] = useState("");
  const snapshot = useRef<string | null>(null);
  const storageKey = `mines-lab.analysis.v4.${gameId}`;
  const source = getGameDataSourceStatus(gameId);

  useEffect(() => {
    try {
      const restored = readGameAnalysis(gameId, getDefaultInput(gameId));
      snapshot.current = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser storage after hydration.
      setState(restored); setSignal(restored.records[0]?.signal ?? null);
    } catch (cause) {
      setWritable(false); setError(cause instanceof Error ? cause.message : "Saved data could not be read.");
    }
    setReady(true);
  }, [gameId, storageKey]);

  function persist(next: SavedGameAnalysis) {
    if (!writable) throw new Error("Saved data is unavailable. Export it before recovery; it has not been overwritten.");
    if (window.localStorage.getItem(storageKey) !== snapshot.current) throw new Error("This game's records changed in another tab. Reload before saving.");
    writeGameAnalysis(gameId, next);
    snapshot.current = window.localStorage.getItem(storageKey);
    setState(next);
  }
  function update(key: string, value: unknown) {
    setState(s => ({ ...s, config: { ...s.config, [key]: value, ...(key === "rulesConfirmed" ? {} : { rulesConfirmed: false }) } }));
    setSignal(null); setError(""); setMessage("");
  }
  function readConfig() {
    const config = { ...state.config };
    for (const [key, value] of Object.entries(drafts)) {
      const original = defaults[key];
      if (Array.isArray(original) && ["cards", "rankCounts", "selections", "discardIndexes", "payouts"].includes(key)) {
        config[key] = value.trim() ? value.trim().split(/[,\s]+/).map(v => key === "cards" ? v.toUpperCase() : Number(v)) : [];
      } else config[key] = JSON.parse(value);
    }
    return config;
  }
  function getSignal(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const config = readConfig();
      const input: Record<string, unknown> = game.category === "crash" ? { ...config, history: [...(Array.isArray(config.history) ? config.history : []), ...state.results.map(r => ({ roundId: r.roundId, completedAt: r.completedAt, multiplier: r.data.multiplier, source: "manual" }))] } : { ...config };
      if (state.records.length >= 200) throw new Error("Signal history is full (200). Export your records before recovery.");
      const roundId = typeof input.roundId === "string" ? input.roundId.trim() : "";
      if (roundId && (state.results.some(r => r.roundId === roundId) || state.records.some(r => r.signal.roundId === roundId))) throw new Error("That round already has a result or recorded signal. Original records are preserved.");
      if (!roundId) { delete input.roundId; delete config.roundId; }
      else { input.roundId = roundId; config.roundId = roundId; }
      const nextSignal = analyzeGame(gameId, input);
      if (nextSignal.details.validationErrors) throw new Error(nextSignal.explanation ?? "Check the game settings.");
      const next = { ...state, config, records: [{ id: crypto.randomUUID(), signal: nextSignal, input, recordedAt: new Date().toISOString() }, ...state.records] };
      persist(next); setSignal(nextSignal); setDrafts({});
    } catch (cause) { setSignal(null); setError(cause instanceof Error ? cause.message : "Analysis could not be saved."); }
  }
  function importResults(values: unknown) {
    const rows = Array.isArray(values) ? values : [values];
    if (!rows.length || rows.length > 200) throw new Error("Import 1–200 completed records at a time.");
    const parsed = rows.map(parseCompletedGameResult);
    const known = new Map(state.results.map(r => [r.roundId, r]));
    let added = 0;
    for (const result of parsed) {
      if (result.gameId !== gameId) throw new Error(`Select ${getGameDefinition(result.gameId).name} before importing its results.`);
      const existing = known.get(result.roundId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(result)) throw new Error(`Round ${result.roundId} conflicts with the saved result. Nothing was overwritten.`);
      if (existing) continue;
      const record = state.records.find(r => r.signal.roundId === result.roundId);
      if (record) evaluateGameRecord(record, result);
      known.set(result.roundId, result); added++;
    }
    if (known.size > 200) throw new Error("Completed-result history is full (200). Export before importing more.");
    persist({ ...state, results: [...known.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)) });
    setResultDraft(""); setError(""); setMessage(`${added} user-provided result${added === 1 ? "" : "s"} saved.`);
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const priorSnapshot = snapshot.current;
    try {
      const file = element.files?.[0]; if (!file) return;
      if (file.size > 1_000_000) throw new Error("Use a JSON file smaller than 1 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      if (snapshot.current !== priorSnapshot) throw new Error("Records changed while reading the file. Import it again.");
      importResults(parsed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
    finally { element.value = ""; }
  }

  function fieldControl(field: GameField) {
    const value = state.config[field.key];
    const id = `${gameId}-${field.key}`;
    const helpId = `${id}-help`;
    if (gameId === "towers" && field.key === "rows") {
      const rows = Array.isArray(value) ? value as { tiles: number; hazards: number }[] : [];
      return <fieldset key={field.key} className="analysis-tower-rows"><legend>Row layouts</legend>{rows.map((row, index) => <div key={index}><span>Row {index + 1}</span><label>Tiles<input type="number" min={2} max={100} value={row.tiles} onChange={e => update("rows", rows.map((r, i) => i === index ? { ...r, tiles: Number(e.target.value) } : r))} /></label><label>Hazards<input type="number" min={0} max={row.tiles} value={row.hazards} onChange={e => update("rows", rows.map((r, i) => i === index ? { ...r, hazards: Number(e.target.value) } : r))} /></label><button type="button" className="text-button" aria-label={`Remove row ${index + 1}`} disabled={rows.length <= 1} onClick={() => update("rows", rows.filter((_, i) => i !== index))}>Remove</button></div>)}<button type="button" className="secondary-button" disabled={rows.length >= 32} onClick={() => update("rows", [...rows, { tiles: 3, hazards: 1 }])}>Add row</button><small>Configured independent rows. Hazard positions are unknown.</small></fieldset>;
    }
    if (field.type === "boolean") return <label key={field.key} className="analysis-check" htmlFor={id}><input id={id} type="checkbox" checked={value === true} onChange={e => update(field.key, e.target.checked)} /><span>{field.label}{field.help && <small>{field.help}</small>}</span></label>;
    let control;
    let help = field.help;
    if (field.type === "select") control = <select id={id} value={String(value ?? "")} onChange={e => { update(field.key, e.target.value); if (gameId === "penalty" && e.target.value === "turbo") update("step", 1); }} aria-describedby={field.help ? helpId : undefined}>{field.options?.map(v => <option key={v} value={v}>{v}</option>)}</select>;
    else if (field.type === "json") {
      const list = Array.isArray(defaults[field.key]) && ["cards", "rankCounts", "selections", "discardIndexes", "payouts"].includes(field.key);
      if (list && field.key === "cards") help = gameId === "poker" ? "Actual cards separated by commas: As, Kh, Qd, Jc, Ts." : "Actual ranks separated by commas: A, 6. Use A, 2–10, J, Q, K.";
      const text = drafts[field.key] ?? (list && Array.isArray(value) ? value.join(", ") : JSON.stringify(value, null, 2));
      const change = (text: string) => { setDrafts(d => ({ ...d, [field.key]: text })); update("rulesConfirmed", false); };
      control = list ? <input id={id} value={text ?? ""} placeholder="Separate values with commas" onChange={e => change(e.target.value)} aria-describedby={helpId} /> : <textarea id={id} rows={field.key === "history" ? 7 : 4} value={text ?? ""} maxLength={60_000} onChange={e => change(e.target.value)} aria-describedby={helpId} spellCheck={false} />;
    } else control = <input id={id} type={field.type === "number" ? "number" : "text"} step="any" value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={e => update(field.key, field.type === "number" ? e.target.value === "" ? null : Number(e.target.value) : e.target.value.toUpperCase())} aria-describedby={field.help ? helpId : undefined} />;
    return <label key={field.key} className="analysis-field" htmlFor={id}><span>{field.label}</span>{control}{help && <small id={helpId}>{help}</small>}</label>;
  }
  const isAdvanced = (f: GameField) => advancedKeys.has(f.key) || (gameId === "keno" && f.key === "payouts");
  const fields = GAME_FIELDS[gameId];
  const evaluations: GameEvaluation[] = [];
  for (const record of state.records) {
    const result = state.results.find(r => r.roundId === record.signal.roundId);
    if (!result) continue;
    try { const evaluated = evaluateGameRecord(record, result); if (evaluated) evaluations.push(evaluated); } catch { /* Invalid associations are excluded, never counted as wins. */ }
  }
  const configurationKey = (input: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "roundId").sort(([a], [b]) => a.localeCompare(b))));
  const newestConfiguration = state.records[0] ? configurationKey(state.records[0].input) : "";
  const comparable = evaluations.filter(e => { const record = state.records.find(r => r.id === e.recordId); return record && configurationKey(record.input) === newestConfiguration; });
  const stats = summarizeEvaluations(comparable);
  const latest = state.results[0];
  const example = { gameId, roundId: "YOUR_COMPLETED_ROUND_ID", completedAt: "YYYY-MM-DDTHH:mm:ssZ", source: "manual", data: emptyResultData(gameId) };

  return <div className="analysis-workspace">
    <section className="simple-section analysis-heading"><h2>{game.name}</h2><span className="simple-status">{source.status}</span></section>
    <form onSubmit={getSignal}>
      <div className="analysis-fields">{fields.filter(f => !isAdvanced(f) && f.key !== "rulesConfirmed").map(fieldControl)}</div>
      {fields.some(f => f.key === "rulesConfirmed") && <div className="analysis-confirm">{fieldControl(fields.find(f => f.key === "rulesConfirmed")!)}<small>Initial values are examples. Check the actual rules before confirming.</small></div>}
      <details className="simple-advanced analysis-settings"><summary>Advanced settings</summary><div className="analysis-fields">{fields.filter(isAdvanced).map(fieldControl)}<label className="analysis-field"><span>Round ID (optional)</span><input value={typeof state.config.roundId === "string" ? state.config.roundId : ""} maxLength={200} onChange={e => update("roundId", e.target.value)} /><small>Record a known ID before completion to compare a future result.</small></label></div></details>
      <button className="primary-button analysis-generate" type="submit" disabled={!ready || !writable}>Get Signal</button>
    </form>
    {error && <p className="simple-error" role="alert">{error}</p>}
    {message && <p className="simple-help" role="status">{message}</p>}
    <section className="analysis-output" aria-label={`${game.name} signal`} aria-live="polite">
      <span className="analysis-eyebrow">SIGNAL</span>
      <h3>{signal?.action ?? (signal ? "No verified action available" : "Ready for analysis")}</h3>
      {signal && <><p>{signal.summary}</p><small>{signal.status === "validated" ? "Validated calculation · configured rules" : signal.status === "experimental" ? "Experimental · configured model" : "Action unavailable"}</small></>}
    </section>
    <section className="simple-section"><h2>Latest completed result</h2><p className="simple-result">{latest ? resultText(latest) : "No completed result recorded."}</p>{latest && <p className="simple-help">{latest.roundId} · User-provided · {new Date(latest.completedAt).toLocaleString()}</p>}</section>
    <details className="simple-advanced"><summary>Details</summary><div className="analysis-details">
      <p>Live data: Not connected. Independently validated signal accuracy: Not evaluated.</p>
      {signal && <><p>{signal.explanation}</p><p>Source: {signal.source}</p><p>Generated: {new Date(signal.generatedAt).toLocaleString()}</p><details><summary>Calculation data</summary><pre>{JSON.stringify(signal.details, null, 2)}</pre></details></>}
      {gameId === "penalty" && <p>Goal grid, row/column mapping, and goalkeeper positions still require evidence. The observed catches field is not decoded. No guessed shooting layout is shown.</p>}
      <h3>Import completed results</h3><p>Enter real completed records in the canonical manual format. Examples below show the format only.</p>
      <details><summary>Record format</summary><pre>{JSON.stringify(example, null, 2)}</pre></details>
      <form onSubmit={e => { e.preventDefault(); try { importResults(JSON.parse(resultDraft)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid JSON."); } }}>
        <label className="analysis-field"><span>Completed-result JSON</span><textarea rows={6} value={resultDraft} maxLength={60_000} onChange={e => setResultDraft(e.target.value)} spellCheck={false} /></label>
        <div className="simple-actions"><button type="submit" className="secondary-button" disabled={!ready || !writable || !resultDraft.trim()}>Save result</button><label className="analysis-file-button">Import JSON file<input type="file" accept=".json,application/json" onChange={importFile} disabled={!ready || !writable} /></label></div>
      </form>
      <h3>History</h3><p>{state.records.length} saved analyses · {state.results.length} completed results · {evaluations.length} probability-event comparisons.</p>
      {stats && <p>Latest configuration, {stats.samples} manual comparisons: {stats.successes} event successes, {stats.failures} failures. Observed {pct(stats.observedRate)}; configured baseline {pct(stats.meanBaseline)}. 95% Wilson interval {pct(stats.wilson95[0])}–{pct(stats.wilson95[1])}; mean Brier score {stats.meanBrierScore.toFixed(4)}. This interval assumes comparable independent observations. Selective user uploads are not an independent accuracy test.</p>}
      <button type="button" className="secondary-button" disabled={!ready} onClick={() => { try { exportGameAnalysis(gameId); } catch { setError("Export could not be created."); } }}>Export this game’s records</button>
      {state.results.length > 0 && <ul className="analysis-history">{state.results.slice(0, 20).map(r => <li key={r.roundId}><strong>{resultText(r)}</strong><span>{r.roundId} · User-provided</span></li>)}</ul>}
      {state.records.length > 0 && <details><summary>Saved analyses</summary><ul className="analysis-history">{state.records.slice(0, 20).map(r => <li key={r.id}><strong>{r.signal.action ?? r.signal.summary}</strong><span>{r.signal.status} · {new Date(r.recordedAt).toLocaleString()} · {r.signal.roundId ?? "No round linked"}</span></li>)}</ul></details>}
      <p>Browser records and Telegram records are separate. Export preserves the original inputs and timestamps. No future-outcome model has independent performance evidence.</p>
    </div></details>
  </div>;
}
