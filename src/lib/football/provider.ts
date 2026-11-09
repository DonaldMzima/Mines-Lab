import { periodRange } from "./dates";
import { API_FOOTBALL_DAILY_REQUEST_LIMIT, cacheJson, cachedJson, reserveApiFootballRequest, saveForecast, updateForecastResult } from "./storage";
import { validateProviderForecast } from "./analysis";
import type { FootballCompetition, FootballFixture, FootballFixtureDetail, FootballMarket, FootballPeriod, FootballStatisticsResult, FootballTeamStatistic } from "./types";

const DEFAULT_API_ROOT = "https://v3.football.api-sports.io";
const PROVIDER_VERSION = "api-football-v3";
const CACHE_PREFIX = "api-football:";

/** The account's reported free seasons, configurable when its entitlement changes. */
export function assertHistoricalSeason(season: number): void {
  const allowed = (process.env.API_FOOTBALL_FREE_SEASONS ?? "2022,2023,2024").split(",").map(Number).filter(Number.isSafeInteger);
  if (!Number.isSafeInteger(season) || !allowed.includes(season)) throw new FootballProviderError(`API-Football free-plan season restriction. Permitted archive seasons: ${allowed.join(", ")}. Current fixtures are not replaced with archive matches.`, 403, true, "season_restricted");
}

export async function getHistoricalFootballFixtures(competitionId: number, season: number, from: string, to: string): Promise<FootballFixture[]> {
  assertHistoricalSeason(season);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!Number.isSafeInteger(competitionId) || competitionId <= 0 || competitionId >= 1_000_000_000 || !validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 31 * 86_400_000 || Date.parse(to) >= Date.now()) throw new FootballProviderError("Choose an explicit historical league, season and past date range of at most 31 days.", 400, false, "invalid_request");
  const payload = await providerGet("/fixtures", { league: String(competitionId), season: String(season), from, to, timezone: "Africa/Johannesburg" }, `history:${competitionId}:${season}:${from}:${to}`, 86_400);
  const fixtures = payload.response.map(parseApiFootballFixture);
  if (fixtures.some(fixture => fixture.competition.id !== competitionId || fixture.competition.season !== season)) throw new FootballProviderError("API-Football returned records outside the requested historical league or season.", 502);
  return fixtures;
}

import { FootballProviderError } from "./errors";
export { FootballProviderError } from "./errors";

interface ApiFootballEnvelope {
  response: unknown[];
  results: number;
  paging: { current: number; total: number } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function apiConfig(): { root: string; key: string } {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || key.length > 512 || /\s/.test(key)) {
    throw new FootballProviderError("Configure API_FOOTBALL_KEY on the server to load football data.", 503, false, "configuration_required");
  }
  const rawRoot = process.env.API_FOOTBALL_BASE_URL ?? DEFAULT_API_ROOT;
  let url: URL;
  try { url = new URL(rawRoot); } catch { throw new FootballProviderError("API_FOOTBALL_BASE_URL must be the API-Sports HTTPS origin.", 503); }
  if (url.protocol !== "https:" || !/(^|\.)api-sports\.io$/i.test(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new FootballProviderError("API_FOOTBALL_BASE_URL must be an API-Sports HTTPS origin without a path or credentials.", 503);
  }
  return { root: url.origin, key };
}

function responseErrors(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" && item ? item : "provider error");
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, detail]) => {
    if (detail === null || detail === "" || detail === false) return [];
    return [`${name}: ${typeof detail === "string" || typeof detail === "number" ? detail : "unavailable"}`];
  });
}

