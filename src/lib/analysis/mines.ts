import { calculateSurvivalProbability } from "../mines";
import { configured, number, percent } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeMines: GameAnalyzer = (input) => {
  const mines = number(input.mines, "Mines", 1, 24, true);
  const picks = number(input.picks, "Picks", 1, 25 - mines, true);
  const probability = calculateSurvivalProbability(25, mines, picks);
  return configured(input, `${percent(probability)} chance to survive ${picks} picks`, { mines, picks, survivalProbability: probability, nextSafeProbability: (25 - mines) / 25 }, null,
    "Uniformly placed hidden mines: all unrevealed starting tiles have the same probability. Use the existing Mines board for explicitly experimental random suggestions.");
};
