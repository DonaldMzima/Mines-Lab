"use client";

import { useState } from "react";
import {
  formatPenaltyProbability,
  getPenaltySeriesAnalysis,
  PENALTY_GAME_ID,
  PENALTY_RTP,
  PENALTY_SERIES_MULTIPLIERS,
  PENALTY_TURBO_SCORE_PROBABILITY,
} from "@/lib/penalty";
import type { PenaltyMode } from "@/lib/penalty";

export function PenaltyWorkspace() {
  const [mode, setMode] = useState<PenaltyMode>("turbo");
  const series = getPenaltySeriesAnalysis();
  return <>
    <section className="simple-section" aria-labelledby="penalty-analysis-heading">
      <h2 id="penalty-analysis-heading">Penalty analysis</h2>
      <p className="simple-help">Game ID: {PENALTY_GAME_ID} · Integration key: vgsonewin2_penalty · Verified RTP: {formatPenaltyProbability(PENALTY_RTP)}. These are theoretical scoring rates, not goalkeeper-direction predictions.</p>
      <div className="simple-actions" role="group" aria-label="Penalty mode">
        <button type="button" className={mode === "turbo" ? "primary-button" : "secondary-button"} aria-pressed={mode === "turbo"} onClick={() => setMode("turbo")}>Turbo</button>
        <button type="button" className={mode === "series" ? "primary-button" : "secondary-button"} aria-pressed={mode === "series"} onClick={() => setMode("series")}>Series</button>
      </div>
    </section>
    {mode === "turbo" ? <section className="simple-section" aria-label="Turbo probability">
      <h2>Turbo mode</h2>
      <p className="simple-result">Score probability: {formatPenaltyProbability(PENALTY_TURBO_SCORE_PROBABILITY)} · Save probability: {formatPenaltyProbability(1 - PENALTY_TURBO_SCORE_PROBABILITY)}</p>
      <p className="simple-help">One shot. No direction is recommended or predicted.</p>
    </section> : <section className="simple-section" aria-label="Series probabilities">
      <h2>Series mode</h2>
      <div className="penalty-probability-table" role="table" aria-label="Series scoring probabilities">
        <div role="row" className="penalty-probability-header"><span role="columnheader">Step</span><span role="columnheader">Score</span><span role="columnheader">Save</span><span role="columnheader">Reach</span><span role="columnheader">Shown ×</span><span role="columnheader">Reach × shown</span></div>
        {series.map((step) => <div role="row" key={step.step}><span role="cell">{step.step}</span><span role="cell">{formatPenaltyProbability(step.scoreProbability)}</span><span role="cell">{formatPenaltyProbability(step.saveProbability)}</span><span role="cell">{formatPenaltyProbability(step.cumulativeScoreProbability)}</span><span role="cell">{step.displayedMultiplier.toFixed(2)}×</span><span role="cell">{formatPenaltyProbability(step.impliedGrossReturn)}</span></div>)}
      </div>
      <p className="simple-help">“Reach” is the product of the documented conditional scoring probabilities. “Reach × shown” is a diagnostic product, not a verified expected return: the displayed multipliers ({PENALTY_SERIES_MULTIPLIERS.map((value) => `${value.toFixed(2)}×`).join(", ")}) do not by themselves establish the provider’s complete payout/cash-out rules.</p>
    </section>}
    <section className="simple-section" aria-label="Penalty data status">
      <h2>Data and payout status</h2>
      <p className="simple-result">No authorized live Penalty data feed or completed-round history is connected.</p>
      <p className="simple-help">Observed `state: 2` is treated only as in-progress. `outcome.catches`, terminal states, goal-coordinate layout, completed-result semantics, and cash-out rules remain unverified. No prediction model is implemented.</p>
    </section>
  </>;
}
