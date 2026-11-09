import { awareTimestamp } from "../analysis/timestamp";
import type { FootballMarket, FootballPrimaryOutcome } from "./types";

// Keep the existing version and JSON fields so saved forecasts remain comparable.
export const FOOTBALL_ANALYSIS_VERSION = "mines-lab-football-evaluation-1";
const resultLabels = ["home", "draw", "away"] as const;
type ResultLabel = typeof resultLabels[number];
const priority = ["result", "btts", "goals-15", "goals-25", "goals-35", "double-chance", "correct-score"];

export class FootballAnalysisError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new FootballAnalysisError(`${label} must be an object.`);
  return value;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function timestamp(value: unknown, label: string): bigint {
  try { return awareTimestamp(value, label); }
  catch (error) { throw new FootballAnalysisError(error instanceof Error ? error.message : "Invalid timestamp."); }
}

export function validateMarkets(value: unknown, resultTolerance = 1.5): FootballMarket[] {
  if (!Array.isArray(value) || value.length > 20) throw new FootballAnalysisError("markets must be a list of at most 20 supported markets.");
  const keys = new Set<string>();
  const markets: FootballMarket[] = [];
  for (const raw of value) {
    const market = record(raw, "market");
    const { key, name } = market;
    if (typeof key !== "string" || !priority.includes(key)) continue;
    if (keys.has(key)) throw new FootballAnalysisError("markets contains a duplicate market.");
    if (typeof name !== "string" || !name.trim() || name.length > 100) throw new FootballAnalysisError("A supported market is missing its display name.");
    if (!Array.isArray(market.outcomes) || market.outcomes.length < 1 || market.outcomes.length > 100) throw new FootballAnalysisError(`${key} must contain between 1 and 100 outcomes.`);
    const labels = new Set<string>();
    const outcomes = market.outcomes.map(rawOutcome => {
      const item = record(rawOutcome, `${key} outcome`);
      if (typeof item.label !== "string" || !item.label.trim() || item.label.length > 80) throw new FootballAnalysisError(`${key} contains an invalid outcome label.`);
      if (!finite(item.probability) || item.probability < 0 || item.probability > 100) throw new FootballAnalysisError(`${key} contains a probability outside 0-100 percent.`);
      const label = item.label.trim();
      if (labels.has(label.toLowerCase())) throw new FootballAnalysisError(`${key} contains duplicate outcome labels.`);
      labels.add(label.toLowerCase());
      return { label, probability: item.probability };
    });
    const total = outcomes.reduce((sum, item) => sum + item.probability, 0);
    const hasLabels = (expected: readonly string[]) => labels.size === expected.length && expected.every(label => labels.has(label));
    if (key === "result" && (!hasLabels(resultLabels) || Math.abs(total - 100) > resultTolerance)) throw new FootballAnalysisError("The full-time result market must contain home, draw, and away probabilities summing to 100 percent.");
    if (key === "btts" && (!hasLabels(["yes", "no"]) || Math.abs(total - 100) > 1.5)) throw new FootballAnalysisError("The both-teams-to-score market must contain yes and no probabilities summing to 100 percent.");
    if (key.startsWith("goals-") && (!hasLabels(["over", "under"]) || Math.abs(total - 100) > 1.5)) throw new FootballAnalysisError("A goals market must contain over and under probabilities summing to 100 percent.");
    if (key === "double-chance" && (outcomes.length !== 3 || Math.abs(total - 100) > 1.5)) throw new FootballAnalysisError("The double-chance market must contain three probabilities summing to 100 percent.");
    if (key === "correct-score" && (outcomes.length < 2 || Math.abs(total - 100) > 2)) throw new FootballAnalysisError("The correct-score distribution must contain at least two outcomes summing to 100 percent.");
    keys.add(key);
    markets.push({ key, name: name.trim(), outcomes });
  }
  return markets;
}

export interface FootballValidation {
  status: "validated" | "unavailable";
  modelVersion: string;
  primaryOutcome: FootballPrimaryOutcome | null;
  markets: FootballMarket[];
  message: string;
}

