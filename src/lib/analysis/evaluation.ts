import { awareTimestamp } from "./timestamp";

/** Prospective descriptive evaluation; imported provenance is never authenticated here. */
export interface PredictionRecord {
  game: string;
  model_version: string;
  data_source: string;
  predicted_event: string;
  created_at: string;
  baseline_probability: number;
  round_id: string | null;
}
export interface CompletedOutcome {
  game: string;
  round_id: string;
  actual_event: string;
  completed_at: string;
  data_source: string;
  provenance_verified?: boolean;
}
export interface EvaluatedPrediction {
  prediction: PredictionRecord;
  actual_event: string;
  outcome_at: string;
  correct: boolean;
}


export function evaluatePrediction(prediction: PredictionRecord, actualEvent: string, outcomeAt: string): EvaluatedPrediction {
  if (typeof prediction.baseline_probability !== "number" || !Number.isFinite(prediction.baseline_probability) || prediction.baseline_probability < 0 || prediction.baseline_probability > 1) throw new Error("baseline_probability must be between 0 and 1");
  const generated = awareTimestamp(prediction.created_at, "created_at"), completed = awareTimestamp(outcomeAt, "outcome_at");
  if (!prediction.round_id || !prediction.game || !prediction.model_version) throw new Error("prediction needs game, model_version and round_id");
  if (typeof actualEvent !== "string" || !actualEvent) throw new Error("actual_event must be a nonempty string");
  if (completed <= generated) throw new Error("outcome must occur after the prediction was recorded");
  return { prediction, actual_event: actualEvent, outcome_at: outcomeAt, correct: prediction.predicted_event === actualEvent };
}

export function pairPrediction(prediction: PredictionRecord, outcome: CompletedOutcome): EvaluatedPrediction {
  if (prediction.game !== outcome.game || prediction.round_id !== outcome.round_id) throw new Error("prediction and outcome game/round IDs must match");
  if (prediction.data_source !== outcome.data_source) throw new Error("prediction and outcome data sources must match");
  return evaluatePrediction(prediction, outcome.actual_event, outcome.completed_at);
}

export function wilsonInterval(successes: number, total: number, z = 1.959963984540054): [number, number] | null {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(successes) || total < 0) throw new Error("counts must be nonnegative integers");
  if (typeof z !== "number" || !Number.isFinite(z) || z <= 0) throw new Error("z must be finite and positive");
  if (successes < 0 || successes > total) throw new Error("successes must be between 0 and total");
  if (total === 0) return null;
  const rate = successes / total;
  const denominator = 1 + z * z / total;
  const center = (rate + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(rate * (1 - rate) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function performance(records: EvaluatedPrediction[]) {
  if (!records.length) return { sampleSize: 0, successRate: null, wilson95: null, baselineExpectedRate: null, validatedAccuracy: null };
  const groups = new Set(records.map(({ prediction }) => JSON.stringify([prediction.game, prediction.model_version, prediction.data_source])));
  if (groups.size !== 1) throw new Error("evaluate each game, model version and provenance class independently");
  const seen = new Set<string>();
  for (const row of records) {
    const checked = evaluatePrediction(row.prediction, row.actual_event, row.outcome_at);
    if (checked.correct !== row.correct) throw new Error("stored success flag disagrees with the outcome");
    const id = row.prediction.round_id as string;
    if (seen.has(id)) throw new Error("duplicate evaluated round");
    seen.add(id);
  }
  const successes = records.filter(row => row.correct).length;
  const baseline = records.reduce((sum, row) => sum + row.prediction.baseline_probability, 0) / records.length;
  return {
    sampleSize: records.length, successes, failures: records.length - successes,
    successRate: successes / records.length, wilson95: wilsonInterval(successes, records.length),
    baselineExpectedRate: baseline, differenceFromBaseline: successes / records.length - baseline,
    validatedAccuracy: null,
    limitation: "Chronology and matching are validated; imported provenance and predictive advantage are not independently established.",
  };
}
