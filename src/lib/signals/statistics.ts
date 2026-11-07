import { calculateSurvivalProbability, TOTAL_TILES } from "@/lib/mines";
import type {
  SignalEvaluation,
  SignalResult,
  SignalStatistics,
} from "@/lib/signals/types";

// Descriptive Wilson interval within a single board configuration; assumes independent rounds.
function successInterval(successes: number, total: number): [number, number] | null {
  if (total === 0) return null;
  const z = 1.959963984540054;
  const rate = successes / total;
  const denominator = 1 + z * z / total;
  const center = (rate + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function calculateSignalStatistics(
  signals: SignalResult[],
  evaluations: SignalEvaluation[],
): SignalStatistics {
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const evaluationById = new Map(evaluations.map((evaluation) => [evaluation.signalId, evaluation]));
  const validEvaluations = [...evaluationById.values()].filter((evaluation) => signalById.has(evaluation.signalId));
  const successful = validEvaluations.filter((evaluation) => evaluation.survivedAllSelections).length;
  const groups = new Map<string, {
    mineCount: number;
    suggestedTileCount: number;
    generated: number;
    evaluated: number;
    successful: number;
    expectedSuccessRate: number;
  }>();

  for (const signal of signals) {
    const key = `${signal.mineCount}:${signal.suggestedTiles.length}`;
    const group = groups.get(key) ?? {
      mineCount: signal.mineCount,
      suggestedTileCount: signal.suggestedTiles.length,
      generated: 0,
      evaluated: 0,
      successful: 0,
      expectedSuccessRate: calculateSurvivalProbability(
        TOTAL_TILES,
        signal.mineCount,
        signal.suggestedTiles.length,
      ),
    };
    group.generated += 1;
    const evaluation = evaluationById.get(signal.id);
    if (evaluation) {
      group.evaluated += 1;
      if (evaluation.survivedAllSelections) group.successful += 1;
    }
    groups.set(key, group);
  }

  const expectedRates = validEvaluations.flatMap((evaluation) => {
    const signal = signalById.get(evaluation.signalId);
    return signal
      ? [calculateSurvivalProbability(TOTAL_TILES, signal.mineCount, signal.suggestedTiles.length)]
      : [];
  });

  return {
    totalGenerated: signals.length,
    totalEvaluated: validEvaluations.length,
    unevaluated: signals.length - validEvaluations.length,
    precommittedEvaluated: validEvaluations.filter((item) => item.association === "precommitted").length,
    successful,
    failed: validEvaluations.length - successful,
    observedSuccessRate:
      validEvaluations.length === 0 ? null : successful / validEvaluations.length,
    expectedSuccessRate:
      expectedRates.length === 0
        ? null
        : expectedRates.reduce((sum, rate) => sum + rate, 0) / expectedRates.length,
    groups: [...groups.values()].map((group) => ({
      ...group,
      observedSuccessRate:
        group.evaluated === 0 ? null : group.successful / group.evaluated,
      successInterval: successInterval(group.successful, group.evaluated),
    })),
  };
}
