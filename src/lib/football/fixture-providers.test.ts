import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { footballDataId, getCurrentCompetitions, getCurrentFixtures, getCurrentFixtureDetail, getCurrentFixtureStatistics, getFixturesInRange, parseFootballDataFixture } from "./football-data";
import { getFootballCompetitions, listFootballFixtures } from "./service";
import { assertHistoricalSeason, getHistoricalFootballFixtures, parseApiFootballEnvelope } from "./provider";
import { dateOffset, periodRange, timezoneDate } from "./dates";
import { FootballProviderError } from "./errors";
import { footballErrorResponse } from "./http";
import { FootballStorageError } from "./storage";

const names = ["FOOTBALL_DATA_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "API_FOOTBALL_FREE_SEASONS"] as const;
let saved: (string | undefined)[];
let originalFetch: typeof fetch;
let cache: Map<string, string>;
let providerCalls: URL[];
let reservations: number;
let providerResponse: (url: URL) => Response;
const competition = { id: 2021, code: "PL", name: "Premier League", plan: "TIER_ONE", currentSeason: { startDate: "2026-08-01" } };
const match = (id = 123, utcDate = "2099-01-01T12:00:00Z") => ({ id, utcDate, status: "TIMED", competition: { id: 2021, name: "Premier League", code: "PL" }, season: { startDate: "2098-08-01" }, area: { name: "England" }, homeTeam: { name: "Home FC" }, awayTeam: { name: "Away FC" }, score: { fullTime: { home: null, away: null } } });

beforeEach(() => {
  saved = names.map(name => process.env[name]); originalFetch = globalThis.fetch;
  process.env.FOOTBALL_DATA_API_TOKEN = "offline-free-token";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "offline-redis-token";
  process.env.API_FOOTBALL_FREE_SEASONS = "2022,2023,2024";
  cache = new Map(); providerCalls = []; reservations = 0;
  providerResponse = url => url.pathname.endsWith("/competitions") ? Response.json({ competitions: [competition] }) : Response.json({ matches: [] });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "redis.example") {
      const command = JSON.parse(String(init?.body));
      if (command[0] === "GET") return Response.json({ result: cache.get(command[1]) ?? null });
      if (command[0] === "SET") { cache.set(command[1], command[2]); return Response.json({ result: "OK" }); }
      if (command[0] === "EVAL") { reservations++; return Response.json({ result: reservations <= 8 ? 1 : 0 }); }
      throw new Error("Unexpected Redis command.");
    }
    assert.equal(url.origin, "https://api.football-data.org");
    assert.equal(new Headers(init?.headers).get("X-Auth-Token"), "offline-free-token");
    providerCalls.push(url);
    return providerResponse(url);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
});

test("new-source IDs cannot collide with existing API-Football fixtures or competitions", () => {
  const fixture = parseFootballDataFixture(match());
  assert.equal(fixture.id, 1_000_000_123);
  assert.equal(fixture.competition.id, 1_000_002_021);
  assert.equal(fixture.source, "football-data.org");
  assert.equal(fixture.predictable, false);
  assert.equal(fixture.homeScore, null);
  assert.throws(() => footballDataId(0));
  assert.throws(() => parseFootballDataFixture({ ...match(), homeTeam: { name: null } }));
});

test("only documented and account-returned free competitions are enabled; no unrelated league is selected", async () => {
  const result = await getFootballCompetitions();
  assert.deepEqual(result.competitions.filter(item => item.available).map(item => item.code), ["PL"]);
  assert.equal(result.competitions.find(item => item.name === "South African Premiership")?.available, false);
  assert.equal(result.competitions.some(item => item.name.includes("Malta")), false);
  await getCurrentCompetitions();
  assert.equal(providerCalls.length, 1);
  assert.equal(reservations, 1);
});

test("missing fixture token gives an explicit configuration state, without calling API-Football", async () => {
  delete process.env.FOOTBALL_DATA_API_TOKEN;
  const result = await getFootballCompetitions();
  assert.match(result.message ?? "", /FOOTBALL_DATA_API_TOKEN/);
  assert.equal(result.competitions.every(item => item.available === false), true);
  await assert.rejects(() => getCurrentFixtures("today", [footballDataId(2021)]), { code: "configuration_required" });
  assert.equal(providerCalls.length, 0);
});

test("bulk league requests use exclusive UTC dates and preserve the SAST midnight boundary", async () => {
  const { start } = periodRange("today");
  const atMidnight = new Date(`${start}T00:00:00+02:00`).toISOString();
  const before = new Date(Date.parse(atMidnight) - 1).toISOString();
  providerResponse = url => url.pathname.endsWith("/competitions") ? Response.json({ competitions: [competition] }) : Response.json({ matches: [match(1, atMidnight), match(2, before)] });
  const output = await getCurrentFixtures("today", [footballDataId(2021)]);
  assert.deepEqual(output.map(item => item.id), [footballDataId(1)]);
  const request = providerCalls.find(url => url.pathname.endsWith("/matches"));
  assert.equal(request?.searchParams.get("competitions"), "2021");
  assert.equal(request?.searchParams.get("dateFrom"), atMidnight.slice(0, 10));
  assert.equal(request?.searchParams.has("season"), false);
  await getCurrentFixtures("today", [footballDataId(2021)]);
  assert.equal(providerCalls.length, 2);
});

test("source failures are never interpreted as empty fixture results and respect cooldown", async () => {
  await getCurrentCompetitions();
  providerResponse = () => Response.json({ message: "Minute limit reached" }, { status: 429, headers: { "Retry-After": "60" } });
  await assert.rejects(() => getCurrentFixtures("today", [footballDataId(2021)]), { code: "rate_limited" });
  await assert.rejects(() => getCurrentFixtures("today", [footballDataId(2021)]), { code: "rate_limited" });
  assert.equal(providerCalls.length, 2);
});

