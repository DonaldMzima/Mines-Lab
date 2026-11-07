"use client";

import { useState } from "react";
import { useAppState } from "@/components/app-provider";
import { useSignalGeneration } from "@/components/use-signal-generation";
import { tileIndexToNumber, TOTAL_TILES } from "@/lib/mines";

export function InlineSignals() {
  const { preferences, updatePreferences, signals, evaluations } = useAppState();
  const { generate, activeRoundId } = useSignalGeneration();
  const [error, setError] = useState("");
  const signal = signals[0];
  const evaluation = evaluations.find((item) => item.signalId === signal?.id);
  const existingForRound = Boolean(activeRoundId && signals.some((item) => item.roundId === activeRoundId));

  function generateSuggestion() {
    try { generate(); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The suggestion could not be generated."); }
  }

  return <section className="bot-signals" aria-labelledby="inline-signals-title">
    <h2 id="inline-signals-title">Tile suggestions</h2>
    <p>No verified safe-tile signal is available for this round.</p>
    <label htmlFor="inline-pick-count">Number of suggested tiles</label>
    <select id="inline-pick-count" className="settings-select" value={preferences.suggestedTileCount} onChange={(event) => updatePreferences({ ...preferences, suggestedTileCount: Number(event.target.value) })}>
      {Array.from({ length: TOTAL_TILES - preferences.mineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
    </select>
    <button type="button" className="secondary-button" disabled={existingForRound} onClick={generateSuggestion}>{existingForRound ? "Suggestion saved for this round" : signal ? "Generate another suggestion" : "Generate experimental suggestion"}</button>
    <p className="bot-muted">Random selections for comparison only. They have no demonstrated predictive advantage.</p>
    {error && <p className="bot-error" role="alert">{error}</p>}
    {signal && <div className="bot-signal-result">
      <strong>Latest suggestion · {signal.mineCount} mines</strong>
      <p className="bot-tile-list">{signal.suggestedTiles.map(tileIndexToNumber).map((number) => String(number).padStart(2, "0")).join(" · ")}</p>
      <p>{signal.roundId ? <>Recorded for round <span className="bot-id">{signal.roundId}</span>.</> : "No round linked. It will stay unevaluated unless you confirm a matching result in Advanced."}</p>
      {evaluation ? <p><strong>Completed-round comparison:</strong> {evaluation.correctSelections} clear selections · {evaluation.incorrectSelections} mine hits. {evaluation.survivedAllSelections ? "All suggestions survived that recorded round." : "The suggestion set contained a mine."} This does not predict the next round.</p> : <p>Evaluation: waiting for a matching completed result.</p>}
    </div>}
  </section>;
}