export function parseApiFootballEnvelope(value: unknown): ApiFootballEnvelope {
  if (!isRecord(value) || !Array.isArray(value.response) ||
      typeof value.results !== "number" || !Number.isSafeInteger(value.results) || value.results < 0 ||
      !("errors" in value) || (!Array.isArray(value.errors) && !isRecord(value.errors))) {
    throw new FootballProviderError("API-Football returned a malformed response envelope.", 502);
  }
  const errors = responseErrors(value.errors);
  const errorText = errors.join("; ");
  if (/free plans.*season|access to this season/i.test(errorText)) throw new FootballProviderError(`API-Football season restriction: ${errorText}. Current fixtures use football-data.org; historical seasons are never substituted.`, 403, true, "season_restricted");
  if (/api.?key|token|authentication/i.test(errorText)) throw new FootballProviderError("API-Football rejected the API key. Check API_FOOTBALL_KEY.", 401, false, "invalid_api_key");
  if (/daily|requests per day/i.test(errorText)) throw new FootballProviderError("API-Football daily quota exhausted. Cached data remains available; retry after 00:00 UTC.", 429, false, "quota_exhausted");
  if (errors.length > 0) {
    if (errors.some((error) => /rate.?limit|too many requests|daily request|requests per day/i.test(error))) {
      throw new FootballProviderError("API-Football rate limit was reached. Cached results remain available.", 429, false, "rate_limited");
    }
    throw new FootballProviderError(
      `API-Football data is unavailable: ${errors.slice(0, 2).join("; ")}.`,
      502,
      true,
    );
  }
  if (value.results !== value.response.length) {
    throw new FootballProviderError("API-Football response count did not match its results field.", 502);
  }
  let paging: ApiFootballEnvelope["paging"] = null;
  if (value.paging !== undefined) {
    if (!isRecord(value.paging) || !Number.isSafeInteger(value.paging.current) || !Number.isSafeInteger(value.paging.total) ||
        Number(value.paging.current) < 1 || Number(value.paging.total) < 0) {
      throw new FootballProviderError("API-Football returned malformed pagination details.", 502);
    }
    paging = { current: Number(value.paging.current), total: Number(value.paging.total) };
  }
  return { response: value.response, results: value.results, paging };
}

async function providerGet(path: string, params: Record<string, string>, cacheKey: string, ttlSeconds: number): Promise<ApiFootballEnvelope> {
  if (params.season) assertHistoricalSeason(Number(params.season));
  const restricted = await cachedJson<{ message: string }>(CACHE_PREFIX + `restricted:${path}:${params.season ?? params.id ?? params.fixture ?? "unknown"}`);
  if (restricted) throw new FootballProviderError(restricted.message, 403, true, "season_restricted");
  const cached = await cachedJson<unknown>(CACHE_PREFIX + cacheKey);
  if (cached !== null) return parseApiFootballEnvelope(cached);

  const config = apiConfig();
  const quota = await reserveApiFootballRequest();
  if (!quota.allowed) {
    throw new FootballProviderError(`The local API-Football request budget reached ${API_FOOTBALL_DAILY_REQUEST_LIMIT} calls for today. Cached data remains available; try again after 00:00 UTC.`, 429, false, "quota_exhausted");
  }

  const url = new URL(path, `${config.root}/`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-apisports-key": config.key },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new FootballProviderError("API-Football could not be reached. Cached results remain available; retry later.", 502);
  }
  if (!response.ok) {
    if (response.status === 429) throw new FootballProviderError("API-Football rate limit reached. Cached results remain available; retry later.", 429);
    if (response.status === 401) throw new FootballProviderError("API-Football rejected the configured key.", 401, false, "invalid_api_key");
    if (response.status === 403) throw new FootballProviderError("API-Football denied access to this endpoint or plan.", 403, true, "competition_unavailable");
    throw new FootballProviderError(`API-Football request failed (HTTP ${response.status}).`, 502);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new FootballProviderError("API-Football returned invalid JSON.", 502); }
  let envelope: ApiFootballEnvelope;
  try { envelope = parseApiFootballEnvelope(payload); }
  catch (error) {
    if (error instanceof FootballProviderError && error.code === "season_restricted") await cacheJson(CACHE_PREFIX + `restricted:${path}:${params.season ?? params.id ?? params.fixture ?? "unknown"}`, { message: error.message }, 86_400);
    throw error;
  }
  await cacheJson(CACHE_PREFIX + cacheKey, payload, ttlSeconds);
  return envelope;
}

function readName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseApiFootballCompetition(value: unknown): FootballCompetition | null {
  if (!isRecord(value) || !isRecord(value.league) ||
      (value.country !== null && !isRecord(value.country)) || !Array.isArray(value.seasons)) return null;
  const id = readPositiveInteger(value.league.id);
  const name = readName(value.league.name);
  if (!id || !name) return null;
  const season = value.seasons.find((entry) => isRecord(entry) && entry.current === true && readPositiveInteger(entry.year) !== null);
  if (!isRecord(season)) return null;
  return {
    id,
    name,
    country: isRecord(value.country) ? readName(value.country.name) : null,
    code: readName(value.league.code),
    season: Number(season.year),
  };
}

