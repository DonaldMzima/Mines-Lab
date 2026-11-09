import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateProviderForecasts, validateMarkets, validateProviderForecast } from "./analysis";

const now = new Date("2026-03-01T00:00:00Z");
const forecast = {
  fixtureId: 123, kickoff: "2026-03-02T00:00:00Z", generatedAt: now.toISOString(), predictable: true,
  markets: [{ key: "result", name: "Full-time result", outcomes: [
    { label: "Home", probability: 50 }, { label: "Draw", probability: 25 }, { label: "Away", probability: 25 },
  ] }, { key: "btts", name: "Both teams to score", outcomes: [{ label: "Yes", probability: 40 }, { label: "No", probability: 60 }] }],
};
const result = { home: 2, away: 1, completedAt: "2026-03-03T00:00:00Z" };
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("native validation retains provider values and the existing priority without network access", () => {
  const output = validateProviderForecast(forecast, now);
  assert.equal(output.status, "validated");
  assert.deepEqual(output.markets, forecast.markets);
  assert.deepEqual(output.primaryOutcome, { marketKey: "result", market: "Full-time result", outcome: "Home", probability: 50 });
  assert.equal(output.modelVersion, "mines-lab-football-evaluation-1");
});

test("unpredictable, started, and empty forecasts never invent probabilities", () => {
  for (const input of [{ ...forecast, predictable: false }, { ...forecast, kickoff: now.toISOString() }, { ...forecast, markets: [] }]) {
    const output = validateProviderForecast(input, now);
    assert.equal(output.status, "unavailable");
    assert.equal(output.primaryOutcome, null);
    assert.deepEqual(output.markets, []);
  }
});

test("native validation rejects bad identity, naive/invalid times, invalid and duplicate probabilities", () => {
  for (const fixtureId of [true, 0, -1, 1.5, "123"]) assert.throws(() => validateProviderForecast({ ...forecast, fixtureId }, now));
  for (const kickoff of ["2026-03-02T00:00:00", "2026-02-30T00:00:00Z", "invalid"]) assert.throws(() => validateProviderForecast({ ...forecast, kickoff }, now));
  for (const probability of [true, NaN, Infinity, -1, 101]) {
    assert.throws(() => validateMarkets([{ ...forecast.markets[0], outcomes: [{ label: "home", probability }] }]));
  }
  assert.throws(() => validateMarkets([{ ...forecast.markets[0], outcomes: [{ label: "home", probability: 50 }, { label: "HOME", probability: 50 }] }]), /duplicate/);
  assert.throws(() => validateMarkets([forecast.markets[0], forecast.markets[0]]), /duplicate/);
  assert.throws(() => validateMarkets([{ ...forecast.markets[0], outcomes: [{ label: "home", probability: 50 }, { label: "draw", probability: 25 }, { label: "away", probability: 10 }] }]), /summing/);
  assert.throws(() => validateProviderForecast({ ...forecast, predictable: "true" }, now), /boolean/);
  assert.deepEqual(validateMarkets([{ key: "unsupported" }]), []);
});

test("all supported distributions retain the service validation rules", () => {
  const cases = [
    { key: "btts", labels: ["yes", "no"] },
    { key: "goals-15", labels: ["over", "under"] },
    { key: "goals-25", labels: ["over", "under"] },
    { key: "goals-35", labels: ["over", "under"] },
    { key: "double-chance", labels: ["home-draw", "home-away", "draw-away"] },
    { key: "correct-score", labels: ["1-0", "0-0"] },
  ];
  for (const { key, labels } of cases) {
    const market = { key, name: key, outcomes: labels.map(label => ({ label, probability: 100 / labels.length })) };
    assert.equal(validateMarkets([market]).length, 1);
    assert.throws(() => validateMarkets([{ ...market, outcomes: market.outcomes.map(item => ({ ...item, probability: 5 })) }]));
  }
  const rounded = [{ ...forecast.markets[0], outcomes: [{ label: "home", probability: 50 }, { label: "draw", probability: 25 }, { label: "away", probability: 23 }] }];
  assert.throws(() => validateMarkets(rounded));
  assert.deepEqual(validateMarkets(rounded, 2), rounded); // Existing API-Football parser tolerance.
});

