/* Local release verification. Run only after the user's approval:
 * node scripts/verify-release.cjs http://127.0.0.1:3100
 * Reads source and mathematical test fixtures; writes no application state.
 * Requests are restricted to loopback. No Telegram/provider credentials are used. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { registerTypescript, projectRoot } = require("./register-typescript.cjs");

function loopbackOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", "Use the local HTTP test server.");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Release checks are restricted to loopback.");
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "Supply a plain loopback origin.");
  return url.origin;
}
function withoutGeneratedAt(signal) {
  const { generatedAt, ...rest } = signal;
  return rest;
}
function finiteJson(value, location = "signal") {
  if (typeof value === "number") assert.ok(Number.isFinite(value), `${location} contains a nonfinite number.`);
  else if (Array.isArray(value)) value.forEach((item, i) => finiteJson(item, `${location}[${i}]`));
  else if (value !== null && typeof value === "object") Object.entries(value).forEach(([key, item]) => finiteJson(item, `${location}.${key}`));
  else assert.ok(value === null || ["boolean", "string"].includes(typeof value), `${location} is not JSON-compatible.`);
}
function signalContract(signal, gameId) {
  assert.equal(signal.gameId, gameId);
  assert.ok(signal.action === null || typeof signal.action === "string");
  assert.ok(["validated", "experimental", "unavailable"].includes(signal.status));
  assert.equal(typeof signal.source, "string");
  assert.ok(signal.source.length > 0);
  assert.equal(typeof signal.summary, "string");
  assert.ok(signal.summary.length > 0 && signal.summary.length <= 200);
  assert.equal(typeof signal.generatedAt, "string");
  assert.ok(Number.isFinite(Date.parse(signal.generatedAt)));
  assert.ok(signal.details && typeof signal.details === "object" && !Array.isArray(signal.details));
  assert.equal(signal.details.connectionStatus, "Not connected");
  assert.notEqual(signal.details.providerVerified, true);
  assert.equal(signal.details.accuracy, "Not evaluated");
  finiteJson(signal);
}

async function runReleaseVerification(options = {}) {
  const origin = loopbackOrigin(options.baseUrl ?? "http://127.0.0.1:3100");
  const restoreTypescript = registerTypescript();
  let checks = 0;
  const failures = [];
  const log = message => { if (!options.quiet) process.stdout.write(message + "\n"); };
  async function check(name, action) {
    checks++;
    try { await action(); log("PASS " + name); }
    catch (error) { failures.push({ name, error: error instanceof Error ? error.message : String(error) }); log("FAIL " + name + ": " + failures[failures.length - 1].error); }
  }
  async function request(route, init = {}) {
    const response = await fetch(origin + route, { ...init, redirect: "error", signal: AbortSignal.timeout(45_000) });
    const raw = await response.text();
    return { response, raw, json: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : null };
  }
  async function post(body, contentType = "application/json; charset=utf-8") {
    return request("/api/analysis", { method: "POST", headers: { "content-type": contentType }, body: typeof body === "string" ? body : JSON.stringify(body) });
  }
  try {
    const { analyzeGame, getDefaultInput } = require(path.join(projectRoot, "src/lib/analysis/index.ts"));
    const { GAME_IDS } = require(path.join(projectRoot, "src/lib/game-registry.ts"));
    const fixtures = JSON.parse(fs.readFileSync(path.join(projectRoot, "python/fixtures/analysis-cases.json"), "utf8"));
    assert.equal(fixtures.cases.length, 15, "Release fixtures must cover all fifteen games.");
    assert.deepEqual([...new Set(fixtures.cases.map(item => item.gameId))].sort(), [...GAME_IDS].sort());

    for (const route of ["/", "/signals", "/history", "/settings"]) {
      await check("page " + route, async () => {
        const { response, raw } = await request(route);
        assert.equal(response.status, 200);
        assert.ok(response.headers.get("content-type")?.includes("text/html"));
        assert.match(raw, /Mines Lab/i);
        assert.match(raw, /<html/i);
      });
    }

    for (const fixture of fixtures.cases) {
      await check("API and direct engine agree: " + fixture.gameId, async () => {
        const input = structuredClone(fixture.input);
        if (Array.isArray(input.history)) input.history = input.history.map((record, i) => ({ ...record, roundId: `release-test-fixture-${i + 1}`, source: "manual" }));
        const direct = analyzeGame(fixture.gameId, input);
        const { response, json } = await post({ gameId: fixture.gameId, input });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        signalContract(json, fixture.gameId);
        assert.deepEqual(withoutGeneratedAt(json), withoutGeneratedAt(direct));
        for (const expected of fixture.checks) {
          const actual = expected.tsPath.reduce((value, key) => value[key], json);
          if (typeof expected.value === "number") assert.ok(Math.abs(actual - expected.value) <= fixtures.tolerance, expected.tsPath.join("."));
          else assert.deepEqual(actual, expected.value);
        }
        if (fixture.gameId === "blackjack") assert.equal(json.action, "DOUBLE");
        else if (fixture.gameId === "hilo") assert.equal(json.action, "LOWER");
        else assert.equal(json.action, null, "These fixture calculations do not establish a winning action.");
      });
    }

    await check("Coinflip side-specific payouts preserve null recommendation", async () => {
      const input = { ...getDefaultInput("coinflip"), headsProbability: 0.4, headsGrossPayout: 2.2, tailsGrossPayout: 1.5, rulesConfirmed: true };
      const { response, json } = await post({ gameId: "coinflip", input });
      assert.equal(response.status, 200);
      signalContract(json, "coinflip");
      assert.equal(json.action, null);
      assert.ok(Math.abs(json.details.headsExpectedReturn.grossExpectedReturn - .88) < 1e-12);
      assert.ok(Math.abs(json.details.tailsExpectedReturn.grossExpectedReturn - .9) < 1e-12);
    });
    await check("unknown state remains unavailable without fabricated cards", async () => {
      const { response, json } = await post({ gameId: "blackjack", input: getDefaultInput("blackjack") });
      assert.equal(response.status, 200);
      signalContract(json, "blackjack");
      assert.equal(json.status, "unavailable");
      assert.equal(json.action, null);
    });
    await check("round IDs are canonicalized", async () => {
      const { response, json } = await post({ gameId: "dice", input: { ...getDefaultInput("dice"), roundId: "  release-test-fixture-round  " } });
      assert.equal(response.status, 200);
      assert.equal(json.roundId, "release-test-fixture-round");
    });

    for (const [name, body, status] of [
      ["malformed JSON", "{", 400],
      ["top-level array", [], 400],
      ["unknown game", { gameId: "unsupported", input: {} }, 400],
      ["missing input", { gameId: "dice" }, 400],
      ["null input", { gameId: "dice", input: null }, 400],
      ["array input", { gameId: "dice", input: [] }, 400],
      ["empty JSON body", "", 400],
    ]) {
      await check("API rejects " + name, async () => {
        const { response, json } = await post(body);
        assert.equal(response.status, status);
        assert.equal(typeof json.error, "string");
      });
    }
    await check("API rejects unsupported content type", async () => {
      const { response, json } = await post({ gameId: "dice", input: getDefaultInput("dice") }, "text/plain");
      assert.equal(response.status, 415);
      assert.equal(typeof json.error, "string");
    });
    await check("API enforces actual 64 KiB body limit", async () => {
      const { response, json } = await post({ gameId: "dice", input: { ...getDefaultInput("dice"), oversizedTestPadding: "x".repeat(70_000) } });
      assert.equal(response.status, 413);
      assert.equal(typeof json.error, "string");
    });
    await check("invalid game settings return explicit 422 contract", async () => {
      const { response, json } = await post({ gameId: "dice", input: { ...getDefaultInput("dice"), threshold: -1 } });
      assert.equal(response.status, 422);
      signalContract(json, "dice");
      assert.equal(json.status, "unavailable");
      assert.equal(json.action, null);
      assert.ok(Array.isArray(json.details.validationErrors) && json.details.validationErrors.length > 0);
    });
    await check("invalid calendar dates cannot become crash history", async () => {
      const { response, json } = await post({ gameId: "aviator", input: { target: 2, history: [{ roundId: "release-invalid-date-fixture", completedAt: "2020-02-31T00:00:00Z", multiplier: 2, source: "manual" }] } });
      assert.equal(response.status, 422);
      assert.equal(json.action, null);
      assert.ok(json.details.validationErrors.length > 0);
    });
    await check("unconfirmed Blackjack rules cannot issue an action", async () => {
      const input = { ...getDefaultInput("blackjack"), cards: ["5", "6"], dealer: "10", rulesConfirmed: false };
      const { response, json } = await post({ gameId: "blackjack", input });
      assert.equal(response.status, 200);
      assert.equal(json.action, null);
      assert.equal(json.status, "experimental");
    });
    log(`Release verification: ${checks - failures.length}/${checks} checks passed.`);
    return { checks, passed: checks - failures.length, failures };
  } finally { restoreTypescript(); }
}

module.exports = { runReleaseVerification, loopbackOrigin };
if (require.main === module) {
  runReleaseVerification({ baseUrl: process.argv[2] ?? "http://127.0.0.1:3100" })
    .then(result => { if (result.failures.length) process.exitCode = 1; })
    .catch(error => { process.stderr.write("Release verification failed: " + (error instanceof Error ? error.message : String(error)) + "\n"); process.exitCode = 1; });
}
