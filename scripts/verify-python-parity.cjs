#!/usr/bin/env node
"use strict";

/**
 * Explicitly invoked, offline release check. This script is never imported by
 * Next.js, Telegram, a lifecycle hook, or production code. Obtain the operator's
 * approval before running: node scripts/verify-python-parity.cjs
 *
 * Uses exactly the same JSON input in TypeScript and Python, without a shell,
 * network, dependency installation, or persisted game records. Test histories
 * below are synthetic fixtures, never authentic provider outcomes.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(projectRoot, "python/fixtures/analysis-cases.json");
const pythonRoot = path.join(projectRoot, "python");

function at(value, segments) {
  for (const segment of segments) {
    assert.ok(value !== null && typeof value === "object" && Object.hasOwn(value, segment), `Missing output path ${segments.join(".")}`);
    value = value[segment];
  }
  return value;
}

function finiteJson(value, label) {
  if (typeof value === "number") assert.ok(Number.isFinite(value), `${label}: non-finite output`);
  else if (Array.isArray(value)) value.forEach((item, index) => finiteJson(item, `${label}[${index}]`));
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) finiteJson(item, `${label}.${key}`);
  }
}

function near(actual, expected, tolerance, label) {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", `${label}: expected a number`);
    assert.ok(Number.isFinite(actual), `${label}: expected a finite number`);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} (tolerance ${tolerance})`);
  } else assert.deepEqual(actual, expected, label);
}

function contract(signal, gameId, label) {
  assert.equal(signal.gameId, gameId, `${label}: game identity`);
  assert.ok(signal.action === null || typeof signal.action === "string", `${label}: action contract`);
  assert.ok(["validated", "experimental", "unavailable"].includes(signal.status), `${label}: status contract`);
  for (const key of ["source", "generatedAt", "summary"]) assert.ok(typeof signal[key] === "string" && signal[key].length > 0, `${label}: missing ${key}`);
  assert.ok(Number.isFinite(Date.parse(signal.generatedAt)), `${label}: timestamp contract`);
  assert.equal(signal.details.connectionStatus, "Not connected", `${label}: no fabricated connection`);
  assert.notEqual(signal.details.providerVerified, true, `${label}: no provider-authentication claim`);
  finiteJson(signal, label);
}

function reference(gameId, input) {
  const executable = process.env.MINES_LAB_PYTHON || "python3";
  const invocation = spawnSync(executable, ["-m", "mines_lab_analysis"], {
    cwd: projectRoot,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: [pythonRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    input: JSON.stringify({ gameId, input }),
    encoding: "utf8",
    shell: false,
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (invocation.error) throw new Error(`Python CLI could not run: ${invocation.error.message}. Set MINES_LAB_PYTHON to the Python 3.10+ executable if necessary.`);
  assert.equal(invocation.signal, null, `${gameId}: Python CLI terminated`);
  assert.ok(invocation.status === 0 || invocation.status === 2, `${gameId}: Python CLI failed: ${invocation.stderr.trim()}`);
  let envelope;
  try { envelope = JSON.parse(invocation.stdout); }
  catch { throw new Error(`${gameId}: Python CLI did not emit one JSON envelope`); }
  assert.equal(envelope.engineVersion, "4.0.0", `${gameId}: Python contract version`);
  assert.ok(envelope.signal && typeof envelope.signal === "object", `${gameId}: missing Python signal`);
  return { signal: envelope.signal, exitCode: invocation.status };
}

function check(tsPath, pythonPath, value) {
  return value === undefined ? { tsPath, pythonPath } : { tsPath, pythonPath, value };
}
const detail = name => ["details", name];

function additionalCases() {
  const blackjack = { cards: ["A", "7"], dealer: "4", profile: "multi-deck-s17-das", canDouble: false, canSplit: true, afterSplit: false, splitAces: false, rulesConfirmed: true };
  const ranks = Array(13).fill(4);
  return [
    { name: "penalty Series step five", gameId: "penalty", input: { mode: "series", step: 5 }, checks: [check(detail("cumulativeProbability"), detail("cumulativeProbability")), check(detail("displayedMultiplier"), detail("displayedMultiplier"), 46.97)] },
    { name: "penalty Turbo", gameId: "penalty", input: { mode: "turbo", step: 1 }, checks: [check(detail("scoringProbability"), detail("scoringProbability"), .5333)] },
    { name: "blackjack double fallback", gameId: "blackjack", input: blackjack, checks: [check(["action"], ["action"], "STAND"), check(detail("total"), detail("total"), 18)] },
    { name: "blackjack split eights", gameId: "blackjack", input: { ...blackjack, cards: ["8", "8"], dealer: "10", canDouble: true }, checks: [check(["action"], ["action"], "SPLIT")] },
    { name: "blackjack unconfirmed rules", gameId: "blackjack", input: { ...blackjack, rulesConfirmed: false }, checks: [check(["action"], ["action"], null)] },
    { name: "blackjack split aces complete", gameId: "blackjack", input: { ...blackjack, cards: ["A", "6"], afterSplit: true, splitAces: true }, checks: [check(["action"], ["action"], null)] },
    { name: "hilo equal winning probabilities", gameId: "hilo", input: { currentRank: 7, rankCounts: ranks, ties: "win", rulesConfirmed: true }, checks: [check(["action"], ["action"], null), check(detail("higherWinProbability"), detail("higherWinProbability"), 7/13), check(detail("lowerWinProbability"), detail("lowerWinProbability"), 7/13)] },
    { name: "hilo tie push", gameId: "hilo", input: { currentRank: 8, rankCounts: ranks, ties: "push", rulesConfirmed: true }, checks: [check(detail("pushProbability"), detail("pushProbability"), 1/13)] },
    { name: "dice zero strict-under outcomes", gameId: "dice", input: { min: 0, max: 99, threshold: 0, direction: "under", grossPayout: 2, rulesConfirmed: true }, checks: [check(detail("probability"), detail("winProbability"), 0), check(detail("netExpectedReturn"), detail("netExpectedValue"), -1)] },
    { name: "coinflip separate side payouts", gameId: "coinflip", input: { headsProbability: .4, grossPayout: 1.9, headsGrossPayout: 1.8, tailsGrossPayout: 2.2, rulesConfirmed: true }, checks: [check(["details", "headsExpectedReturn", "grossExpectedReturn"], ["details", "heads", "grossExpectedReturn"], .72), check(["details", "tailsExpectedReturn", "netExpectedReturn"], ["details", "tails", "netExpectedValue"], .32)] },
    { name: "plinko biased board", gameId: "plinko", input: { rows: 2, rightProbability: .25, payouts: [1, 2, 3], rulesConfirmed: true }, checks: [check(detail("grossExpectedReturn"), detail("grossExpectedReturn"), 1.5)] },
    { name: "keno explicit full paytable", gameId: "keno", input: { pool: 5, drawn: 2, selections: [1, 2], payouts: { 0: 0, 1: 0, 2: 10 }, rulesConfirmed: true }, checks: [check(detail("grossExpectedReturn"), detail("grossExpectedReturn"), 1), check(detail("netExpectedReturn"), detail("netExpectedValue"), 0)] },
    { name: "poker one replacement", gameId: "poker", input: { variant: "five-card", cards: ["AS", "KS", "QS", "JS", "2H"], discardIndexes: [4], rulesConfirmed: true }, checks: [check(detail("enumeratedOutcomes"), detail("drawOutcomes"), 47), check(["details", "distribution", 5, "probability"], ["details", "categoryProbabilities", "FLUSH"], 8/47)] },
  ];
}

function run() {
  const { registerTypescript } = require("./register-typescript.cjs");
  const restore = registerTypescript();
  try {
    const { analyzeGame } = require("../src/lib/analysis/index.ts");
    const { GAME_IDS } = require("../src/lib/game-registry.ts");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    assert.deepEqual([...new Set(fixture.cases.map(test => test.gameId))].sort(), [...GAME_IDS].sort(), "Shared fixtures must cover exactly all fifteen games");
    const tests = [...fixture.cases, ...additionalCases()];
    let checkedMetrics = 0;
    for (const test of tests) {
      const label = test.name || test.gameId;
      // Serialize first so both implementations receive exactly identical JSON.
      const identicalInput = JSON.parse(JSON.stringify(test.input));
      const tsSignal = analyzeGame(test.gameId, identicalInput);
      const python = reference(test.gameId, identicalInput);
      const pySignal = python.signal;
      assert.equal(python.exitCode, 0, `${label}: valid representative input rejected by Python`);
      contract(tsSignal, test.gameId, `${label} TypeScript`);
      contract(pySignal, test.gameId, `${label} Python`);
      assert.equal(tsSignal.action, pySignal.action, `${label}: action parity`);
      assert.equal(tsSignal.status, pySignal.status, `${label}: status parity`);
      if (!["blackjack", "hilo"].includes(test.gameId) || test.input.rulesConfirmed !== true) {
        assert.equal(tsSignal.action, null, `${label}: no unsupported directional signal`);
        assert.equal(pySignal.action, null, `${label}: no unsupported Python directional signal`);
      }
      for (const metric of test.checks) {
        const tsValue = at(tsSignal, metric.tsPath);
        const pyValue = at(pySignal, metric.pythonPath);
        near(tsValue, pyValue, fixture.tolerance, `${label}: cross-language ${metric.tsPath.join(".")}`);
        if (Object.hasOwn(metric, "value")) {
          near(tsValue, metric.value, fixture.tolerance, `${label}: TypeScript independent expected value`);
          near(pyValue, metric.value, fixture.tolerance, `${label}: Python independent expected value`);
        }
        checkedMetrics++;
      }
    }
    console.log(`PASS: ${tests.length} TypeScript/Python scenarios across all 15 games; ${checkedMetrics} mapped metrics; contract, finite output, action/status parity, and no false provider/direction claims.`);
    console.log("Offline reference parity only. No production Python service, authorized provider feed, or predictive accuracy was verified.");
  } finally { restore(); }
}

if (require.main === module) {
  try { run(); }
  catch (error) { console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}

module.exports = { run };