test("evaluation preserves chronological filtering, Brier formula, baseline, and calibration", () => {
  const evaluation = evaluateProviderForecasts([{ forecast, result }], new Date("2026-03-04T00:00:00Z"));
  assert.equal(evaluation.evaluatedFixtures, 1);
  assert.equal(evaluation.topOutcomeAccuracy, 1);
  near(evaluation.multiclassBrierScore, (0.5 ** 2 + 0.25 ** 2 + 0.25 ** 2) / 3);
  near(evaluation.uniformBaselineBrierScore, 2 / 9);
  assert.equal(evaluation.calibrationBins[2].count, 1);
  assert.equal(evaluation.calibrationBins[2].meanConfidence, 0.5);
  assert.equal(evaluation.bookmakerBrierScore, null);
  assert.equal(evaluation.hypotheticalOneUnitNetReturn, null);
});

test("evaluation skips malformed, late, pending, and explicitly future results", () => {
  for (const row of [null, {}, { forecast, result: null }, { forecast: { ...forecast, generatedAt: forecast.kickoff }, result }, { forecast, result: { ...result, completedAt: forecast.kickoff } }, { forecast, result: { ...result, home: true } }, { forecast: { ...forecast, markets: [] }, result }]) {
    assert.equal(evaluateProviderForecasts([row]).evaluatedFixtures, 0);
  }
  assert.equal(evaluateProviderForecasts([{ forecast, result }], now).evaluatedFixtures, 0);
  assert.equal(evaluateProviderForecasts([]).topOutcomeAccuracy, null);
  assert.throws(() => evaluateProviderForecasts(Array(501).fill(null)), /500/);
  assert.throws(() => evaluateProviderForecasts({}), /list/);
});

test("pre-kickoff reference odds keep first-bookmaker Brier and best-price unit returns", () => {
  const odds = (bookmaker: string, home: number, retrievedAt = now.toISOString()) => ({ bookmaker, retrievedAt, decimalOdds: { home, draw: 4, away: 4 } });
  const row = { forecast: { ...forecast, referenceOdds: [odds("first", 2), odds("best", 3), odds("late", 99, forecast.kickoff)] }, result };
  const evaluation = evaluateProviderForecasts([row]);
  near(evaluation.bookmakerBrierScore, (0.5 ** 2 + 0.25 ** 2 + 0.25 ** 2) / 3);
  assert.equal(evaluation.bookmakerEvaluatedFixtures, 1);
  assert.equal(evaluation.hypotheticalTopOutcomeBets, 1);
  assert.equal(evaluation.hypotheticalOneUnitNetReturn, 2);
  assert.equal(evaluateProviderForecasts([{ ...row, result: { ...result, home: 0, away: 1 } }]).hypotheticalOneUnitNetReturn, -1);
  const halfEven = { forecast: { ...forecast, referenceOdds: [odds("exact half", 1.0078125)] }, result };
  assert.equal(evaluateProviderForecasts([halfEven]).hypotheticalOneUnitNetReturn, .007812);
});

test("saved microsecond timestamps preserve prospective ordering and offset equivalence", () => {
  const row = { forecast: { ...forecast, generatedAt: "2026-03-02T00:00:00.000001Z", kickoff: "2026-03-02T02:00:00.000002+02:00" }, result: { ...result, completedAt: "2026-03-02T00:00:00.000003Z" } };
  assert.equal(evaluateProviderForecasts([row]).evaluatedFixtures, 1);
  assert.equal(evaluateProviderForecasts([{ ...row, forecast: { ...row.forecast, generatedAt: row.forecast.kickoff } }]).evaluatedFixtures, 0);
});
