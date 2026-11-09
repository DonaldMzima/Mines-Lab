"use strict";

/** Offline fixture/contract verification. Obtain permission before executing. */
const assert = require("node:assert/strict");
const fixtures = require("../src/lib/analysis/fixtures/analysis-cases.json");
const { registerTypescript } = require("./register-typescript.cjs");

function finiteJson(value) {
  if (typeof value === "number") assert.ok(Number.isFinite(value), "non-finite signal output");
  else if (Array.isArray(value)) value.forEach(finiteJson);
  else if (value !== null && typeof value === "object") Object.values(value).forEach(finiteJson);
}

function run() {
  const restore = registerTypescript();
  try {
    const { analyzeGame } = require("../src/lib/analysis/index.ts");
    const { GAME_IDS } = require("../src/lib/game-registry.ts");
    assert.deepEqual([...new Set(fixtures.cases.map(row => row.gameId))].sort(), [...GAME_IDS].sort());
    let metrics = 0;
    for (const row of fixtures.cases) {
      const signal = analyzeGame(row.gameId, row.input);
      assert.equal(signal.gameId, row.gameId);
      assert.ok(["validated", "experimental", "unavailable"].includes(signal.status));
      assert.ok(signal.action === null || typeof signal.action === "string");
      for (const field of ["source", "generatedAt", "summary"]) assert.ok(typeof signal[field] === "string" && signal[field].length > 0);
      assert.ok(Number.isFinite(Date.parse(signal.generatedAt)));
      assert.equal(signal.details.connectionStatus, "Not connected");
      assert.notEqual(signal.details.providerVerified, true);
      assert.equal(signal.details.analysisVersion, "4.0.0");
      finiteJson(signal);
      if (!["blackjack", "hilo"].includes(row.gameId) || row.input.rulesConfirmed !== true) assert.equal(signal.action, null);
      for (const check of row.checks) {
        const actual = check.tsPath.reduce((value, segment) => value[segment], signal);
        if (typeof check.value === "number") assert.ok(typeof actual === "number" && Math.abs(actual - check.value) <= fixtures.tolerance, `${row.gameId}: ${check.tsPath.join(".")}`);
        else assert.deepEqual(actual, check.value);
        metrics++;
      }
    }
    console.log(`PASS: ${fixtures.cases.length} game fixtures; ${metrics} expected metrics; finite output, contracts and provenance limits.`);
  } finally { restore(); }
}

module.exports = { run };
if (require.main === module) {
  try { run(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
