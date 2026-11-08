import { choose, configured, number, numbers, payoutTable, percent } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeKeno: GameAnalyzer = (input) => {
  const pool = number(input.pool, "Number pool", 1, 100, true);
  const drawn = number(input.drawn, "Drawn numbers", 0, pool, true);
  const selections = numbers(input.selections, "Selections", pool, 1, pool, true);
  if (selections.length === 0 || new Set(selections).size !== selections.length) throw new Error("Select at least one unique number.");
  const payouts = payoutTable(input.payouts, selections.length);
  const denominator = choose(pool, drawn);
  const distribution = Array.from({ length: selections.length + 1 }, (_, hits) => ({ hits, probability: choose(selections.length, hits) * choose(pool - selections.length, drawn - hits) / denominator, grossPayout: payouts[hits] ?? 0 }));
  const completePayout = Object.keys(payouts).length === selections.length + 1;
  const gross = distribution.reduce((s, r) => s + r.probability * r.grossPayout, 0);
  return configured(input, `All selected hit: ${percent(distribution[selections.length].probability)}`, { distribution, pool, drawn, selectionCount: selections.length, ...(completePayout ? { grossExpectedReturn: gross, netExpectedReturn: gross - 1 } : {}), payoutTableComplete: completePayout }, null,
    "Uniform draw without replacement. Expected return is available only after an explicit gross payout, including zero, is entered for every hit count.");
};
