import { choice, configured, ev, number, percent } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeDice: GameAnalyzer = (input) => {
  const min = number(input.min, "Minimum", -1e6, 1e6, true);
  const max = number(input.max, "Maximum", min, min + 1e6, true);
  const threshold = number(input.threshold, "Threshold", min, max, true);
  const direction = choice(input.direction, "Direction", ["under", "over"]);
  const winning = direction === "under" ? threshold - min : max - threshold;
  const probability = winning / (max - min + 1);
  return configured(input, `${percent(probability)} win chance`, { probability, winningOutcomes: winning, totalOutcomes: max - min + 1, direction, threshold, comparison: direction === "under" ? "strictly below" : "strictly above", ...ev(probability, input.grossPayout) }, null,
    "Exact count for a uniform inclusive integer range and strict threshold. Gross payout includes the stake. Decimal or non-uniform provider dice are not covered.");
};
