/* Run only with user permission: node --test src/lib/analysis/analysis.test.cjs
 * Uses the existing TypeScript dependency; no test-only packages or transpiled files. */
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(compiled, filename);
};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeGame, getDefaultInput, validateGameInput } = require("./index.ts");
const { rankPokerHand } = require("./poker.ts");
const ids = ["mines", "penalty", "blackjack", "hilo", "dice", "plinko", "keno", "towers", "coinflip", "poker", "lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash"];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("every game accepts a bounded default without inventing an action", () => {
  for (const id of ids) {
    const input = getDefaultInput(id);
    assert.deepEqual(validateGameInput(id, input), [], id);
    const signal = analyzeGame(id, input);
    assert.equal(signal.gameId, id);
    assert.equal(signal.action, null, id);
    assert.equal(signal.details.connectionStatus, "Not connected");
  }
});
test("Mines combinatorics agree with combinations", () => {
  near(analyzeGame("mines", { mines: 3, picks: 3 }).details.survivalProbability, (22 * 21 * 20) / (25 * 24 * 23));
});
test("Penalty Series uses conditional probabilities rather than a fixed rate", () => {
  const result = analyzeGame("penalty", { mode: "series", step: 5 });
  near(result.details.cumulativeProbability, .5333 ** 2 * .4667 ** 2 * .3333);
  assert.equal(result.action, null);
  assert.equal(result.details.gridVerified, false);
});
test("Blackjack gates actions on confirmed rules and available actions", () => {
  const base = { ...getDefaultInput("blackjack"), cards: ["A", "7"], dealer: "3" };
  assert.equal(analyzeGame("blackjack", base).action, null);
  assert.equal(analyzeGame("blackjack", { ...base, rulesConfirmed: true }).action, "DOUBLE");
  assert.equal(analyzeGame("blackjack", { ...base, rulesConfirmed: true, canDouble: false }).action, "STAND");
  assert.equal(analyzeGame("blackjack", { ...base, cards: ["8", "8"], dealer: "A", rulesConfirmed: true }).action, "SPLIT");
  const splitAces = analyzeGame("blackjack", { ...base, cards: ["A", "5"], afterSplit: true, splitAces: true, rulesConfirmed: true });
  assert.equal(splitAces.action, null);
  assert.equal(splitAces.details.handComplete, true);
});
test("Hilo handles ties and exact remaining distribution", () => {
  const input = { ...getDefaultInput("hilo"), currentRank: 8, rulesConfirmed: true };
  const result = analyzeGame("hilo", input);
  near(result.details.higherProbability + result.details.lowerProbability + result.details.tieProbability, 1);
  assert.equal(result.action, "LOWER");
  assert.equal(analyzeGame("hilo", { ...input, currentRank: 7 }).action, null);
});
test("Dice uses inclusive range and strict comparisons", () => {
  const input = { ...getDefaultInput("dice"), min: 0, max: 99, threshold: 50, grossPayout: 1.9 };
  near(analyzeGame("dice", input).details.probability, .5);
  near(analyzeGame("dice", { ...input, direction: "over" }).details.probability, .49);
  near(analyzeGame("dice", input).details.netExpectedReturn, -.05);
});
test("Plinko distribution sums to one and matches known binomial center", () => {
  const result = analyzeGame("plinko", getDefaultInput("plinko"));
  near(result.details.buckets.reduce((s, b) => s + b.probability, 0), 1);
  near(result.details.buckets[4].probability, 70 / 256);
});
test("Keno probabilities normalize; incomplete payout table cannot produce EV", () => {
  const result = analyzeGame("keno", getDefaultInput("keno"));
  near(result.details.distribution.reduce((s, r) => s + r.probability, 0), 1);
  assert.equal(result.details.grossExpectedReturn, undefined);
  assert.ok(validateGameInput("keno", { ...getDefaultInput("keno"), selections: [1, 1] }).length);
});
test("Towers multiplies independent row survival and flip makes no side forecast", () => {
  near(analyzeGame("towers", { ...getDefaultInput("towers"), steps: 3 }).details.survivalProbability, (2 / 3) ** 3);
  const flip = analyzeGame("coinflip", { ...getDefaultInput("coinflip"), rulesConfirmed: true });
  assert.equal(flip.action, null);
  near(flip.details.headsExpectedReturn.netExpectedReturn, -.05);
});
test("Coinflip supports separate side payouts without inventing a winning side", () => {
  const input = { ...getDefaultInput("coinflip"), headsProbability: .4, grossPayout: 1.9, headsGrossPayout: 2.2, tailsGrossPayout: 1.5, rulesConfirmed: true };
  const result = analyzeGame("coinflip", input);
  near(result.details.headsExpectedReturn.grossExpectedReturn, .88);
  near(result.details.tailsExpectedReturn.grossExpectedReturn, .9);
  assert.equal(result.action, null);
  const fallback = analyzeGame("coinflip", { ...input, headsGrossPayout: null });
  near(fallback.details.headsExpectedReturn.grossExpectedReturn, .76);
  assert.ok(validateGameInput("coinflip", { ...input, tailsGrossPayout: -1 }).length);
});
test("Poker handles wheel, full house, exact replacement normalization, duplicates", () => {
  assert.equal(rankPokerHand(["AS", "2H", "3D", "4C", "5S"]).name, "Straight");
  assert.equal(rankPokerHand(["AS", "AH", "AD", "KC", "KS"]).name, "Full house");
  const result = analyzeGame("poker", { variant: "five-card", cards: ["AS", "KS", "QS", "JS", "2D"], discardIndexes: [4] });
  assert.equal(result.details.enumeratedOutcomes, 47);
  near(result.details.distribution.reduce((s, r) => s + r.probability, 0), 1);
  near(result.details.distribution[8].probability, 1 / 47);
  assert.throws(() => rankPokerHand(["AS", "AS", "2D", "3D", "4D"]));
});
test("Crash histories separate exact threshold ties and reject duplicate provenance", () => {
  const history = [1.5, 2, 3].map((multiplier, i) => ({ roundId: String(i), completedAt: "2025-01-01T00:00:00Z", multiplier, source: "import" }));
  for (const id of ["lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash"]) {
    const result = analyzeGame(id, { history, target: 2 });
    near(result.details.historicalAtOrAboveProbability, 2 / 3);
    near(result.details.historicalStrictlyAboveProbability, 1 / 3);
    assert.equal(result.action, null);
    assert.equal(result.status, "experimental");
    assert.ok(validateGameInput(id, { history: [...history, history[0]], target: 2 }).length);
  }
});
test("Invalid inputs become explicit unavailable contracts", () => {
  for (const id of ids) {
    const result = analyzeGame(id, null);
    assert.equal(result.status, "unavailable");
    assert.ok(result.details.validationErrors.length);
  }
  assert.ok(validateGameInput("plinko", { rows: 32, rightProbability: .5, payouts: [] }).length);
  assert.ok(validateGameInput("blackjack", { ...getDefaultInput("blackjack"), rulesConfirmed: "yes" }).length);
  assert.ok(validateGameInput("aviator", { target: 2, history: [{ roundId: "bad-date", completedAt: "2020-02-31T00:00:00Z", multiplier: 2, source: "manual" }] }).length);
});

const sharedFixtures = JSON.parse(fs.readFileSync(require("node:path").resolve(__dirname, "../../../python/fixtures/analysis-cases.json"), "utf8"));
for (const fixture of sharedFixtures.cases) {
  test(`Shared Python/TypeScript mathematical fixture: ${fixture.gameId}`, () => {
    const signal = analyzeGame(fixture.gameId, fixture.input);
    for (const check of fixture.checks) {
      const actual = check.tsPath.reduce((value, key) => value[key], signal);
      if (typeof check.value === "number") assert.ok(Math.abs(actual - check.value) <= sharedFixtures.tolerance, `${check.tsPath.join(".")}: ${actual} != ${check.value}`);
      else assert.deepEqual(actual, check.value);
    }
  });
}