export async function getFootballCompetitions(): Promise<{ competitions: FootballCompetition[]; truncated: boolean }> {
  // /leagues supports current, but not page; the response contains the full list.
  const payload = await providerGet("/leagues", { current: "true" }, "leagues:current", 86_400);
  const competitions = payload.response.map(parseApiFootballCompetition).filter((entry): entry is FootballCompetition => entry !== null);
  return { competitions, truncated: false };
}

function fixtureIsCompleted(status: string): boolean {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(status.toUpperCase());
}

export function parseApiFootballFixture(value: unknown): FootballFixture {
  if (!isRecord(value) || !isRecord(value.fixture) || !isRecord(value.teams) ||
      !isRecord(value.teams.home) || !isRecord(value.teams.away) || !isRecord(value.league) ||
      !isRecord(value.fixture.status) || !isRecord(value.goals)) {
    throw new FootballProviderError("API-Football returned a malformed fixture.", 502);
  }
  const id = readPositiveInteger(value.fixture.id);
  const kickoff = typeof value.fixture.date === "string" ? value.fixture.date : "";
  const homeTeam = readName(value.teams.home.name);
  const awayTeam = readName(value.teams.away.name);
  const competitionId = readPositiveInteger(value.league.id);
  const competitionName = readName(value.league.name);
  const status = readName(value.fixture.status.short);
  const statusName = readName(value.fixture.status.long);
  if (!id || !Number.isFinite(Date.parse(kickoff)) || !homeTeam || !awayTeam || !competitionId || !competitionName || !status || !statusName) {
    throw new FootballProviderError("API-Football returned a fixture with missing or invalid identity, teams, kickoff, league, or status.", 502);
  }
  const isCompleted = fixtureIsCompleted(status);
  const kickoffDate = new Date(kickoff).toISOString();
  const homeScore = typeof value.goals.home === "number" && Number.isSafeInteger(value.goals.home) && value.goals.home >= 0 ? value.goals.home : null;
  const awayScore = typeof value.goals.away === "number" && Number.isSafeInteger(value.goals.away) && value.goals.away >= 0 ? value.goals.away : null;
  const currentSeason = readPositiveInteger(value.league.season);
  return {
    id,
    competition: { id: competitionId, name: competitionName, country: readName(value.league.country), code: readName(value.league.code), season: currentSeason ?? new Date(kickoffDate).getUTCFullYear() },
    homeTeam,
    awayTeam,
    kickoff: kickoffDate,
    state: statusName,
    stateCode: status,
    homeScore,
    awayScore,
    predictable: null,
    isUpcoming: ["NS", "TBD"].includes(status.toUpperCase()) && Date.parse(kickoffDate) > Date.now(),
    isCompleted: isCompleted && homeScore !== null && awayScore !== null,
    source: "API-Football",
  };
}

export function parseApiFootballPrediction(value: unknown): FootballMarket[] {
  if (!isRecord(value)) return [];
  const { predictions } = value;
  if (!isRecord(predictions) || !isRecord(predictions.percent)) return [];
  const { percent } = predictions;
  const entries = [
    ["Home", percent.home],
    ["Draw", percent.draw],
    ["Away", percent.away],
  ] as const;
  const outcomes = entries.map(([label, raw]) => {
    const parsed = typeof raw === "number" ? raw :
      typeof raw === "string" ? Number(raw.trim().replace(/%$/, "")) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? { label, probability: parsed } : null;
  });
  if (outcomes.some((outcome) => outcome === null)) return [];
  const complete = outcomes.filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null);
  if (complete.length !== 3) return [];
  const total = complete.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (Math.abs(total - 100) > 2) return [];
  return [{ key: "result", name: "Match outcome · API-Football prediction", outcomes: complete }];
}

function primaryOutcome(markets: FootballMarket[]): FootballFixtureDetail["primaryOutcome"] {
  const market = markets[0];
  if (!market || market.outcomes.length !== 3) return null;
  const highest = Math.max(...market.outcomes.map((item) => item.probability));
  const leaders = market.outcomes.filter((item) => item.probability === highest);
  if (leaders.length !== 1) return null;
  const outcome = leaders[0];
  if (!outcome) return null;
  return { marketKey: market.key, market: market.name, outcome: outcome.label, probability: outcome.probability };
}

