/* Written for authorized execution: node --test src/lib/analysis-records.test.cjs */
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeGame, getDefaultInput } = require("./analysis/index.ts");
const { parseAnalysisRecord, parseCompletedGameResult, evaluateGameRecord, summarizeEvaluations } = require("./analysis-records.ts");
const { readGameAnalysis } = require("./analysis-client-storage.ts");

function fixture() {
  const input = { ...getDefaultInput("dice"), rulesConfirmed: true, roundId: "future-round" };
  const signal = { ...analyzeGame("dice", input), generatedAt: "2025-01-01T00:00:00.000Z" };
  const record = { id: "record-1", signal, input, recordedAt: "2025-01-01T00:00:00.001Z" };
  const result = parseCompletedGameResult({ gameId: "dice", roundId: "future-round", completedAt: "2025-01-01T00:00:01Z", source: "manual", data: { value: 42 } });
  return { record, result };
}
test("matches a recorded probability to a later manual event without provider claims", () => {
  const { record, result } = fixture();
  const evaluation = evaluateGameRecord(record, result);
  assert.equal(evaluation.success, true);
  assert.equal(evaluation.predictedProbability, .5);
  assert.equal(evaluation.brierScore, .25);
  assert.equal(evaluation.independent, false);
});
test("rejects outcomes preceding recording and mismatched round identities", () => {
  const { record, result } = fixture();
  assert.throws(() => evaluateGameRecord(record, { ...result, completedAt: record.recordedAt }));
  assert.throws(() => evaluateGameRecord(record, { ...result, roundId: "another" }));
  assert.equal(evaluateGameRecord({ ...record, signal: { ...record.signal, roundId: undefined } }, result), null);
});
test("recomputes probability instead of trusting saved baseline details", () => {
  const { record, result } = fixture();
  record.signal.details.probability = .99;
  assert.equal(evaluateGameRecord(record, result).predictedProbability, .5);
});
test("rejects invalid input and changed saved action during evaluation", () => {
  const { record, result } = fixture();
  assert.throws(() => evaluateGameRecord({ ...record, input: { ...record.input, max: NaN } }, result));
  assert.throws(() => evaluateGameRecord({ ...record, signal: { ...record.signal, action: "WIN" } }, result));
});
test("does not promote provider labels or opaque Penalty fields to completed results", () => {
  assert.throws(() => parseCompletedGameResult({ gameId: "penalty", roundId: "x", completedAt: "2025-01-01T00:00:00Z", source: "provider", data: { mode: "series", step: 1, scored: true } }));
  assert.throws(() => parseCompletedGameResult({ gameId: "penalty", roundId: "x", completedAt: "2025-01-01T00:00:00Z", source: "manual", data: { mode: "series", step: 1, catches: 2 } }));
});
test("rejects impossible dates and malformed restored React display fields", () => {
  const { record, result } = fixture();
  assert.throws(() => parseCompletedGameResult({ ...result, completedAt: "2025-02-31T00:00:00Z" }));
  assert.throws(() => parseAnalysisRecord({ ...record, signal: { ...record.signal, status: ["validated"] } }));
  assert.throws(() => parseAnalysisRecord({ ...record, signal: { ...record.signal, explanation: {} } }));
});
test("validates Keno zero-draw and five-card Poker variant boundaries", () => {
  assert.deepEqual(parseCompletedGameResult({ gameId: "keno", roundId: "k", completedAt: "2025-01-01T00:00:00Z", source: "manual", data: { drawnNumbers: [] } }).data.drawnNumbers, []);
  assert.throws(() => parseCompletedGameResult({ gameId: "poker", roundId: "p", completedAt: "2025-01-01T00:00:00Z", source: "manual", data: { cards: ["As", "Kd", "Qc", "Jh", "Ts", "9c"] } }));
});
test("restoration rejects duplicate round-linked analyses without overwriting storage", () => {
  const { record } = fixture();
  const serialized = JSON.stringify({ version: 1, config: record.input, records: [record, { ...record, id: "record-2" }], results: [] });
  global.window = { localStorage: { getItem: () => serialized } };
  assert.throws(() => readGameAnalysis("dice", getDefaultInput("dice")));
  delete global.window;
});
test("reports sample size failures baseline and bounded Wilson uncertainty", () => {
  const { record, result } = fixture();
  const win = evaluateGameRecord(record, result);
  const loss = evaluateGameRecord(record, { ...result, data: { value: 80 } });
  const summary = summarizeEvaluations([win, { ...loss, recordId: "record-2", roundId: "round-2" }]);
  assert.equal(summary.samples, 2); assert.equal(summary.successes, 1); assert.equal(summary.failures, 1);
  assert.equal(summary.meanBaseline, .5);
  assert.ok(summary.wilson95[0] > 0 && summary.wilson95[1] < 1);
});
