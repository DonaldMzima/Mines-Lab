export const PENALTY_GAME_ID = "v_1wingames:penalty";
export const PENALTY_RTP = 0.94;
export const PENALTY_SERIES_MULTIPLIERS = [1.81, 3.41, 7.3, 15.65, 46.97] as const;

export type PenaltyMode = "turbo" | "series";

interface PenaltyStepRule {
  step: number;
  scoreProbability: number;
}

/** Rules verified from the supplied in-game screenshots, not inferred directions. */
export const PENALTY_TURBO_SCORE_PROBABILITY = 0.5333;
export const PENALTY_SERIES_RULES: readonly PenaltyStepRule[] = [
  { step: 1, scoreProbability: 0.5333 },
  { step: 2, scoreProbability: 0.5333 },
  { step: 3, scoreProbability: 0.4667 },
  { step: 4, scoreProbability: 0.4667 },
  { step: 5, scoreProbability: 0.3333 },
];

export interface PenaltyStepAnalysis extends PenaltyStepRule {
  saveProbability: number;
  cumulativeScoreProbability: number;
  displayedMultiplier: number;
  /** Probability × displayed multiplier. Not a verified provider EV. */
  impliedGrossReturn: number;
}

export function getPenaltySeriesAnalysis(): PenaltyStepAnalysis[] {
  let cumulativeScoreProbability = 1;
  return PENALTY_SERIES_RULES.map((rule, index) => {
    cumulativeScoreProbability *= rule.scoreProbability;
    const displayedMultiplier = PENALTY_SERIES_MULTIPLIERS[index];
    return {
      ...rule,
      saveProbability: 1 - rule.scoreProbability,
      cumulativeScoreProbability,
      displayedMultiplier,
      impliedGrossReturn: calculatePenaltyExpectedReturn(cumulativeScoreProbability, displayedMultiplier).grossExpectedReturn,
    };
  });
}

export function getPenaltyScoreProbability(mode: PenaltyMode, completedSteps = 1): number {
  if (!Number.isInteger(completedSteps) || completedSteps < 1) {
    throw new RangeError("Completed steps must be a positive integer.");
  }
  if (mode === "turbo") {
    if (completedSteps !== 1) throw new RangeError("Turbo mode has exactly one shot.");
    return PENALTY_TURBO_SCORE_PROBABILITY;
  }
  if (completedSteps > PENALTY_SERIES_RULES.length) {
    throw new RangeError(`Series mode supports at most ${PENALTY_SERIES_RULES.length} steps.`);
  }
  return getPenaltySeriesAnalysis()[completedSteps - 1].cumulativeScoreProbability;
}

/**
 * Calculates a gross expected return and net expectation only after an exact,
 * verified payout multiplier is supplied. No payout schedule is stored here.
 */
export function calculatePenaltyExpectedReturn(scoreProbability: number, multiplier: number) {
  if (!Number.isFinite(scoreProbability) || scoreProbability < 0 || scoreProbability > 1) {
    throw new RangeError("Score probability must be between 0 and 1.");
  }
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError("Payout multiplier must be a finite non-negative number.");
  }
  const grossExpectedReturn = scoreProbability * multiplier;
  return { grossExpectedReturn, netExpectedReturn: grossExpectedReturn - 1 };
}

export function formatPenaltyProbability(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Probability must be between 0 and 1.");
  }
  return new Intl.NumberFormat("en", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(probability);
}
