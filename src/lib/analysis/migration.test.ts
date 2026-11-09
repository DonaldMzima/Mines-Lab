import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeGame, getDefaultInput } from "./index";
import { GAME_IDS } from "../game-registry";
import { pairPrediction, performance, wilsonInterval, type PredictionRecord } from "./evaluation";
import { analyzeRequest } from "../../../scripts/analyze.cjs";

const near = (actual: unknown, expected: number) => assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("native registry covers all 15 games and defaults are independent", () => {
  assert.equal(GAME_IDS.length, 15);
  const first = getDefaultInput("hilo");
  (first.rankCounts as number[])[0] = 0;
  assert.equal((getDefaultInput("hilo").rankCounts as number[])[0], 4);
  assert.throws(() => analyzeGame("unknown" as typeof GAME_IDS[number], {}));
});

test("reference Blackjack chart cells, ace adjustment, terminal and split-ace behavior remain", () => {
  const cases: [string[], string, string | null][] = [
    [["8", "8"], "A", "SPLIT"], [["9", "9"], "7", "STAND"], [["A", "7"], "4", "DOUBLE"],
    [["A", "7"], "A", "HIT"], [["5", "6"], "A", "HIT"], [["5", "6"], "10", "DOUBLE"],
    [["10", "2"], "3", "HIT"], [["10", "2"], "4", "STAND"], [["K", "Q", "2"], "6", null],
  ];
  for (const [cards, dealer, action] of cases) assert.equal(analyzeGame("blackjack", { ...getDefaultInput("blackjack"), cards, dealer, rulesConfirmed: true }).action, action);
  for (const [cards, soft] of [[["A", "A", "9"], true], [["A", "A", "9", "K"], false]] as const) {
    const signal = analyzeGame("blackjack", { ...getDefaultInput("blackjack"), cards: [...cards], dealer: "6" });
    assert.equal(signal.details.total, 21);
    assert.equal(signal.details.soft, soft);
  }
});

test("native probability edge cases retain exact reference formulas", () => {
  near(analyzeGame("penalty", { mode: "series", step: 5 }).details.cumulativeProbability, .5333 ** 2 * .4667 ** 2 * .3333);
  near(analyzeGame("penalty", { mode: "turbo", step: 1 }).details.scoringProbability, .5333);
  near(analyzeGame("hilo", { ...getDefaultInput("hilo"), currentRank: 7, ties: "win" }).details.higherWinProbability, 7 / 13);
  near(analyzeGame("hilo", { ...getDefaultInput("hilo"), currentRank: 8, ties: "push" }).details.pushProbability, 1 / 13);
  near(analyzeGame("dice", { ...getDefaultInput("dice"), threshold: 0 }).details.netExpectedReturn, -1);
  near(analyzeGame("plinko", { rows: 2, rightProbability: .25, payouts: [1, 2, 3] }).details.grossExpectedReturn, 1.5);
  near(analyzeGame("keno", { pool: 5, drawn: 2, selections: [1, 2], payouts: { 0: 0, 1: 0, 2: 10 } }).details.grossExpectedReturn, 1);
  const flip = analyzeGame("coinflip", { headsProbability: .5 });
  assert.deepEqual(flip.details.headsExpectedReturn, {});
  for (const max of [true, NaN]) assert.equal(analyzeGame("dice", { ...getDefaultInput("dice"), max }).status, "unavailable");
});

const prediction: PredictionRecord = { game: "hilo", model_version: "model-1", data_source: "import", predicted_event: "HIGHER", created_at: "2026-01-01T00:00:00Z", baseline_probability: .5, round_id: "round-1" };
const completed = { game: "hilo", round_id: "round-1", actual_event: "HIGHER", completed_at: "2026-01-01T00:00:01Z", data_source: "import" };

test("prospective evaluation preserves matching, chronology, provenance, and duplicate protections", () => {
  const row = pairPrediction(prediction, completed);
  assert.equal(row.correct, true);
  for (const change of [{ round_id: "round-2" }, { game: "mines" }, { completed_at: prediction.created_at }, { data_source: "provider" }]) assert.throws(() => pairPrediction(prediction, { ...completed, ...change }));
  assert.throws(() => performance([row, row]), /duplicate/);
  assert.throws(() => performance([{ ...row, correct: false }]), /success flag/);
  assert.throws(() => performance([row, { ...row, prediction: { ...prediction, model_version: "other", round_id: "round-2" } }]), /independently/);
  const report = performance([pairPrediction(prediction, { ...completed, actual_event: "LOWER" })]);
  assert.equal(report.successRate, 0);
  assert.equal(report.baselineExpectedRate, .5);
  assert.equal(report.validatedAccuracy, null);
  const interval = wilsonInterval(50, 100);
  near(interval?.[0], .4038315303659956);
  near(interval?.[1], .5961684696340044);
  assert.equal(wilsonInterval(0, 0), null);
  for (const [successes, total] of [[1, 0], [0, -1], [2, 1], [.5, 10]]) assert.throws(() => wilsonInterval(successes, total));
});

test("offline JSON CLI preserves versioned output, registry listing, validation, and byte limit", () => {
  const call = (value: unknown) => analyzeRequest(Buffer.from(JSON.stringify(value)));
  const result = call({ gameId: "mines", input: { mines: 3, picks: 3 } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.body.engineVersion, "4.0.0");
  assert.deepEqual(result.body.signal?.details, analyzeGame("mines", { mines: 3, picks: 3 }).details);
  const list = analyzeRequest(Buffer.alloc(0), ["--list"]);
  assert.deepEqual(list.body.games, GAME_IDS);
  for (const value of [[], { gameId: "unknown" }, { gameId: "mines", input: { mines: true, picks: 3 } }]) assert.equal(call(value).exitCode, 2);
  assert.equal(analyzeRequest(Buffer.from('{"gameId":"mines","input":{"mines":NaN}}')).exitCode, 2);
  assert.equal(analyzeRequest(Buffer.alloc(1_048_577)).body.error, "request exceeds 1 MiB");
});
