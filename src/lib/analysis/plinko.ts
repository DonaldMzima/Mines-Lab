import { choose, configured, number, numbers } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzePlinko: GameAnalyzer = (input) => {
  const rows = number(input.rows, "Rows", 1, 32, true);
  const right = number(input.rightProbability, "Right probability", 0, 1);
  const payouts = numbers(input.payouts, "Gross bucket payouts", 33, 0, 1e9);
  if (payouts.length !== rows + 1) throw new Error("Supply one gross payout for every bucket (rows + 1).");
  const buckets = payouts.map((payout, k) => ({ bucket: k, probability: choose(rows, k) * right ** k * (1 - right) ** (rows - k), grossPayout: payout }));
  const gross = buckets.reduce((s, b) => s + b.probability * b.grossPayout, 0);
  return configured(input, `Expected gross return: ${gross.toFixed(4)}×`, { buckets, grossExpectedReturn: gross, netExpectedReturn: gross - 1, rows, rightProbability: right }, null,
    "Binomial distribution assumes independent identical left/right decisions and the supplied gross payout table. The actual board physics and 1win payout table remain unverified.");
};
