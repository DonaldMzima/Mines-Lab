import { choice, configured, number, numbers, percent, unavailable } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeHilo: GameAnalyzer = (input) => {
  const counts = numbers(input.rankCounts, "Remaining rank counts (A,2…K)", 13, 0, 416, true);
  if (counts.length !== 13 || counts.reduce((a, b) => a + b, 0) === 0) throw new Error("Supply 13 remaining-rank counts with at least one card.");
  const ties = choice(input.ties, "Tie rule", ["lose", "push", "win"]);
  if (input.currentRank === null) return unavailable("Enter the current rank (A=1 through K=13).");
  const rank = number(input.currentRank, "Current rank", 1, 13, true);
  const total = counts.reduce((a, b) => a + b, 0);
  const higher = counts.slice(rank).reduce((a, b) => a + b, 0) / total;
  const lower = counts.slice(0, rank - 1).reduce((a, b) => a + b, 0) / total;
  const tie = counts[rank - 1] / total;
  const higherWin = higher + (ties === "win" ? tie : 0);
  const lowerWin = lower + (ties === "win" ? tie : 0);
  const action = higherWin === lowerWin ? null : higherWin > lowerWin ? "HIGHER" : "LOWER";
  return configured(input, `Higher ${percent(higherWin)} · Lower ${percent(lowerWin)}`, { higherProbability: higher, lowerProbability: lower, tieProbability: tie, higherWinProbability: higherWin, lowerWinProbability: lowerWin, pushProbability: ties === "push" ? tie : 0, comparisonCriterion: "Higher chance to win, not highest expected payout", distribution: "Configured remaining ranks; current card must already be excluded if drawing without replacement", ties }, action);
};
