"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  calculateSurvivalProbability,
  formatProbabilityAsPercent,
  SUPPORTED_BOMB_COUNTS,
  tileIndexToNumber,
  tileNumberToIndex,
  TOTAL_TILES,
} from "@/lib/mines";
import { useAppState } from "@/components/app-provider";
import { GameWorkspace } from "@/components/game-workspace";
import { DataStatus } from "@/components/data-status";
import { RoundLinkForm } from "@/components/round-link-form";
import { evaluateSignal } from "@/lib/signals/evaluator";
import { useSignalGeneration } from "@/components/use-signal-generation";
import { calculateSignalStatistics } from "@/lib/signals/statistics";

export default function SignalsPage() {
  const {
    preferences,
    updatePreferences,
    signals,
    evaluations,
    evaluate,
    connection,
  } = useAppState();
  const [actualMineNumbers, setActualMineNumbers] = useState("");
  const [manualSelections, setManualSelections] = useState<number[]>([]);
  const [formError, setFormError] = useState("");
  const [roundId, setRoundId] = useState("");
  const { generate, activeRoundId } = useSignalGeneration();
  const currentSignal = signals[0];
  const currentEvaluation = evaluations.find(
    (item) => item.signalId === currentSignal?.id,
  );
  const statistics = useMemo(
    () => calculateSignalStatistics(signals, evaluations),
    [signals, evaluations],
  );
  const expectedCurrentRate = currentSignal
    ? calculateSurvivalProbability(
        TOTAL_TILES,
        currentSignal.mineCount,
        currentSignal.suggestedTiles.length,
      )
    : null;

  function generateNextSignal() {
    try {
      generate(roundId);
      setActualMineNumbers("");
      setManualSelections([]);
      setFormError("");
      setRoundId("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not generate a signal.");
    }
  }

  function submitEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSignal) return;
    try {
      const entries = actualMineNumbers
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((value) => {
          const number = Number(value);
          if (!Number.isInteger(number)) throw new Error("Enter mine tile numbers from 1 to 25, separated by commas.");
          return tileNumberToIndex(number);
        });
      evaluate(evaluateSignal(currentSignal, entries));
      setFormError("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not evaluate this signal.");
    }
  }

  function toggleManualSelection(index: number) {
    setManualSelections((current) => current.includes(index)
      ? current.filter((tile) => tile !== index)
      : [...current, index]);
  }

  if (preferences.activeGameId !== "mines") return <GameWorkspace key={preferences.activeGameId} gameId={preferences.activeGameId} />;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> EXPERIMENTAL RESEARCH</div>
          <h1>Mines <span>Signals</span></h1>
          <p>Generate a random tile suggestion, then evaluate it against the completed round. No predictive advantage has been demonstrated.</p>
        </div>
        <DataStatus />
      </div>

      <div className="signal-disclaimer" role="note">
        <span className="disclaimer-mark">!</span>
        <p><strong>Experimental tile suggestion.</strong> This system has not demonstrated an advantage over random selection. Under a uniform randomness model, no tile is mathematically safer than another.</p>
      </div>

      <div className="signal-layout">
        <div className="left-column">
          <section className="panel signal-board-panel">
            <div className="panel-heading">
              <div><div className="panel-kicker">1WIN MINES · 5 × 5</div><h2>Recommendation board</h2></div>
              <span className="experimental-tag">EXPERIMENTAL</span>
            </div>
            <div className="signal-legend">
              <span><i className="legend-swatch suggested" /> Suggested</span>
              <span><i className="legend-swatch manual" /> Your selection</span>
              {currentEvaluation && <><span><i className="legend-swatch prior" /> Previously suggested</span><span><i className="legend-swatch safe" /> Round safe (entered)</span><span><i className="legend-swatch mine" /> Round mine (entered)</span></>}
              {!currentEvaluation && <span><i className="legend-swatch unknown" /> Unknown</span>}
            </div>
            <div className="board-frame signal-board-frame">
              <div className="mines-board" role="group" aria-label="Signal recommendation board">
                {Array.from({ length: TOTAL_TILES }, (_, index) => {
                  const suggested = currentSignal?.suggestedTiles.includes(index) ?? false;
                  const mine = currentEvaluation?.actualMinePositions.includes(index) ?? false;
                  const roundIsEvaluated = Boolean(currentEvaluation);
                  const roundSafe = roundIsEvaluated && !mine;
                  const manuallySelected = manualSelections.includes(index);
                  const stateClass = [
                    mine ? "tile-confirmed-mine" : roundSafe ? `tile-confirmed-safe${suggested ? " tile-prior-suggestion" : ""}` : suggested ? "tile-suggested" : "",
                    manuallySelected ? "tile-user-marked" : "",
                  ].filter(Boolean).join(" ");
                  const description = mine ? "mine according to entered round result" : roundSafe ? `safe according to entered round result${suggested ? ", previously suggested" : ""}` : `${suggested ? "experimental suggestion" : "unknown"}${manuallySelected ? ", also manually selected" : ""}`;
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`tile ${stateClass}`}
                      aria-pressed={manuallySelected}
                      aria-label={`Tile ${tileIndexToNumber(index)}, ${description}`}
                      onClick={() => toggleManualSelection(index)}
                    >
                      {mine ? "×" : roundSafe ? <span className="round-safe-mark">✓{suggested && <i>✳</i>}</span> : suggested ? <span className="suggested-number">{tileIndexToNumber(index).toString().padStart(2, "0")}<i>✳</i></span> : manuallySelected ? "•" : tileIndexToNumber(index).toString().padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="board-explanation">Click any tile to mark your own selection; this does not change or influence the generated signal. Suggested tiles are not verified-safe.</p>
            <button className="text-button" onClick={() => { setManualSelections([]); setActualMineNumbers(""); setFormError(""); }}>↻ Reset marks and input</button>
          </section>

          <section className="panel recommendation-panel">
            <div className="panel-heading compact"><div><div className="panel-kicker">LATEST SIGNAL</div><h2>{currentSignal ? "Recommendation details" : "No signal generated yet"}</h2></div><span className="source-label">RANDOM BASELINE</span></div>
            {currentSignal ? (
              <>
                <div className="recommendation-summary">
                  <div><span>MINE COUNT</span><strong>{currentSignal.mineCount}</strong></div>
                  <div><span>SUGGESTED TILES</span><strong>{currentSignal.suggestedTiles.map(tileIndexToNumber).map((number) => number.toString().padStart(2, "0")).join(", ")}</strong></div>
                  <div><span>METHOD</span><strong>{currentSignal.method}</strong></div>
                  <div><span>VERIFIED SAFE</span><strong>None</strong></div>
                  <div><span>ROUND IDENTIFIER</span><strong>{currentSignal.roundId ?? "Not recorded at generation"}</strong></div>
                </div>
                <p className="signal-timestamp">Generated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(currentSignal.createdAt))} · Confidence not available</p>
              </>
            ) : <p className="empty-copy">Choose your configuration and generate a tile suggestion. No historical results are used to pick tiles.</p>}
            <div className="evaluation-form">
              <label htmlFor="signal-round-id">Next round identifier <span>Optional · known before its result</span></label>
              <input id="signal-round-id" maxLength={200} autoComplete="off" value={roundId} placeholder="Exact round ID from an authorized source" onChange={(event) => setRoundId(event.target.value)} />
              <p>The identifier is saved with the original suggestion. Importing that completed round evaluates it automatically. A message ID is not necessarily a round ID.</p>
              {activeRoundId && !roundId.trim() && <p>The next signal will use observed active round <strong>{activeRoundId}</strong>. Its eventual completed result will be evaluated automatically.</p>}
              {formError && <p className="form-error" role="alert">{formError}</p>}
            </div>
            <button className="primary-button signal-generate" onClick={generateNextSignal}>{currentSignal ? "Generate another signal" : "Generate signal"} <span aria-hidden="true">→</span></button>
          </section>

          {currentSignal && (
            <section className="panel evaluation-panel">
              <div className="panel-heading compact"><div><div className="panel-kicker">AFTER THE ROUND</div><h2>Record actual mine positions</h2></div></div>
              {currentEvaluation ? (
                <div className={`evaluation-result ${currentEvaluation.survivedAllSelections ? "evaluation-success" : "evaluation-failure"}`}>
                  <strong>{currentEvaluation.survivedAllSelections ? "All suggested tiles were safe" : "One or more suggested tiles contained a mine"}</strong>
                  <span>{currentEvaluation.correctSelections} safe recommendation{currentEvaluation.correctSelections === 1 ? "" : "s"} · {currentEvaluation.incorrectSelections} mine hit{currentEvaluation.incorrectSelections === 1 ? "" : "s"}</span>
                  <small>Actual mines: {currentEvaluation.actualMinePositions.map(tileIndexToNumber).sort((a, b) => a - b).join(", ")}</small>
                  <small>{currentEvaluation.roundId ? `Round ${currentEvaluation.roundId} · ${currentEvaluation.association === "precommitted" ? "ID recorded before import" : "later confirmed association"}` : "Manual result · no round identity verified"}</small>
                  <p>A successful result describes this completed round only; it does not predict future outcomes.</p>
                </div>
              ) : (
                <>
                <RoundLinkForm signal={currentSignal} />
                <form className="evaluation-form" onSubmit={submitEvaluation}>
                  <label htmlFor="actual-mines">Revealed mine tile numbers <span>1–25, separated by commas</span></label>
                  <input id="actual-mines" inputMode="numeric" autoComplete="off" placeholder={`Enter ${currentSignal.mineCount} positions, e.g. 2, 14, 23`} value={actualMineNumbers} onChange={(event) => { setActualMineNumbers(event.target.value); setFormError(""); }} />
                  <p>Enter the actual result after completing the round. The number of positions must match the configured mine count ({currentSignal.mineCount}).</p>
                  {formError && <p className="form-error" role="alert">{formError}</p>}
                  <button className="secondary-button" type="submit">Evaluate completed round</button>
                </form>
                </>
              )}
            </section>
          )}
        </div>

        <div className="right-column">
          <section className="panel controls-panel">
            <div className="panel-heading compact"><div><div className="panel-kicker">SIGNAL SETTINGS</div><h2>Configuration</h2></div></div>
            <span className="field-label" id="signal-mine-count">Number of mines</span>
            <div className="bomb-options" role="group" aria-labelledby="signal-mine-count">
              {SUPPORTED_BOMB_COUNTS.map((count) => <button key={count} className={`bomb-option ${preferences.mineCount === count ? "chosen" : ""}`} aria-pressed={preferences.mineCount === count} onClick={() => updatePreferences({ ...preferences, mineCount: count, suggestedTileCount: Math.min(preferences.suggestedTileCount, TOTAL_TILES - count) })}><span className="bomb-glyph">✳</span>{count}<small>MINES</small></button>)}
            </div>
            <label className="field-label signal-count-label" htmlFor="suggested-count">Suggested tile count</label>
            <select id="suggested-count" className="settings-select" value={preferences.suggestedTileCount} onChange={(event) => updatePreferences({ ...preferences, suggestedTileCount: Number(event.target.value) })}>
              {Array.from({ length: TOTAL_TILES - preferences.mineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} tile{count === 1 ? "" : "s"}</option>)}
            </select>
            <div className="control-divider" />
            <div className="metric-row"><span>Latest signal expected success</span><strong>{expectedCurrentRate === null ? "—" : formatProbabilityAsPercent(expectedCurrentRate)}</strong></div>
            <p className="small-disclaimer">Combinatorial probability under uniform, independent board placement. No future safety is implied.</p>
          </section>

          <section className="panel signal-statistics">
            <div className="panel-heading compact"><div><div className="panel-kicker">PERFORMANCE</div><h2>Signal evaluation</h2></div></div>
            <div className="round-stats stats-two">
              <div><span>GENERATED</span><strong>{statistics.totalGenerated}</strong></div>
              <div><span>EVALUATED</span><strong>{statistics.totalEvaluated}</strong></div>
              <div><span>COMPLETE SUCCESS</span><strong className="stat-green">{statistics.successful}</strong></div>
              <div><span>FAILED</span><strong className="stat-red">{statistics.failed}</strong></div>
            </div>
            <div className="metric-row"><span>Observed complete success</span><strong>{statistics.observedSuccessRate === null ? "—" : formatProbabilityAsPercent(statistics.observedSuccessRate)}</strong></div>
            <div className="metric-row"><span>Expected random baseline</span><strong>{statistics.expectedSuccessRate === null ? "—" : formatProbabilityAsPercent(statistics.expectedSuccessRate)}</strong></div>
            <div className="metric-row"><span>Unevaluated signals</span><strong>{statistics.unevaluated}</strong></div>
            <div className="metric-row"><span>Round ID recorded before import</span><strong>{statistics.precommittedEvaluated}</strong></div>
            <p className="small-disclaimer">Rates use evaluated signals only. Precommitted IDs are local records, not provider verification or proof of unseen outcomes. Later confirmed and manual results are retrospective; no predictive advantage is established.</p>
            {statistics.groups.some((group) => group.evaluated > 0) && (
              <div className="group-stats">
                <span className="formula-label">OBSERVED / RANDOM · BY CONFIGURATION</span>
                {statistics.groups.filter((group) => group.evaluated > 0).map((group) => <div className="group-stat-row" key={`${group.mineCount}-${group.suggestedTileCount}`}><span>{group.mineCount} mines · {group.suggestedTileCount} picks <small>({group.evaluated} evaluated)</small>{group.successInterval && <small>95% interval: {formatProbabilityAsPercent(group.successInterval[0])}–{formatProbabilityAsPercent(group.successInterval[1])}</small>}</span><strong>{formatProbabilityAsPercent(group.observedSuccessRate ?? 0)} / {formatProbabilityAsPercent(group.expectedSuccessRate)}</strong></div>)}
                <p className="small-disclaimer">Descriptive Wilson intervals assume independent rounds. Small samples, selective reporting, repeated boards, and unverified imports limit interpretation.</p>
              </div>
            )}
          </section>

          <section className="panel integrity-card">
            <div className="integrity-icon" aria-hidden="true">◇</div>
            <div><strong>Connection status: {connection.state}</strong><p>{connection.available ? "Only exact round identity and validated completed results permit automatic evaluation." : "No authorized live provider is configured. Completed mine positions come from imported or manually entered results."} A server seed hash does not reveal future mine locations.</p><span className="pending-tag">{connection.available ? "READ-ONLY SOURCE" : "NO LIVE DATA"}</span></div>
          </section>
        </div>
      </div>
    </>
  );
}
