"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAppState } from "@/components/app-provider";
import { DataStatus } from "@/components/data-status";
import { RoundLinkForm } from "@/components/round-link-form";
import { FairnessDetails } from "@/components/fairness-details";
import { formatRoundCashout } from "@/lib/round-display";
import { tileIndexToNumber, tileNumberToIndex } from "@/lib/mines";
import { evaluateSignal } from "@/lib/signals/evaluator";
import type { SignalResult } from "@/lib/signals/types";

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export default function HistoryPage() {
  const { history, signals, evaluations, addRounds, clearHistory, clearSignals, evaluate, lastImport } = useAppState();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const [mineInputs, setMineInputs] = useState<Record<string, string>>({});
  const [signalErrors, setSignalErrors] = useState<Record<string, string>>({});

  function submitSignalEvaluation(event: FormEvent<HTMLFormElement>, signal: SignalResult) {
    event.preventDefault();
    try {
      const positions = (mineInputs[signal.id] ?? "")
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((value) => {
          const number = Number(value);
          if (!Number.isInteger(number)) {
            throw new Error("Enter mine tile numbers from 1 to 25, separated by commas.");
          }
          return tileNumberToIndex(number);
        });
      evaluate(evaluateSignal(signal, positions));
      setSignalErrors((current) => ({ ...current, [signal.id]: "" }));
    } catch (error) {
      setSignalErrors((current) => ({
        ...current,
        [signal.id]: error instanceof Error ? error.message : "Could not evaluate this signal.",
      }));
    }
  }

  async function importRounds(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Import a JSON file smaller than 2 MiB. Split larger exports into batches.");
      const data: unknown = JSON.parse(await file.text());
      const result = addRounds(data);
      setImportIssues(result.issues);
      setMessage(`${result.added} completed rounds added; ${result.duplicates} duplicates skipped; ${result.rejected} records rejected; ${result.evaluated} signals automatically evaluated.${result.notStored ? ` ${result.notStored} records were not stored because the 500-round history limit was reached. Export records in Settings before clearing history.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The selected file could not be imported.");
      setImportIssues([]);
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  function confirmClearRounds() {
    if (history.length === 0) return;
    if (!window.confirm(`Permanently clear ${history.length} imported round${history.length === 1 ? "" : "s"} from this browser?`)) return;
    clearHistory();
    setMessage("Imported round history cleared.");
  }

  function confirmClearSignals() {
    if (signals.length === 0) return;
    if (!window.confirm(`Permanently clear ${signals.length} signal${signals.length === 1 ? "" : "s"} and their evaluations from this browser?`)) return;
    clearSignals();
    setMessage("Signal history and evaluations cleared.");
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> LOCAL RECORDS</div><h1>Round <span>history.</span></h1><p>Completed-round records and original signal evaluations saved in this browser.</p></div>
        <label className={`import-button history-import ${busy ? "is-busy" : ""}`}><span aria-hidden="true">↑</span>{busy ? "Importing…" : "Import round JSON"}<input type="file" accept=".json,application/json" disabled={busy} onChange={importRounds} /></label>
      </div>
      <DataStatus />
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></div>}
      {importIssues.length > 0 && <details className="notice import-details"><summary>{importIssues.length} import or association issue{importIssues.length === 1 ? "" : "s"}</summary><ul>{importIssues.slice(0, 20).map((issue, index) => <li key={index}>{issue}</li>)}</ul>{importIssues.length > 20 && <p>{importIssues.length - 20} more issues. Correct the source file and import again.</p>}</details>}

      <div className="history-summary-grid">
        <section className="panel history-summary-card"><span>COMPLETED ROUNDS</span><strong>{history.length}</strong><p>Local records · source identified per round</p><button className="text-button danger-text" disabled={history.length === 0} onClick={confirmClearRounds}>Clear round history</button></section>
        <section className="panel history-summary-card"><span>GENERATED SIGNALS</span><strong>{signals.length}</strong><p>{evaluations.length} evaluated · unevaluated signals are not successes</p><button className="text-button danger-text" disabled={signals.length === 0} onClick={confirmClearSignals}>Clear signal history</button></section>
      </div>

      <section className="panel history-page history-section">
        <div className="panel-heading"><div><div className="panel-kicker">COMPLETED GAMES</div><h2>Completed round results <span className="count-chip">{history.length}</span></h2></div></div>
        {history.length === 0 ? <div className="empty-history"><div className="empty-icon">◷</div><h3>No rounds recorded</h3><p>Import a JSON file containing completed-round mine positions. Every record is validated before it is saved.</p></div> : (
          <div className="history-table-wrap"><table className="history-table"><thead><tr><th>ROUND</th><th>DATE</th><th>MINES</th><th>MINE POSITIONS</th><th>RESULT</th><th>CASH OUT</th></tr></thead><tbody>
            {history.map((round) => <tr key={round.id}><td><strong className="round-id">{round.id}</strong><small className="table-subtext">{round.source === "provider" ? "Provider adapter · local record" : "User-provided · unverified"} · {round.mode ?? "unknown mode"}</small><FairnessDetails round={round} /></td><td>{formatDate(round.timestamp)}</td><td>{round.bombCount}</td><td>{round.minePositions.map(tileIndexToNumber).sort((a, b) => a - b).join(", ")}</td><td><span className={`result-badge result-${round.result}`}>{round.result.replace("_", " ")}</span></td><td>{formatRoundCashout(round)}</td></tr>)}
          </tbody></table></div>
        )}
        <p className="history-note">Imported results are user assertions. Locally stored source labels are not independent proof of authenticity. Amounts use only the reported mode and currency; imported financial values are not independently verified.</p>
        <details className="history-note"><summary>Importing an observed provider response</summary><p>A bare response with <code>ms_id</code> and <code>outcome.mines</code> is insufficient. Supply a round ID, completion timestamp, and explicit completion/result context in the documented envelope. Raw state codes are preserved without inferring their meaning. See the repository README for the JSON format. No account credentials or balance data are needed.</p></details>
        {lastImport && <p className="history-note">Last import processed {formatDate(lastImport.receivedAt)}. Storage warnings above identify any categories that could not be saved.</p>}
      </section>

      <section className="panel history-page history-section">
        <div className="panel-heading"><div><div className="panel-kicker">EXPERIMENTAL EVALUATION</div><h2>Signal history <span className="count-chip">{signals.length}</span></h2></div></div>
        {signals.length === 0 ? <div className="empty-history"><div className="empty-icon">✳</div><h3>No signals generated</h3><p>Create experimental recommendations in the Signals workspace. No sample results are fabricated.</p></div> : (
          <div className="history-table-wrap"><table className="history-table"><thead><tr><th>GENERATED</th><th>MINES / PICKS</th><th>SUGGESTED TILES</th><th>EVALUATION</th><th>RESULT</th></tr></thead><tbody>
            {signals.map((signal) => {
              const evaluation = evaluations.find((item) => item.signalId === signal.id);
              return <tr key={signal.id}><td><strong className="round-id">{formatDate(signal.createdAt)}</strong><small className="table-subtext">{signal.id}</small><small className="table-subtext">Original round ID: {signal.roundId ?? "none"}</small></td><td>{signal.mineCount} / {signal.suggestedTiles.length}</td><td>{signal.suggestedTiles.map(tileIndexToNumber).map((number) => number.toString().padStart(2, "0")).join(", ")}</td><td>{evaluation ? <>{evaluation.correctSelections} safe · {evaluation.incorrectSelections} mine<small className="table-subtext">{evaluation.roundId ? `${evaluation.roundId} · ${evaluation.association === "precommitted" ? "ID recorded before import" : "later confirmed"}` : "Manual · unlinked result"}</small></> : <><RoundLinkForm signal={signal} /><form className="history-eval-form" onSubmit={(event) => submitSignalEvaluation(event, signal)}><label className="visually-hidden" htmlFor={`evaluation-${signal.id}`}>Revealed mine numbers for signal {signal.id}</label><input id={`evaluation-${signal.id}`} inputMode="numeric" placeholder={`${signal.mineCount} mine numbers`} value={mineInputs[signal.id] ?? ""} onChange={(event) => setMineInputs((current) => ({ ...current, [signal.id]: event.target.value }))} /><button type="submit" className="text-button">Evaluate manually</button>{signalErrors[signal.id] && <small className="form-error" role="alert">{signalErrors[signal.id]}</small>}</form></>}</td><td>{evaluation ? <span className={`result-badge ${evaluation.survivedAllSelections ? "result-won" : "result-lost"}`}>{evaluation.survivedAllSelections ? "all survived" : "mine hit"}</span> : <span className="result-badge">pending</span>}</td></tr>;
            })}
          </tbody></table></div>
        )}
        <p className="history-note">A recommendation counts as completely successful only if none of its suggested tiles contained a mine.</p>
      </section>
    </>
  );
}
