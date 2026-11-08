"use client";

import { useState } from "react";
import { useAppState } from "@/components/app-provider";
import { useSignalGeneration } from "@/components/use-signal-generation";
import { tileIndexToNumber, TOTAL_TILES } from "@/lib/mines";
import { toMinesGameSignal } from "@/lib/mines-game-signal";

export function InlineSignals() {
  const { preferences, updatePreferences, signals, evaluations } = useAppState();
  const { generate, activeRoundId } = useSignalGeneration();
  const [error, setError] = useState("");
  const signal = signals[0];
  const unifiedSignal = signal ? toMinesGameSignal(signal) : null;
  const evaluation = evaluations.find((item) => item.signalId === signal?.id);
  const existingForRound = Boolean(activeRoundId && signals.some((item) => item.roundId === activeRoundId));

  function generateSuggestion() {
    try { generate(); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The suggestion could not be generated."); }
  }

  return <section className="bot-signals" aria-labelledby="inline-signals-title">
    <h2 id="inline-signals-title">Mines signal</h2>
    <label htmlFor="inline-pick-count">Number of suggested tiles</label>
    <select id="inline-pick-count" className="settings-select" value={preferences.suggestedTileCount} onChange={(event) => updatePreferences({ ...preferences, suggestedTileCount: Number(event.target.value) })}>
      {Array.from({ length: TOTAL_TILES - preferences.mineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
    </select>
    <button type="button" className="primary-button" disabled={existingForRound} onClick={generateSuggestion}>{existingForRound ? "Signal saved for this round" : "Get Signal"}</button>
    <p className="bot-muted">Experimental · Random tile suggestions</p>
    {error && <p className="bot-error" role="alert">{error}</p>}
    {signal && <div className="bot-signal-result">
      <strong>Tiles · {signal.mineCount} mines</strong>
      <p className="bot-tile-list">{signal.suggestedTiles.map(tileIndexToNumber).map((number) => String(number).padStart(2, "0")).join(" · ")}</p>
      <details><summary>Details</summary><p>{unifiedSignal?.summary}</p><p>{unifiedSignal?.explanation}</p></details>
      <p>{signal.roundId ? <>Recorded for round <span className="bot-id">{signal.roundId}</span>.</> : "No round linked. It will stay unevaluated unless you confirm a matching result in Advanced."}</p>
      {evaluation ? <p><strong>Completed-round comparison:</strong> {evaluation.correctSelections} clear selections · {evaluation.incorrectSelections} mine hits. {evaluation.survivedAllSelections ? "All suggestions survived that recorded round." : "The suggestion set contained a mine."} This does not predict the next round.</p> : <p>Evaluation: waiting for a matching completed result.</p>}
    </div>}
  </section>;
}