test("multiple selected leagues are fetched together without silently adding competitions", async () => {
  const { start } = periodRange("next7");
  const kickoff = new Date(`${start}T12:00:00+02:00`).toISOString();
  const champions = { ...competition, id: 2001, code: "CL", name: "Champions League" };
  providerResponse = url => url.pathname.endsWith("/competitions")
    ? Response.json({ competitions: [competition, champions] })
    : Response.json({ matches: [match(1, kickoff), { ...match(2, kickoff), competition: { id: 2001, code: "CL", name: "Champions League" } }] });
  const rows = await getCurrentFixtures("next7", [footballDataId(2021), footballDataId(2001)]);
  assert.deepEqual(rows.map(row => row.competition.code).sort(), ["CL", "PL"]);
  assert.equal(providerCalls.filter(url => url.pathname.endsWith("/matches")).length, 1);
  assert.equal(providerCalls.at(-1)?.searchParams.get("competitions"), "2001,2021");
  await assert.rejects(() => getCurrentFixtures("next7", [288]), { code: "competition_unavailable" });
});

test("invalid token, season restriction, daily quota and Redis failure have distinct error codes", async () => {
  providerResponse = () => Response.json({ message: "Your API key is invalid" }, { status: 400 });
  await assert.rejects(() => getCurrentCompetitions(), { code: "invalid_api_key" });
  assert.throws(() => parseApiFootballEnvelope({ response: [], results: 0, errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." } }), { code: "season_restricted" });
  assert.throws(() => parseApiFootballEnvelope({ response: [], results: 0, errors: { requests: "Daily request limit reached" } }), { code: "quota_exhausted" });
  const response = footballErrorResponse(new FootballStorageError("Redis unavailable."));
  assert.equal((await response.json()).code, "redis_unavailable");
  assert.equal(footballErrorResponse(new FootballProviderError("Temporary", 502)).status, 502);
});

test("unsupported archive seasons fail before any network request and never replace current fixtures", async () => {
  assert.throws(() => assertHistoricalSeason(2026), { code: "season_restricted" });
  await assert.rejects(() => getHistoricalFootballFixtures(39, 2026, "2026-01-01", "2026-01-07"), { code: "season_restricted" });
  assert.equal(providerCalls.length, 0);
  const output = await listFootballFixtures("today", []);
  assert.deepEqual(output.fixtures, []);
  assert.equal(providerCalls.length, 0);
});

test("fixture detail remains usable without invented analysis, odds or paid statistics", async () => {
  providerResponse = () => Response.json(match());
  const detail = await getCurrentFixtureDetail(footballDataId(123));
  assert.equal(detail.fixture.source, "football-data.org");
  assert.equal(detail.primaryOutcome, null);
  assert.deepEqual(detail.markets, []);
  assert.match(detail.model.summary, /does not supply/);
  const stats = await getCurrentFixtureStatistics(detail.fixture.id);
  assert.equal(stats.available, false);
  assert.deepEqual(stats.teams, []);
  assert.equal(providerCalls.length, 1);
});

test("shared free-source quota stops uncached calls and Redis failures never become empty lists", async () => {
  providerResponse = url => Response.json(match(Number(url.pathname.split("/").at(-1))));
  for (let id = 1; id <= 8; id++) await getCurrentFixtureDetail(footballDataId(id));
  await assert.rejects(() => getCurrentFixtureDetail(footballDataId(9)), { code: "rate_limited" });
  assert.equal(providerCalls.length, 8);
  globalThis.fetch = async () => { throw new Error("Redis offline."); };
  await assert.rejects(() => listFootballFixtures("today", [footballDataId(2021)]), FootballStorageError);
});

test("custom next-month calendars use bounded source windows without gaps or a seven-day cutoff", async () => {
  const start = timezoneDate(new Date());
  const nextMonth = new Date(`${start.slice(0, 7)}-01T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1); nextMonth.setUTCDate(5);
  const end = timezoneDate(nextMonth);
  const windows: { from: string; to: string }[] = [];
  providerResponse = url => {
    if (url.pathname.endsWith("/competitions")) return Response.json({ competitions: [competition] });
    const from = url.searchParams.get("dateFrom")!, to = url.searchParams.get("dateTo")!;
    windows.push({ from, to });
    const scheduled = `${dateOffset(from, 1)}T12:00:00+02:00`;
    return Response.json({ matches: [match(windows.length, scheduled)] });
  };
  const rows = await getFixturesInRange({ start, end }, [footballDataId(2021)]);
  assert.ok(rows.length >= 1);
  assert.ok(windows.every(window => Date.parse(window.to) - Date.parse(window.from) <= 10 * 86_400_000));
  for (let i = 1; i < windows.length; i++) assert.equal(dateOffset(windows[i - 1].to, -1), windows[i].from);
  assert.equal(windows.at(-1)?.to, dateOffset(end, 1));
});

test("a failed later calendar window is an error, never a successful partial/empty result", async () => {
  const start = timezoneDate(new Date());
  let windows = 0;
  providerResponse = url => {
    if (url.pathname.endsWith("/competitions")) return Response.json({ competitions: [competition] });
    windows++;
    return windows === 1 ? Response.json({ matches: [] }) : Response.json({ message: "Temporary outage" }, { status: 503 });
  };
  await assert.rejects(() => getFixturesInRange({ start, end: dateOffset(start, 15) }, [footballDataId(2021)]), { code: "provider_unavailable" });
  assert.equal(windows, 2);
});
