import { configured, ev, number, percent, record } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeTowers: GameAnalyzer = (input) => {
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 32) throw new Error("Rows must contain 1–32 layout objects.");
  const rows = input.rows.map((raw, i) => {
    const row = record(raw, `Row ${i + 1}`);
    const tiles = number(row.tiles, "Tiles per row", 2, 100, true);
    const hazards = number(row.hazards, "Hazards per row", 0, tiles, true);
    return { tiles, hazards, survivalProbability: (tiles - hazards) / tiles };
  });
  const steps = number(input.steps, "Steps", 1, rows.length, true);
  const probability = rows.slice(0, steps).reduce((p, row) => p * row.survivalProbability, 1);
  return configured(input, `${percent(probability)} chance to survive ${steps} rows`, { rows, steps, survivalProbability: probability, ...ev(probability, input.grossPayout) }, null,
    "One tile chosen per independent row with uniformly located hazards. Unknown hazard positions are never shown as confirmed. Correlated provider layouts require separate rules.");
};