export function validateProviderForecast(payload: unknown, now = new Date(), resultTolerance = 1.5): FootballValidation {
  const data = record(payload, "request");
  if (!Number.isSafeInteger(data.fixtureId) || Number(data.fixtureId) <= 0) throw new FootballAnalysisError("fixtureId must be a positive integer.");
  const kickoff = timestamp(data.kickoff, "kickoff");
  if (typeof data.predictable !== "boolean") throw new FootballAnalysisError("predictable must be a boolean.");
  const unavailable = (message: string): FootballValidation => ({ status: "unavailable", modelVersion: FOOTBALL_ANALYSIS_VERSION, primaryOutcome: null, markets: [], message });
  if (!data.predictable) return unavailable("The provider does not mark this fixture as predictable.");
  if (kickoff <= timestamp(now.toISOString(), "now")) return unavailable("Predictions are only validated before kickoff.");
  const markets = validateMarkets(data.markets, resultTolerance);
  for (const key of priority) {
    const market = markets.find(item => item.key === key);
    if (!market) continue;
    // Match the existing validator's stable first-outcome tie ordering. The
    // provider adapter separately retains its no-single-pick rule for ties.
    const top = market.outcomes.reduce((best, item) => item.probability > best.probability ? item : best);
    return {
      status: "validated", modelVersion: FOOTBALL_ANALYSIS_VERSION, markets,
      primaryOutcome: { marketKey: key, market: market.name, outcome: top.label, probability: top.probability },
      message: "Provider probabilities passed contract and distribution checks; this is not a guarantee or independent accuracy claim.",
    };
  }
  return unavailable("No supported provider probability markets were returned.");
}

type Probabilities = Record<ResultLabel, number>;
interface OddsSnapshot { probabilities: Probabilities; decimalOdds: Probabilities }
function bookmakerSnapshots(forecast: Record<string, unknown>, kickoff: bigint): OddsSnapshot[] {
  if (!Array.isArray(forecast.referenceOdds)) return [];
  const snapshots: OddsSnapshot[] = [];
  for (const item of forecast.referenceOdds) {
    if (!isRecord(item) || !isRecord(item.decimalOdds) || typeof item.bookmaker !== "string") continue;
    try { if (timestamp(item.retrievedAt, "referenceOdds.retrievedAt") >= kickoff) continue; } catch { continue; }
    const odds = item.decimalOdds;
    if (!resultLabels.every(label => finite(odds[label]) && Number(odds[label]) > 1)) continue;
    const decimalOdds = Object.fromEntries(resultLabels.map(label => [label, odds[label]])) as Probabilities;
    const implied = resultLabels.map(label => 1 / decimalOdds[label]);
    const total = implied.reduce((sum, value) => sum + value, 0);
    if (total <= 0) continue;
    snapshots.push({ decimalOdds, probabilities: Object.fromEntries(resultLabels.map((label, index) => [label, implied[index] / total])) as Probabilities });
  }
  return snapshots;
}
function brier(probabilities: Probabilities, actual: ResultLabel): number {
  return resultLabels.reduce((sum, label) => sum + (probabilities[label] - Number(label === actual)) ** 2, 0) / 3;
}

/** Preserve the former evaluator's six-decimal, nearest-even rounding. */
function roundUnits(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const high = view.getUint32(0), low = view.getUint32(4);
  const encodedExponent = (high >>> 20) & 0x7ff;
  const exponent = encodedExponent === 0 ? -1074 : encodedExponent - 1023 - 52;
  if (exponent >= 0) return value;
  const mantissa = BigInt((high & 0xfffff) + (encodedExponent === 0 ? 0 : 0x100000)) * BigInt(2 ** 32) + BigInt(low);
  const scale = BigInt(1_000_000);
  const numerator = mantissa * scale, denominator = BigInt(1) << BigInt(-exponent);
  let rounded = numerator / denominator;
  const remainder = (numerator % denominator) * BigInt(2);
  if (remainder > denominator || remainder === denominator && rounded % BigInt(2) !== BigInt(0)) rounded += BigInt(1);
  return Number(`${value < 0 ? "-" : ""}${rounded / scale}.${String(rounded % scale).padStart(6, "0")}`);
}

