/* Run with: node --test src/lib/football/football.test.cjs */
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { registerTypescript } = require("../../../scripts/register-typescript.cjs");

const restoreTypescript = registerTypescript();
const environment = {
  FOOTBALL_MODEL_API_URL: process.env.FOOTBALL_MODEL_API_URL,
  FOOTBALL_MODEL_API_TOKEN: process.env.FOOTBALL_MODEL_API_TOKEN,
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};
const originalFetch = global.fetch;
const token = "test-token-with-more-than-thirty-two-characters";
const markets = [{
  key: "result",
  name: "Full-time result",
  outcomes: [
    { label: "home", probability: 50 },
    { label: "draw", probability: 30 },
    { label: "away", probability: 20 },
  ],
}];

before(() => {
  process.env.FOOTBALL_MODEL_API_URL = "https://analysis.example";
  process.env.FOOTBALL_MODEL_API_TOKEN = token;
});

after(() => {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
  restoreTypescript();
});

test("validates a matching provider forecast and selects only a returned outcome", async () => {
  const { validateProviderForecast } = require("./python-client.ts");
  let request;
  global.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      status: "validated",
      modelVersion: "test",
      primaryOutcome: { marketKey: "result", market: "Full-time result", outcome: "home", probability: 50 },
      markets,
      message: "Validated provider probabilities.",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await validateProviderForecast({
    fixtureId: 123,
    kickoff: "2099-01-01T00:00:00Z",
    predictable: true,
    markets,
  });
  assert.equal(request.url, "https://analysis.example/v1/validate-predictions");
  assert.equal(request.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(result.primaryOutcome.outcome, "home");
  assert.equal(result.markets[0].outcomes[0].probability, 50);
});

test("rejects a Python recommendation that is not present in the provider distribution", async () => {
  const { validateProviderForecast } = require("./python-client.ts");
  global.fetch = async () => new Response(JSON.stringify({
    status: "validated",
    modelVersion: "test",
    primaryOutcome: { marketKey: "result", market: "Full-time result", outcome: "away", probability: 99 },
    markets,
    message: "Invalid response.",
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(() => validateProviderForecast({
    fixtureId: 123,
    kickoff: "2099-01-01T00:00:00Z",
    predictable: true,
    markets,
  }), /did not match provider data/);
});

test("returns unavailable forecasts without promoting an unsupported action", async () => {
  const { validateProviderForecast } = require("./python-client.ts");
  global.fetch = async () => new Response(JSON.stringify({
    status: "unavailable",
    modelVersion: "test",
    primaryOutcome: null,
    markets: [],
    message: "The provider does not mark this fixture as predictable.",
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await validateProviderForecast({
    fixtureId: 123,
    kickoff: "2099-01-01T00:00:00Z",
    predictable: false,
    markets,
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.primaryOutcome, null);
  assert.deepEqual(result.markets, []);
});

test("rejects insecure Python service configuration before making a request", async () => {
  const { validateProviderForecast } = require("./python-client.ts");
  process.env.FOOTBALL_MODEL_API_URL = "http://analysis.example";
  global.fetch = async () => { throw new Error("Unexpected request."); };
  await assert.rejects(() => validateProviderForecast({
    fixtureId: 123,
    kickoff: "2099-01-01T00:00:00Z",
    predictable: true,
    markets,
  }), /HTTPS origin/);
  process.env.FOOTBALL_MODEL_API_URL = "https://analysis.example";
});

test("validates API-Football fixture envelopes and rejects inconsistent result counts", () => {
  const { parseApiFootballEnvelope } = require("./provider.ts");
  assert.deepEqual(parseApiFootballEnvelope({
    errors: [],
    results: 1,
    paging: { current: 1, total: 1 },
    response: [{ fixture: { id: 123 } }],
  }).response, [{ fixture: { id: 123 } }]);
  assert.throws(() => parseApiFootballEnvelope({
    errors: [],
    results: 2,
    paging: { current: 1, total: 1 },
    response: [{ fixture: { id: 123 } }],
  }), /did not match/);
  assert.throws(() => parseApiFootballEnvelope({
    errors: { plan: "unavailable" },
    results: 0,
    paging: { current: 1, total: 1 },
    response: [],
  }), /unavailable/);
});

test("parses current API-Football league seasons and fixture results", () => {
  const { parseApiFootballCompetition, parseApiFootballFixture } = require("./provider.ts");
  const competition = parseApiFootballCompetition({
    league: { id: 39, name: "Premier League", code: "PL" },
    country: { name: "England" },
    seasons: [{ year: 2026, current: true }],
  });
  assert.equal(competition.season, 2026);
  assert.equal(parseApiFootballCompetition({
    league: { id: 39, name: "Premier League" },
    country: null,
    seasons: [{ year: 2025, current: false }],
  }), null);

  const fixture = parseApiFootballFixture({
    fixture: { id: 123, date: "2025-01-01T12:00:00+00:00", status: { short: "FT", long: "Match Finished" } },
    teams: { home: { name: "Home FC" }, away: { name: "Away FC" } },
    league: { id: 39, name: "Premier League", country: "England", season: 2025 },
    goals: { home: 2, away: 1 },
  });
  assert.equal(fixture.isCompleted, true);
  assert.equal(fixture.homeScore, 2);
  assert.equal(fixture.awayScore, 1);
});

test("accepts only complete, bounded API-Football prediction percentages", () => {
  const { parseApiFootballPrediction } = require("./provider.ts");
  const row = {
    predictions: {
      percent: { home: "45%", draw: "25%", away: "30%" },
    },
  };
  assert.deepEqual(parseApiFootballPrediction(row)[0].outcomes.map((item) => item.probability), [45, 25, 30]);
  assert.deepEqual(parseApiFootballPrediction({
    predictions: { percent: { home: "45%", draw: "25%", away: "20%" } },
  }), []);
  assert.deepEqual(parseApiFootballPrediction({
    predictions: { percent: { home: "45%", draw: "25%", away: null } },
  }), []);
});

test("caches API-Football leagues and charges only uncached provider requests", async () => {
  process.env.API_FOOTBALL_KEY = "local-test-key";
  process.env.API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  const cache = new Map();
  let quotaCount = 0;
  let providerCalls = 0;
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.example") {
      const command = JSON.parse(init.body);
      if (command[0] === "GET") return new Response(JSON.stringify({ result: cache.get(command[1]) ?? null }));
      if (command[0] === "SET") {
        cache.set(command[1], command[2]);
        return new Response(JSON.stringify({ result: "OK" }));
      }
      if (command[0] === "EVAL") {
        quotaCount += 1;
        return new Response(JSON.stringify({ result: [1, quotaCount] }));
      }
      throw new Error("Unexpected Redis command.");
    }
    providerCalls += 1;
    assert.equal(url.pathname, "/leagues");
    assert.equal(new Headers(init.headers).get("x-apisports-key"), "local-test-key");
    return new Response(JSON.stringify({
      errors: [],
      results: 1,
      paging: { current: 1, total: 1 },
      response: [{
        league: { id: 39, name: "Premier League", code: "PL" },
        country: { name: "England" },
        seasons: [{ year: 2026, current: true }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const { getFootballCompetitions } = require("./provider.ts");
  assert.equal((await getFootballCompetitions()).competitions.length, 1);
  assert.equal((await getFootballCompetitions()).competitions.length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(quotaCount, 1);
});

test("loads cached fixture pages and marks results truncated at the five-page bound", async () => {
  process.env.API_FOOTBALL_KEY = "local-test-key";
  process.env.API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  const cache = new Map();
  const requestedPages = [];
  let quotaCount = 0;
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.example") {
      const command = JSON.parse(init.body);
      if (command[0] === "GET") return new Response(JSON.stringify({ result: cache.get(command[1]) ?? null }));
      if (command[0] === "SET") {
        cache.set(command[1], command[2]);
        return new Response(JSON.stringify({ result: "OK" }));
      }
      if (command[0] === "EVAL") {
        quotaCount += 1;
        return new Response(JSON.stringify({ result: [1, quotaCount] }));
      }
      throw new Error("Unexpected Redis command.");
    }

    const page = Number(url.searchParams.get("page"));
    const total = url.searchParams.get("from") === url.searchParams.get("to") ? 6 : 2;
    requestedPages.push(page);
    return new Response(JSON.stringify({
      errors: [],
      results: 1,
      paging: { current: page, total },
      response: [{
        fixture: { id: 1000 + page, date: "2099-01-01T12:00:00Z", status: { short: "NS", long: "Not Started" } },
        teams: { home: { name: "Home FC" }, away: { name: "Away FC" } },
        league: { id: 39, name: "Premier League", country: "England", season: 2099 },
        goals: { home: null, away: null },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const { listFootballFixtures } = require("./provider.ts");
  const next7 = await listFootballFixtures("next7");
  assert.equal(next7.fixtures.length, 2);
  assert.equal(next7.truncated, false);
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal((await listFootballFixtures("next7")).fixtures.length, 2);
  assert.deepEqual(requestedPages, [1, 2]);

  const today = await listFootballFixtures("today");
  assert.equal(today.fixtures.length, 5);
  assert.equal(today.truncated, true);
  assert.deepEqual(requestedPages, [1, 2, 1, 2, 3, 4, 5]);
  assert.equal(quotaCount, 7);
});

test("stops reserving outbound API-Football requests at the shared daily cap", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  global.fetch = async (_input, init) => {
    const command = JSON.parse(init.body);
    assert.equal(command[0], "EVAL");
    return new Response(JSON.stringify({ result: [0, 90] }));
  };
  const { reserveApiFootballRequest } = require("./storage.ts");
  assert.deepEqual(await reserveApiFootballRequest(), { allowed: false, count: 90 });
});
