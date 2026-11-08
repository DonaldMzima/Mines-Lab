"use client";

import { GameWorkspace } from "@/components/game-workspace";
import { formatPenaltyProbability, getPenaltySeriesAnalysis, PENALTY_RTP, PENALTY_TURBO_SCORE_PROBABILITY } from "@/lib/penalty";

export function PenaltyWorkspace() {
  return <>
    <GameWorkspace gameId="penalty" />
    <details className="simple-advanced"><summary>All supplied probability rules</summary><div>
      <p className="simple-help">Published RTP: {formatPenaltyProbability(PENALTY_RTP)}. Turbo scoring chance: {formatPenaltyProbability(PENALTY_TURBO_SCORE_PROBABILITY)}. Rounded values from the supplied in-game rules.</p>
      <div className="penalty-probability-table" role="table" aria-label="Series scoring probabilities">
        <div role="row" className="penalty-probability-header"><span role="columnheader">Step</span><span role="columnheader">Score</span><span role="columnheader">Save</span><span role="columnheader">Reach</span><span role="columnheader">Shown ×</span><span role="columnheader">Reach × shown</span></div>
        {getPenaltySeriesAnalysis().map(step => <div role="row" key={step.step}><span role="cell">{step.step}</span><span role="cell">{formatPenaltyProbability(step.scoreProbability)}</span><span role="cell">{formatPenaltyProbability(step.saveProbability)}</span><span role="cell">{formatPenaltyProbability(step.cumulativeScoreProbability)}</span><span role="cell">{step.displayedMultiplier.toFixed(2)}×</span><span role="cell">{formatPenaltyProbability(step.impliedGrossReturn)}</span></div>)}
      </div>
      <p className="simple-help">Reach is the product of conditional scoring probabilities. Reach × shown is a diagnostic only; the complete payout and cash-out rules have not been verified.</p>
    </div></details>
  </>;
}
