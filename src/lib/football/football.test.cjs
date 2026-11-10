/* Run with: node --test src/lib/football/football.test.cjs */
const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { registerTypescript } = require("../../../scripts/register-typescript.cjs");

const restoreTypescript = registerTypescript();
const environment = {
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};
const originalFetch = global.fetch;
require("./analysis.test.ts");
require("./fixture-providers.test.ts");
require("./ticket-generator.test.ts");

after(() => {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
  restoreTypescript();
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
    assert.equal(url.searchParams.get("current"), "true");
    assert.equal(url.searchParams.has("page"), false);
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

test("loads and caches the full fixture response without unsupported pagination", async () => {
  process.env.API_FOOTBALL_KEY = "local-test-key";
  process.env.API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  const cache = new Map();
  const requestedQueries = [];
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

    assert.equal(url.pathname, "/fixtures");
    assert.equal(url.searchParams.has("page"), false);
    requestedQueries.push(url.search);
    return new Response(JSON.stringify({
      errors: [],
      results: 1,
      paging: { current: 1, total: 1 },
      response: [{
        fixture: { id: 1001, date: "2099-01-01T12:00:00Z", status: { short: "NS", long: "Not Started" } },
        teams: { home: { name: "Home FC" }, away: { name: "Away FC" } },
        league: { id: 39, name: "Premier League", country: "England", season: 2099 },
        goals: { home: null, away: null },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const { listFootballFixtures } = require("./provider.ts");
  const next7 = await listFootballFixtures("next7");
  assert.equal(next7.fixtures.length, 1);
  assert.equal(next7.truncated, false);
  assert.equal(requestedQueries.length, 1);
  assert.equal((await listFootballFixtures("next7")).fixtures.length, 1);
  assert.equal(requestedQueries.length, 1);

  const today = await listFootballFixtures("today");
  assert.equal(today.fixtures.length, 1);
  assert.equal(today.truncated, false);
  assert.equal(requestedQueries.length, 2);
  assert.equal(quotaCount, 2);
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

test("native fixture validation preserves provider predictions, saved records, and cache reuse", async () => {
  process.env.API_FOOTBALL_KEY = "local-test-key";
  process.env.API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-test-token";
  const cache = new Map();
  const paths = [];
  let savedForecast;
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.example") {
      const command = JSON.parse(init.body);
      if (command[0] === "GET") return Response.json({ result: cache.get(command[1]) ?? null });
      if (command[0] === "SET") { cache.set(command[1], command[2]); return Response.json({ result: "OK" }); }
      if (command[0] === "EVAL" && command[2] === 1) return Response.json({ result: [1, 1] });
      if (command[0] === "EVAL" && command[2] === 2) {
        savedForecast = JSON.parse(command[5]);
        assert.match(command[3], /:api-football:forecast:789$/);
        return Response.json({ result: 1 });
      }
      throw new Error("Unexpected Redis command.");
    }
    assert.equal(url.origin, "https://v3.football.api-sports.io");
    paths.push(url.pathname);
    const response = url.pathname === "/fixtures" ? [{
      fixture: { id: 789, date: "2099-01-01T12:00:00Z", status: { short: "NS", long: "Not Started" } },
      teams: { home: { name: "Home FC" }, away: { name: "Away FC" } },
      league: { id: 39, name: "Premier League", country: "England", season: 2099 },
      goals: { home: null, away: null },
    }] : [{ fixture: { id: 789 }, predictions: { percent: { home: "50%", draw: "30%", away: "20%" } } }];
    return Response.json({ errors: [], results: response.length, response, paging: { current: 1, total: 1 } });
  };
  const { getFootballFixtureDetail } = require("./provider.ts");
  const output = await getFootballFixtureDetail(789);
  assert.equal(output.model.status, "provider-model");
  assert.equal(output.primaryOutcome.outcome, "Home");
  assert.equal(output.primaryOutcome.probability, 50);
  assert.deepEqual(savedForecast.markets, output.markets);
  assert.equal(savedForecast.provider, "API-Football");
  assert.equal(savedForecast.modelVersion, "api-football-v3+mines-lab-football-evaluation-1");
  assert.deepEqual(await getFootballFixtureDetail(789), output);
  assert.deepEqual(paths, ["/fixtures", "/predictions"]);
});

test("history route evaluates existing Redis-shaped records locally without model service configuration", async () => {
  const storage = require("./storage.ts");
  const originalHistory = storage.getForecastHistory;
  const records = [{
    forecast: { fixtureId: 123, provider: "API-Football", kickoff: "2026-03-02T00:00:00Z", generatedAt: "2026-03-01T00:00:00Z", markets: [{ key: "result", name: "Result", outcomes: [{ label: "home", probability: 50 }, { label: "draw", probability: 25 }, { label: "away", probability: 25 }] }] },
    result: { home: 2, away: 1, completedAt: "2026-03-03T00:00:00Z" },
  }];
  storage.getForecastHistory = async () => records;
  const fetchBefore = global.fetch;
  global.fetch = async () => { throw new Error("History evaluation must not make a network request."); };
  try {
    const { GET } = require("../../app/api/football/history/route.ts");
    const response = await GET();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.records, records);
    assert.equal(body.evaluation.evaluatedFixtures, 1);
    assert.equal(body.evaluation.topOutcomeAccuracy, 1);
    assert.equal(body.evaluationMessage, null);
  } finally { storage.getForecastHistory = originalHistory; global.fetch = fetchBefore; }
});

test("manual fixture tickets retain stake calculations and reject fabricated markets", async () => {
  const service = require("./service.ts");
  const storage = require("./storage.ts");
  const { MANUAL_RESULT_MARKET } = require("./ticket-markets.ts");
  const detailBefore = service.getFootballFixtureDetail, saveBefore = storage.saveTicket;
  const fixtureId = 1_000_000_123;
  let persisted;
  service.getFootballFixtureDetail = async () => ({ fixture: { id: fixtureId, source: "football-data.org", homeTeam: "Home", awayTeam: "Away", kickoff: "2099-01-01T12:00:00Z", isUpcoming: true, competition: { name: "Premier League" } }, markets: [], primaryOutcome: null });
  storage.saveTicket = async (_id, value) => { persisted = value; return { ticket: value, duplicate: false }; };
  const request = selection => new Request("https://offline.invalid/api/football/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ browserId: "00000000-0000-4000-8000-000000000001", stakeZar: 10, selections: [selection] }) });
  const input = { fixtureId, market: MANUAL_RESULT_MARKET, selection: "Home", oddsSource: "manual", decimalOdds: 1.85, bookmaker: "User entered" };
  try {
    const { POST } = require("../../app/api/football/tickets/route.ts");
    assert.equal((await POST(request(input))).status, 201);
    assert.equal(persisted.stakeZar, 10);
    assert.equal(persisted.potentialReturnZar, 18.5);
    assert.equal(persisted.potentialProfitZar, 8.5);
    assert.equal(persisted.selections[0].fixtureId, fixtureId);
    assert.equal(persisted.selections[0].oddsSource, "manual");
    assert.equal((await POST(request({ ...input, market: "Invented prediction" }))).status, 409);
    assert.equal((await POST(request({ ...input, decimalOdds: 0 }))).status, 400);
  } finally { service.getFootballFixtureDetail = detailBefore; storage.saveTicket = saveBefore; }
});

test("generation and saving use real fixture/quote contracts, never client-supplied prices", async () => {
  const fixtures = require("./football-data.ts"), odds = require("./odds-provider.ts"), storage = require("./storage.ts");
  const generator = require("./ticket-generator.ts");
  const { fixture, settings } = require("./ticket-generator.test.ts");
  const original = { fixtures: fixtures.getFixturesInRange, odds: odds.getPricedCandidates, cache: storage.cacheJson, cached: storage.cachedJson, save: storage.saveTicket };
  const records = new Map();
  let persisted, oddsCalls = 0;
  const observed = new Date().toISOString();
  fixtures.getFixturesInRange = async (_dates, ids) => { assert.deepEqual(ids, settings.competitionIds); return [fixture]; };
  odds.getPricedCandidates = async () => { oddsCalls++; return { candidates: [{ fixtureId: fixture.id, kickoff: fixture.kickoff, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, competition: fixture.competition.name, market: "Full-time result", selection: "Home", decimalOdds: 1.4, bookmaker: "Book A", oddsSource: "The Odds API", providerOddId: null, oddsObservedAt: observed, oddsUpdatedAt: observed, providerEventId: "provider-id", providerMarketKey: "h2h", estimatedProbability: .7, probabilityBasis: "market-implied", overround: .04 }], warnings: [] }; };
  storage.cacheJson = async (key, value) => { records.set(key, value); };
  storage.cachedJson = async key => records.get(key) ?? null;
  storage.saveTicket = async (_browserId, value) => { persisted = value; return { ticket: { ...value, id: "00000000-0000-4000-8000-000000000002", createdAt: observed, fingerprint: "a".repeat(64) }, duplicate: false }; };
  const browserId = "00000000-0000-4000-8000-000000000001";
  try {
    const proposal = await generator.generateFootballTicket(browserId, settings);
    assert.equal(proposal.selections.length, 1);
    assert.equal(proposal.potentialReturnZar, 14);
    const { POST } = require("../../app/api/football/tickets/route.ts");
    const response = await POST(new Request("https://offline.invalid/api/football/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ browserId, proposalId: proposal.proposalId, stakeZar: 20, selectedFixtureIds: [fixture.id], combinedOdds: 999, selections: [{ decimalOdds: 999 }] }) }));
    assert.equal(response.status, 201);
    assert.equal(persisted.combinedOdds, 1.4);
    assert.equal(persisted.potentialReturnZar, 28);
    assert.equal(persisted.selections[0].decimalOdds, 1.4);
    await assert.rejects(() => generator.saveGeneratedFootballTicket(browserId, proposal.proposalId, [999]), /only legs/);
    await assert.rejects(() => generator.saveGeneratedFootballTicket("00000000-0000-4000-8000-000000000003", proposal.proposalId), /expired/);
    const expired = { ...proposal, expiresAt: "2020-01-01T00:00:00Z" }; records.set(`football-ticket-proposal:${browserId}:${proposal.proposalId}`, expired);
    await assert.rejects(() => generator.saveGeneratedFootballTicket(browserId, proposal.proposalId), /expired/);
    fixtures.getFixturesInRange = async () => [];
    const empty = await generator.generateFootballTicket(browserId, settings);
    assert.equal(empty.message, "No suitable ticket available for these dates and settings.");
    assert.equal(empty.proposalId, null);
    assert.equal(oddsCalls, 1);
  } finally { fixtures.getFixturesInRange = original.fixtures; odds.getPricedCandidates = original.odds; storage.cacheJson = original.cache; storage.cachedJson = original.cached; storage.saveTicket = original.save; }
});

test("the free odds adapter caches snapshots and conservatively reserves market credits", async () => {
  const oldKey = process.env.ODDS_API_KEY, oldFetch = global.fetch;
  process.env.ODDS_API_KEY = "offline-test-odds-key";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "offline-test-redis";
  const cache = new Map(), costs = [], paths = [];
  const { fixture, event, settings } = require("./ticket-generator.test.ts");
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.example") {
      const args = JSON.parse(init.body);
      if (args[0] === "GET") return Response.json({ result: cache.get(args[1]) ?? null });
      if (args[0] === "SET") { cache.set(args[1], args[2]); return Response.json({ result: "OK" }); }
      if (args[0] === "EVAL") { costs.push(args.at(-1)); return Response.json({ result: 1 }); }
      throw new Error("Unexpected Redis call.");
    }
    assert.equal(url.origin, "https://api.the-odds-api.com");
    assert.equal(url.searchParams.get("apiKey"), "offline-test-odds-key");
    paths.push(url.pathname);
    if (url.pathname === "/v4/sports") return Response.json([{ key: "soccer_epl", active: true }]);
    assert.equal(url.searchParams.get("oddsFormat"), "decimal");
    assert.equal(url.searchParams.get("regions"), "uk");
    const row = event(); row.bookmakers[0].last_update = new Date().toISOString();
    return Response.json([row], { headers: { "x-requests-remaining": "499" } });
  };
  try {
    const { getPricedCandidates } = require("./odds-provider.ts");
    assert.equal((await getPricedCandidates([fixture], settings.dates, ["h2h"])).candidates.length, 3);
    assert.equal((await getPricedCandidates([fixture], settings.dates, ["h2h"])).candidates.length, 3);
    assert.deepEqual(paths, ["/v4/sports", "/v4/sports/soccer_epl/odds"]);
    assert.deepEqual(costs, [0, 1]);
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.ODDS_API_KEY; else process.env.ODDS_API_KEY = oldKey; }
});

test("Telegram delivery is explicit, owner-linked, throttled and never reports a failed send as success", async () => {
  const storage = require("./storage.ts"), api = require("../telegram/api.ts");
  const original = { tickets: storage.getTickets, chat: storage.getLinkedTelegramChatId, claim: storage.claimTicketShare, send: api.sendTelegramMessage };
  const ticket = { id: "00000000-0000-4000-8000-000000000002", createdAt: new Date().toISOString(), stakeZar: 10, combinedOdds: 1.4, potentialReturnZar: 14, potentialProfitZar: 4, selections: [{ fixtureId: 1_000_000_123, homeTeam: "Home", awayTeam: "Away", kickoff: "2099-01-01T12:00:00Z", market: "Full-time result", selection: "Home", decimalOdds: 1.4, bookmaker: "Book A", oddsSource: "The Odds API", oddsObservedAt: new Date().toISOString() }] };
  const sent = [];
  storage.getTickets = async () => [ticket]; storage.getLinkedTelegramChatId = async () => null; storage.claimTicketShare = async () => true;
  api.sendTelegramMessage = async (id, body) => { sent.push({ id, body }); };
  try {
    const { sendSavedTicketToTelegram } = require("./ticket-share.ts");
    const browser = "00000000-0000-4000-8000-000000000001";
    await assert.rejects(() => sendSavedTicketToTelegram(browser, ticket.id), /one-time Telegram link/);
    assert.equal(sent.length, 0);
    storage.getLinkedTelegramChatId = async () => 10001;
    await sendSavedTicketToTelegram(browser, ticket.id);
    assert.equal(sent[0].id, 10001);
    assert.match(sent[0].body, /The Odds API · Book A/);
    assert.match(sent[0].body, /Potential total return R14.00/);
    storage.claimTicketShare = async () => false;
    await assert.rejects(() => sendSavedTicketToTelegram(browser, ticket.id), /one minute/);
    api.sendTelegramMessage = async () => { throw new Error("Delivery failed"); }; storage.claimTicketShare = async () => true;
    await assert.rejects(() => sendSavedTicketToTelegram(browser, ticket.id), /Delivery failed/);
  } finally { storage.getTickets = original.tickets; storage.getLinkedTelegramChatId = original.chat; storage.claimTicketShare = original.claim; api.sendTelegramMessage = original.send; }
});

test("reverse Telegram links check the original owner and preserve atomic one-time consumption", async () => {
  const before = global.fetch, browser = "00000000-0000-4000-8000-000000000001";
  let forward = browser, consumed;
  global.fetch = async (_input, init) => {
    const args = JSON.parse(init.body);
    if (args[0] === "HGET") return Response.json({ result: "10001" });
    if (args[0] === "GET") return Response.json({ result: forward });
    if (args[0] === "EVAL") { consumed = args; return Response.json({ result: 1 }); }
    throw new Error("Unexpected link request.");
  };
  try {
    const { getLinkedTelegramChatId, consumeTelegramLink } = require("./storage.ts");
    assert.equal(await getLinkedTelegramChatId(browser), 10001);
    forward = "00000000-0000-4000-8000-000000000003";
    assert.equal(await getLinkedTelegramChatId(browser), null);
    assert.equal(await consumeTelegramLink("abcdef0123456789", 10001), true);
    assert.equal(consumed[2], 3);
    assert.match(consumed[1], /redis.call\('DEL'/);
  } finally { global.fetch = before; }
});

test("the default Football page renders the ticket flow and leaves analytics unmounted", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { FootballTicketWorkspace } = require("../../components/football-ticket-workspace.tsx");
  const html = renderToStaticMarkup(React.createElement(FootballTicketWorkspace));
  assert.equal((html.match(/type="date"/g) ?? []).length, 2);
  for (const label of ["Generate Ticket", "Stake (ZAR)", "Conservative", "Balanced", "High Risk", "Ticket History", "Choose leagues"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Multiclass Brier score"));
  assert.ok(!html.includes("No suitable ticket available")); // No fake result before generation.
});

 test("ticket batches fetch once, return only complete disjoint tickets and preserve server quotes", async () => {
  const generator = require("./ticket-generator.ts"), fixtures = require("./football-data.ts"), odds = require("./odds-provider.ts"), storage = require("./storage.ts");
  const { fixture, settings } = require("./ticket-generator.test.ts");
  const original = { fixtures: fixtures.getFixturesInRange, odds: odds.getPricedCandidates, cache: storage.cacheJson };
  let fixtureCalls = 0, oddsCalls = 0;
  const records = new Map(), observed = new Date().toISOString();
  fixtures.getFixturesInRange = async () => { fixtureCalls++; return [fixture]; };
  odds.getPricedCandidates = async () => { oddsCalls++; return { warnings: [], candidates: Array.from({length: 9}, (_, i) => ({ fixtureId: fixture.id + i, kickoff: fixture.kickoff, homeTeam: "Offline home", awayTeam: "Offline away", competition: "Offline league", market: "Both teams to score", selection: "Yes", decimalOdds: 1.8, bookmaker: "Offline book", bookmakerKey: "offline", oddsSource: "The Odds API", providerOddId: null, providerEventId: "offline-" + i, providerMarketKey: "btts", oddsObservedAt: observed, oddsUpdatedAt: observed, estimatedProbability: .55, probabilityBasis: "market-implied", overround: .04 })) }; };
  storage.cacheJson = async (key, value) => { records.set(key, value); };
  try {
    const result = await generator.generateFootballTickets("00000000-0000-4000-8000-000000000001", { ...settings, matchesPerTicket: 4, ticketCount: 3, stakeZar: 20, targetPayoutZar: 158, strategy: "balanced", markets: ["btts"] });
    assert.equal(result.tickets.length, 2);
    assert.equal(fixtureCalls, 1); assert.equal(oddsCalls, 1);
    assert.equal(new Set(result.tickets.flatMap(t => t.selections.map(row => row.fixtureId))).size, 8);
    assert.ok(result.tickets.every(t => t.selections.length === 4 && t.riskLabel.includes("unassessed")));
    assert.equal(records.size, 2);
    assert.deepEqual([...records.values()].map(t => t.ticketNumber), [1, 2]);
  } finally { fixtures.getFixturesInRange = original.fixtures; odds.getPricedCandidates = original.odds; storage.cacheJson = original.cache; }
});