export function evaluateProviderForecasts(records: unknown, now?: Date) {
  if (!Array.isArray(records) || records.length > 500) throw new FootballAnalysisError("records must be a list of at most 500 forecast records.");
  const settled: { actual: ResultLabel; predicted: ResultLabel; confidence: number; brier: number; odds: OddsSnapshot[] }[] = [];
  for (const row of records) {
    if (!isRecord(row) || !isRecord(row.forecast) || !isRecord(row.result)) continue;
    const { forecast, result } = row;
    let markets: FootballMarket[];
    try {
      markets = validateMarkets(forecast.markets);
      const kickoff = timestamp(forecast.kickoff, "forecast.kickoff");
      const generated = timestamp(forecast.generatedAt, "forecast.generatedAt");
      const completed = timestamp(result.completedAt, "result.completedAt");
      if (generated >= kickoff || completed <= kickoff || (now !== undefined && completed > timestamp(now.toISOString(), "now"))) continue;
      const market = markets.find(item => item.key === "result");
      if (!market || !Number.isSafeInteger(result.home) || !Number.isSafeInteger(result.away) || Number(result.home) < 0 || Number(result.away) < 0) continue;
      const actual: ResultLabel = Number(result.home) > Number(result.away) ? "home" : Number(result.away) > Number(result.home) ? "away" : "draw";
      const probabilities = Object.fromEntries(market.outcomes.map(item => [item.label.toLowerCase(), item.probability / 100])) as Probabilities;
      const predicted = resultLabels.reduce((best, label) => probabilities[label] > probabilities[best] ? label : best);
      settled.push({ actual, predicted, confidence: probabilities[predicted], brier: brier(probabilities, actual), odds: bookmakerSnapshots(forecast, kickoff) });
    } catch (error) {
      if (!(error instanceof FootballAnalysisError)) throw error;
    }
  }
  const count = settled.length;
  const calibrationBins = [0, 0.2, 0.4, 0.6, 0.8].map(lower => {
    const upper = lower + 0.2;
    const bucket = settled.filter(item => lower <= item.confidence && (item.confidence < upper || upper === 1 && item.confidence === 1));
    return { lower, upper, count: bucket.length, meanConfidence: bucket.length ? bucket.reduce((sum, item) => sum + item.confidence, 0) / bucket.length : null, empiricalAccuracy: bucket.length ? bucket.filter(item => item.actual === item.predicted).length / bucket.length : null };
  });
  const bookmakerRecords = settled.filter(item => item.odds.length > 0);
  const netUnits = bookmakerRecords.reduce((sum, item) => sum + (item.actual === item.predicted ? Math.max(...item.odds.map(odds => odds.decimalOdds[item.predicted])) - 1 : -1), 0);
  return {
    modelVersion: FOOTBALL_ANALYSIS_VERSION,
    evaluatedFixtures: count,
    topOutcomeAccuracy: count ? settled.filter(item => item.actual === item.predicted).length / count : null,
    multiclassBrierScore: count ? settled.reduce((sum, item) => sum + item.brier, 0) / count : null,
    uniformBaselineBrierScore: count ? 2 / 9 : null,
    bookmakerBrierScore: bookmakerRecords.length ? bookmakerRecords.reduce((sum, item) => sum + brier(item.odds[0].probabilities, item.actual), 0) / bookmakerRecords.length : null,
    bookmakerEvaluatedFixtures: bookmakerRecords.length,
    hypotheticalTopOutcomeBets: bookmakerRecords.length,
    hypotheticalOneUnitNetReturn: bookmakerRecords.length ? roundUnits(netUnits) : null,
    calibrationBins,
    disclaimer: "Chronological, saved pre-kickoff provider forecasts only. Bookmaker and one-unit outcomes use recorded pre-kickoff odds; neither metric establishes future accuracy or profitability.",
  };
}