export async function listFootballFixtures(
  period: FootballPeriod = "next7",
  competitionId?: number,
): Promise<{ fixtures: FootballFixture[]; period: FootballPeriod; updatedAt: string; truncated: boolean }> {
  if (competitionId !== undefined && (!Number.isSafeInteger(competitionId) || competitionId <= 0)) {
    throw new FootballProviderError("A valid competition ID is required.", 400);
  }
  const { start, end } = periodRange(period);
  const params: Record<string, string> = {
    from: start,
    to: end,
    timezone: "Africa/Johannesburg",
  };
  let competition: FootballCompetition | undefined;
  if (competitionId !== undefined) {
    const available = await getFootballCompetitions();
    competition = available.competitions.find((item) => item.id === competitionId);
    if (!competition) throw new FootballProviderError("That league is not available in the current API-Football plan.", 404);
    params.league = String(competition.id);
    params.season = String(competition.season);
  }
  // /fixtures also returns all matching fixtures without a page parameter.
  const payload = await providerGet(
    "/fixtures",
    params,
    `fixtures:${start}:${end}:${competitionId ?? "all"}`,
    3_600,
  );
  const fixtures = payload.response.map(parseApiFootballFixture);
  if (competition) {
    for (const fixture of fixtures) {
      if (fixture.competition.id !== competition.id) throw new FootballProviderError("API-Football returned a fixture outside the selected league.", 502);
    }
  }
  const completedAt = new Date().toISOString();
  for (const fixture of fixtures) {
    if (fixture.isCompleted && fixture.homeScore !== null && fixture.awayScore !== null) {
      await updateForecastResult(fixture.id, { home: fixture.homeScore, away: fixture.awayScore, completedAt });
    }
  }
  return { fixtures, period, updatedAt: completedAt, truncated: false };
}

function predictionRow(value: unknown, fixtureId: number): unknown | null {
  if (!isRecord(value) || !isRecord(value.fixture) || value.fixture.id !== fixtureId) return null;
  return value;
}

export async function getFootballFixtureDetail(fixtureId: number): Promise<FootballFixtureDetail> {
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) throw new FootballProviderError("A valid fixture ID is required.", 400);

  const cached = await cachedJson<FootballFixtureDetail>(CACHE_PREFIX + `detail:${fixtureId}`);
  if (cached && (cached.fixture.isCompleted || (cached.fixture.isUpcoming && Date.parse(cached.fixture.kickoff) > Date.now()))) return cached;

  const fixturePayload = await providerGet("/fixtures", { id: String(fixtureId) }, `fixture:${fixtureId}`, 1_800);
  if (fixturePayload.response.length === 0) throw new FootballProviderError("API-Football has no fixture for that ID.", 404);
  if (fixturePayload.response.length !== 1) throw new FootballProviderError("API-Football returned multiple fixtures for a single fixture ID.", 502);
  const fixture = parseApiFootballFixture(fixturePayload.response[0]);
  if (fixture.id !== fixtureId) throw new FootballProviderError("API-Football returned a different fixture ID.", 502);

  let markets: FootballMarket[] = [];
  let primary: FootballFixtureDetail["primaryOutcome"] = null;
  let modelSummary: string;
  let modelVersion = PROVIDER_VERSION;
  let generatedAt: string | null = null;

  if (!fixture.isUpcoming) {
    modelSummary = "API-Football predictions are only requested for upcoming fixtures.";
  } else {
    try {
      const predictionPayload = await providerGet("/predictions", { fixture: String(fixtureId) }, `predictions:${fixtureId}`, 21_600);
      const row = predictionPayload.response.map((item) => predictionRow(item, fixtureId)).find((item) => item !== null) ?? null;
      markets = row ? parseApiFootballPrediction(row) : [];
      primary = primaryOutcome(markets);
      if (!primary) {
        modelSummary = markets.length
          ? "API-Football returned tied top percentages, so there is no single supported outcome."
          : "Prediction percentages are unavailable or invalid for this fixture in the current API-Football coverage.";
      } else {
        try {
          const validation = validateProviderForecast({
            fixtureId,
            kickoff: fixture.kickoff,
            predictable: true,
            markets,
          }, new Date(), 2); // Retain the provider adapter's existing two-point rounding tolerance.
          modelVersion = `${PROVIDER_VERSION}+${validation.modelVersion}`;
          if (validation.status !== "validated" || !validation.primaryOutcome) {
            markets = [];
            primary = null;
            modelSummary = validation.message || "Local validation did not validate this provider forecast.";
          } else {
            markets = validation.markets;
            primary = validation.primaryOutcome;
            modelSummary = validation.message;
          }
        } catch (error) {
          markets = [];
          primary = null;
          modelSummary = `Prediction unavailable because local validation failed: ${error instanceof Error ? error.message : "validation error"}`;
        }
      }
      if (primary) {
        generatedAt = new Date().toISOString();
        await saveForecast(fixtureId, {
          fixtureId,
          kickoff: fixture.kickoff,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          competition: fixture.competition.name,
          generatedAt,
          provider: "API-Football",
          modelVersion,
          markets,
          primaryOutcome: primary,
        }, fixture.kickoff);
      }
    } catch (error) {
      if (error instanceof FootballProviderError && error.unavailableData) {
        markets = [];
        primary = null;
        modelSummary = "API-Football predictions are unavailable for this fixture or plan. No prediction is displayed.";
      } else {
        throw error;
      }
    }
  }

  const result: FootballFixtureDetail = {
    fixture: { ...fixture, predictable: primary !== null },
    markets,
    primaryOutcome: primary,
    model: {
      name: "API-Football predictions",
      version: modelVersion,
      status: primary ? "provider-model" : "unavailable",
      generatedAt,
      summary: modelSummary,
    },
  };
  if (fixture.isCompleted && fixture.homeScore !== null && fixture.awayScore !== null) {
    await updateForecastResult(fixture.id, { home: fixture.homeScore, away: fixture.awayScore, completedAt: new Date().toISOString() });
  }
  await cacheJson(CACHE_PREFIX + `detail:${fixtureId}`, result, 1_800);
  return result;
}

