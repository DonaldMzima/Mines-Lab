import { getPenaltySeriesAnalysis, PENALTY_TURBO_SCORE_PROBABILITY } from "../penalty";
import { choice, number, percent, unavailable } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzePenalty: GameAnalyzer = (input) => {
  const mode = choice(input.mode, "Mode", ["turbo", "series"]);
  const step = number(input.step, "Step", 1, mode === "turbo" ? 1 : 5, true);
  const series = getPenaltySeriesAnalysis()[step - 1];
  const probability = mode === "turbo" ? PENALTY_TURBO_SCORE_PROBABILITY : series.scoreProbability;
  return { ...unavailable(`Scoring chance: ${percent(probability)}`, {
    scoringProbability: probability,
    cumulativeProbability: mode === "turbo" ? probability : series.cumulativeScoreProbability,
    publishedRtp: 0.94,
    ...(mode === "series" ? { displayedMultiplier: series.displayedMultiplier, probabilityMultiplierDiagnostic: series.impliedGrossReturn } : {}),
    step, gridVerified: false, directionModelEvaluated: false,
    missingEvidence: ["Goal grid and row/column mapping", "Terminal state and catches semantics", "Complete payout and cash-out rules", "Prospectively evaluated direction model"],
  }, "User-supplied in-game Penalty rules and observed Series multipliers"), gameMode: mode,
    explanation: "No verified direction signal available. Published chances are rounded. Multiplier products are diagnostics, not a verified provider expected return." };
};
