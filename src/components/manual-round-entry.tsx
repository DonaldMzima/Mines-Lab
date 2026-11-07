"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useAppState } from "@/components/app-provider";
import type { RoundImportResult } from "@/components/app-provider";
import { GAME_ID, parseGameRound, SUPPORTED_BOMB_COUNTS, tileIndexToNumber, TOTAL_TILES } from "@/lib/mines";

function completionTimestamp(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  const date = new Date(value);
  if (
    !parts || Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(parts[1]) || date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) || date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5]) || date.getSeconds() !== Number(parts[6] ?? 0)
  ) {
    throw new Error("Enter the actual date and time when the round finished, using your browser’s local time.");
  }
  if (date.getTime() > Date.now()) throw new Error("A completed round cannot have a future completion time.");
  return date.toISOString();
}

export function ManualRoundEntry({ onSaved }: { onSaved?: () => void }) {
  const { preferences, addRounds, storageStatus } = useAppState();
  const id = useId();
  const [roundId, setRoundId] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [mineCount, setMineCount] = useState(preferences.mineCount);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [result, setResult] = useState("unknown");
  const [mode, setMode] = useState("unknown");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<RoundImportResult | null>(null);
  const savingUnavailable = !storageStatus.history.writable || Boolean(storageStatus.history.error);

  function changed() {
    setError("");
    setReport(null);
    setConfirmed(false);
  }

  function toggleMine(position: number) {
    changed();
    setMinePositions((current) => current.includes(position)
      ? current.filter((item) => item !== position)
      : current.length < mineCount ? [...current, position] : current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReport(null);
    let imported: RoundImportResult;
    try {
      if (!confirmed) throw new Error("Confirm that the round has finished and the marked tiles are its actual revealed mines.");
      const identifier = roundId.trim();
      if (!identifier || identifier.length > 200) throw new Error("Enter the exact round identifier shown by the game, up to 200 characters. Do not invent an identifier.");
      const round = parseGameRound({
        id: identifier,
        gameId: GAME_ID,
        timestamp: completionTimestamp(completedAt),
        completed: true,
        bombCount: mineCount,
        minePositions,
        selectedPositions: [],
        result,
        mode,
      });
      imported = addRounds(round);
      setReport(imported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This round could not be recorded.");
      return;
    }
    if (imported.added > 0) {
      setRoundId("");
      setCompletedAt("");
      setMinePositions([]);
      setConfirmed(false);
      onSaved?.();
    }
  }

  return (
    <section className="manual-round-entry" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Record a finished round</h3>
      <p className="manual-round-help">Use a round you have already completed. Mark its revealed mines below. These are user-provided results, not a verified game connection.</p>
      <form className="evaluation-form" onSubmit={submit}>
        <div className="manual-round-fields">
          <div className="manual-round-field">
            <label htmlFor={`${id}-round`}>Round identifier</label>
            <input id={`${id}-round`} required maxLength={200} autoComplete="off" value={roundId} aria-describedby={`${id}-round-help`} placeholder="Exact ID shown by the game" onChange={(event) => { changed(); setRoundId(event.target.value); }} />
            <p id={`${id}-round-help`}>Use the game’s genuine round ID. If you cannot find it, this form cannot reliably identify the round or link a signal.</p>
          </div>
          <div className="manual-round-field">
            <label htmlFor={`${id}-completed`}>When did the round finish?</label>
            <input id={`${id}-completed`} type="datetime-local" required step={1} value={completedAt} aria-describedby={`${id}-time-help`} onChange={(event) => { changed(); setCompletedAt(event.target.value); }} />
            <p id={`${id}-time-help`}>Enter its actual completion time in your browser’s local time. No time is filled in automatically.</p>
          </div>
          <div className="manual-round-field">
            <label htmlFor={`${id}-result`}>Round outcome</label>
            <select id={`${id}-result`} className="settings-select" value={result} onChange={(event) => { changed(); setResult(event.target.value); }}>
              <option value="unknown">Not known</option><option value="lost">Lost</option><option value="cashed_out">Cashed out</option><option value="won">Won</option>
            </select>
          </div>
          <div className="manual-round-field">
            <label htmlFor={`${id}-mode`}>Game mode</label>
            <select id={`${id}-mode`} className="settings-select" value={mode} onChange={(event) => { changed(); setMode(event.target.value); }}>
              <option value="unknown">Not known</option><option value="demo">Demo</option><option value="real">Real</option>
            </select>
          </div>
        </div>

        <div className="manual-round-field">
          <span className="field-label" id={`${id}-count`}>Number of mines in this completed round</span>
          <div className="bomb-options" role="group" aria-labelledby={`${id}-count`}>
            {SUPPORTED_BOMB_COUNTS.map((count) => <button type="button" key={count} className={`bomb-option ${mineCount === count ? "chosen" : ""}`} aria-pressed={mineCount === count} onClick={() => { changed(); setMineCount(count); setMinePositions([]); }}>{count}<small>MINES</small></button>)}
          </div>
        </div>

        <div className="manual-round-board">
          <span className="field-label" id={`${id}-mines`}>Mark the actual revealed mines</span>
          <div className="mines-board" role="group" aria-labelledby={`${id}-mines`} aria-describedby={`${id}-mines-help`}>
            {Array.from({ length: TOTAL_TILES }, (_, position) => {
              const marked = minePositions.includes(position);
              const number = tileIndexToNumber(position);
              return <button type="button" key={position} className={`tile ${marked ? "tile-confirmed-mine" : ""}`} aria-pressed={marked} disabled={!marked && minePositions.length >= mineCount} aria-label={`Tile ${number}, ${marked ? "marked as a revealed mine" : "not marked"}`} onClick={() => toggleMine(position)}>{String(number).padStart(2, "0")}</button>;
            })}
          </div>
          <p id={`${id}-mines-help`} role="status">{minePositions.length} of {mineCount} mines marked. Select exactly {mineCount}; click a marked tile again to correct it.</p>
          <button type="button" className="text-button" disabled={minePositions.length === 0} onClick={() => { changed(); setMinePositions([]); }}>Clear marked mines</button>
        </div>

        <label className="manual-round-confirmation"><input type="checkbox" required checked={confirmed} onChange={(event) => { setError(""); setReport(null); setConfirmed(event.target.checked); }} /><span>I confirm this round has finished and these are its actual revealed mine positions.</span></label>
        <div className="manual-round-actions"><button type="submit" className="primary-button">Add completed round</button></div>
      </form>

      {error && <p className="manual-round-message is-error" role="alert">{error}</p>}
      {report && <div className={`manual-round-message ${report.rejected || report.notStored ? "is-warning" : ""}`} role="status">
        <p>{report.added} completed round{report.added === 1 ? "" : "s"} added to this workspace; {report.duplicates} duplicate{report.duplicates === 1 ? "" : "s"} skipped; {report.rejected} rejected; {report.evaluated} matching signal{report.evaluated === 1 ? "" : "s"} evaluated.</p>
        {report.notStored > 0 && <p>{report.notStored} round{report.notStored === 1 ? " was" : "s were"} not stored because the history limit was reached. Export saved records in Settings before clearing history.</p>}
        {report.issues.length > 0 && <ul>{report.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      </div>}
      {savingUnavailable && <p className="manual-round-message is-warning" role="status">Browser saving for history is unavailable. Added results may remain in memory only. Review storage recovery in Settings before refreshing.</p>}
    </section>
  );
}