function parseStatistics(value: unknown): FootballTeamStatistic {
  if (!isRecord(value) || !isRecord(value.team) || !Array.isArray(value.statistics)) {
    throw new FootballProviderError("API-Football returned malformed fixture statistics.", 502);
  }
  const teamId = readPositiveInteger(value.team.id);
  const teamName = readName(value.team.name);
  if (!teamId || !teamName) throw new FootballProviderError("API-Football returned statistics without a valid team identity.", 502);
  const statistics = value.statistics.map((entry) => {
    if (!isRecord(entry) || !readName(entry.type)) throw new FootballProviderError("API-Football returned a malformed statistic.", 502);
    const raw = entry.value;
    if (raw !== null && typeof raw !== "string" && typeof raw !== "number") {
      throw new FootballProviderError("API-Football returned an unsupported statistic value.", 502);
    }
    if (typeof raw === "number" && !Number.isFinite(raw)) throw new FootballProviderError("API-Football returned a non-finite statistic.", 502);
    return { type: String(entry.type), value: raw };
  });
  return { teamId, teamName, statistics };
}

export async function getFootballFixtureStatistics(fixtureId: number): Promise<FootballStatisticsResult> {
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) throw new FootballProviderError("A valid fixture ID is required.", 400);
  const cacheKey = `statistics:${fixtureId}`;
  try {
    const payload = await providerGet("/fixtures/statistics", { fixture: String(fixtureId) }, cacheKey, 1_800);
    if (payload.response.length === 0) {
      return { fixtureId, available: false, teams: [], message: "Match statistics are not available for this fixture in the current API-Football plan.", updatedAt: new Date().toISOString() };
    }
    const teams = payload.response.map((item) => parseStatistics(item));
    if (teams.length > 2) throw new FootballProviderError("API-Football returned more than two teams for fixture statistics.", 502);
    return { fixtureId, available: teams.length > 0, teams, message: teams.length ? "Statistics supplied by API-Football." : "Match statistics are unavailable for this fixture.", updatedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof FootballProviderError && error.unavailableData) {
      return { fixtureId, available: false, teams: [], message: "Match statistics are unavailable for this fixture or API plan.", updatedAt: null };
    }
    throw error;
  }
}
