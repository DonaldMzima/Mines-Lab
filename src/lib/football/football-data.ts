import { createHash } from "node:crypto";
import { cacheJson, cachedJson, reserveFootballDataRequest } from "./storage";
import { FootballProviderError, type FootballErrorCode } from "./errors";
import { dateOffset, periodRange, validateDateRange, type FootballDateRange } from "./dates";
import type { FootballCompetition, FootballFixture, FootballFixtureDetail, FootballFixtureProvider, FootballPeriod, FootballStatisticsResult } from "./types";

// Keep existing API-Football IDs intact. New-source IDs occupy a disjoint range
// and still fit the existing numeric route, ticket, callback and Redis contracts.
export const FOOTBALL_DATA_ID_OFFSET = 1_000_000_000;
export function footballDataId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0 || id >= FOOTBALL_DATA_ID_OFFSET) throw new FootballProviderError("Invalid football-data.org ID.", 502);
  return FOOTBALL_DATA_ID_OFFSET + id;
}
export function isFootballDataId(id: number): boolean { return Number.isSafeInteger(id) && id > FOOTBALL_DATA_ID_OFFSET && id < 2 * FOOTBALL_DATA_ID_OFFSET; }
function rawId(id: number): number {
  if (!isFootballDataId(id)) throw new FootballProviderError("Invalid fixture source ID.", 400, false, "invalid_request");
  return id - FOOTBALL_DATA_ID_OFFSET;
}

// Configuration metadata, not invented match records. Availability is confirmed
// against the provider competition response when a token is configured.
export const FREE_COMPETITIONS = [
  [2021, "PL", "Premier League", "England"], [2014, "PD", "La Liga", "Spain"],
  [2019, "SA", "Serie A", "Italy"], [2002, "BL1", "Bundesliga", "Germany"],
  [2015, "FL1", "Ligue 1", "France"], [2001, "CL", "Champions League", "Europe"],
  [2003, "DED", "Eredivisie", "Netherlands"], [2017, "PPL", "Primeira Liga", "Portugal"],
  [2016, "ELC", "Championship", "England"], [2013, "BSA", "Brazil Serie A", "Brazil"],
  [2000, "WC", "World Cup", "World"], [2018, "EC", "European Championship", "Europe"],
] as const;
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function token(): string {
  const value = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!value || /\s/.test(value) || value.length > 512) throw new FootballProviderError("Configure the free football-data.org token as FOOTBALL_DATA_API_TOKEN on the server to load current fixtures.", 503, false, "configuration_required");
  return value;
}

interface CachedFailure { message: string; status: number; code: FootballErrorCode }
async function get(path: string, params: Record<string, string> = {}, ttl = 900): Promise<Record<string, unknown>> {
  const key = token();
  const account = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const url = new URL(`https://api.football-data.org/v4${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const cacheKey = `football-data:${account}:${url.pathname}:${url.search}`;
  const cached = await cachedJson<Record<string, unknown>>(cacheKey);
  if (cached !== null) return cached;
  const failure = await cachedJson<CachedFailure>(`football-data:${account}:cooldown`) ?? await cachedJson<CachedFailure>(`${cacheKey}:failure`);
  if (failure) throw new FootballProviderError(failure.message, failure.status, false, failure.code);
  if (!await reserveFootballDataRequest()) throw new FootballProviderError("football-data.org minute quota reached. Cached fixtures remain available; retry next minute.", 429, false, "rate_limited");
  let response: Response;
  try { response = await fetch(url, { headers: { "X-Auth-Token": key }, cache: "no-store", signal: AbortSignal.timeout(12_000) }); }
  catch { throw new FootballProviderError("football-data.org is temporarily unavailable. Retry later.", 502); }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const invalidToken = response.status === 401 || isRecord(body) && typeof body.message === "string" && /(?:token|api.?key).*(?:invalid|expired|not valid)|invalid.*(?:token|api.?key)/i.test(body.message);
    const error: CachedFailure = invalidToken
      ? { message: "football-data.org rejected the API token. Check FOOTBALL_DATA_API_TOKEN.", status: 401, code: "invalid_api_key" }
      : response.status === 403
        ? { message: "football-data.org denied access. Check that the free token is active and this competition is included in its plan.", status: 403, code: "competition_unavailable" }
        : response.status === 429
          ? { message: "football-data.org rate limit reached. Retry after the provider cooldown.", status: 429, code: "rate_limited" }
          : { message: `football-data.org is temporarily unavailable (HTTP ${response.status}).`, status: 502, code: "provider_unavailable" };
    // Cache failures separately from successful empty responses; never call them
    // “no matches”, and avoid repeatedly spending quota on known failures.
    const retry = Number(response.headers.get("retry-after"));
    const failureKey = invalidToken || response.status === 429 ? `football-data:${account}:cooldown` : `${cacheKey}:failure`;
    await cacheJson(failureKey, error, response.status === 429 ? Math.min(3600, Math.max(60, retry || 60)) : 300);
    throw new FootballProviderError(error.message, error.status, false, error.code);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new FootballProviderError("football-data.org returned invalid JSON.", 502); }
  if (!isRecord(payload) || "errorCode" in payload) throw new FootballProviderError("football-data.org returned an invalid response.", 502);
  await cacheJson(cacheKey, payload, ttl);
  return payload;
}

export async function getCurrentCompetitions(): Promise<FootballCompetition[]> {
  const data = await get("/competitions", {}, 86_400);
  if (!Array.isArray(data.competitions)) throw new FootballProviderError("football-data.org returned an invalid competition list.", 502);
  const competitionRows = data.competitions;
  return FREE_COMPETITIONS.map(([id, code, name, country]): FootballCompetition => {
    const row = competitionRows.find((value: unknown) => isRecord(value) && value.id === id && value.code === code && value.plan === "TIER_ONE");
    const season = isRecord(row) && isRecord(row.currentSeason) && typeof row.currentSeason.startDate === "string" ? Number(row.currentSeason.startDate.slice(0, 4)) : 0;
    return { id: footballDataId(id), code, name, country, season, source: "football-data.org", available: Boolean(row) && Number.isSafeInteger(season) && season > 0, ...(!row || !season ? { unavailableReason: "Not returned as an available free-tier competition by this account." } : {}) };
  });
}

export function parseFootballDataFixture(value: unknown): FootballFixture {
  if (!isRecord(value) || !isRecord(value.competition) || !isRecord(value.homeTeam) || !isRecord(value.awayTeam) || !isRecord(value.score) || !isRecord(value.score.fullTime) || !isRecord(value.season)) throw new FootballProviderError("football-data.org returned a malformed fixture.", 502);
  const { competition, homeTeam, awayTeam, score, season } = value;
  if (typeof value.id !== "number" || typeof competition.id !== "number" || typeof competition.name !== "string" || typeof homeTeam.name !== "string" || !homeTeam.name.trim() || typeof awayTeam.name !== "string" || !awayTeam.name.trim() || typeof value.utcDate !== "string" || !Number.isFinite(Date.parse(value.utcDate)) || typeof value.status !== "string" || typeof season.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(season.startDate)) throw new FootballProviderError("Fixture teams, kickoff, competition or season are not available from football-data.org.", 502);
  const fullTime = score.fullTime as Record<string, unknown>;
  const scoreValue = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const completed = ["FINISHED", "AWARDED"].includes(value.status);
  return {
    id: footballDataId(value.id), source: "football-data.org",
    competition: { id: footballDataId(competition.id), name: competition.name, code: typeof competition.code === "string" ? competition.code : null, country: isRecord(value.area) && typeof value.area.name === "string" ? value.area.name : null, season: Number(season.startDate.slice(0, 4)), source: "football-data.org" },
    homeTeam: homeTeam.name, awayTeam: awayTeam.name, kickoff: new Date(value.utcDate).toISOString(),
    homeTeamAliases: [homeTeam.name, homeTeam.shortName].filter((name): name is string => typeof name === "string" && Boolean(name.trim())),
    awayTeamAliases: [awayTeam.name, awayTeam.shortName].filter((name): name is string => typeof name === "string" && Boolean(name.trim())),
    state: value.status.replaceAll("_", " "), stateCode: value.status,
    homeScore: completed ? scoreValue(fullTime.home) : null, awayScore: completed ? scoreValue(fullTime.away) : null,
    predictable: false, isUpcoming: ["TIMED", "SCHEDULED"].includes(value.status) && Date.parse(value.utcDate) > Date.now(),
    isCompleted: completed && scoreValue(fullTime.home) !== null && scoreValue(fullTime.away) !== null,
  };
}

export async function getCurrentFixtures(period: FootballPeriod, competitionIds: number[]): Promise<FootballFixture[]> {
  return getFixturesWindow(periodRange(period), competitionIds);
}

async function getFixturesWindow(range: FootballDateRange, competitionIds: number[]): Promise<FootballFixture[]> {
  if (!competitionIds.length) return [];
  const available = await getCurrentCompetitions();
  if (competitionIds.some(id => !available.some(row => row.id === id && row.available))) throw new FootballProviderError("A selected competition is not supported by the configured free fixture source.", 403, false, "competition_unavailable");
  const { start, end } = range;
  const from = Date.parse(`${start}T00:00:00+02:00`), until = Date.parse(`${dateOffset(end, 1)}T00:00:00+02:00`);
  // dateTo is exclusive in v4. Include the UTC day spanning SAST midnight,
  // then filter precisely in SAST so “Today” does not lose evening matches.
  const data = await get("/matches", { competitions: [...new Set(competitionIds)].map(rawId).sort((a, b) => a - b).join(","), dateFrom: new Date(from).toISOString().slice(0, 10), dateTo: dateOffset(end, 1) });
  if (!Array.isArray(data.matches)) throw new FootballProviderError("football-data.org returned an invalid fixture list.", 502);
  const fixtures = data.matches.map(parseFootballDataFixture);
  if (fixtures.some(fixture => !competitionIds.includes(fixture.competition.id))) throw new FootballProviderError("football-data.org returned a fixture outside the selected competitions.", 502);
  const selected = fixtures.filter(fixture => Date.parse(fixture.kickoff) >= from && Date.parse(fixture.kickoff) < until).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  await Promise.all(selected.map(fixture => cacheJson(`football-data:fixture:${fixture.id}`, fixture, 900)));
  return selected;
}

/** Split long calendars into permitted v4 windows, retaining the original dates. */
export async function getFixturesInRange(input: unknown, competitionIds: number[]): Promise<FootballFixture[]> {
  const range = validateDateRange(input);
  const fixtures = new Map<number, FootballFixture>();
  for (let start = range.start; start <= range.end; start = dateOffset(start, 9)) {
    const end = dateOffset(start, 8) < range.end ? dateOffset(start, 8) : range.end;
    for (const fixture of await getFixturesWindow({ start, end }, competitionIds)) fixtures.set(fixture.id, fixture);
  }
  return [...fixtures.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

export async function getCurrentFixtureDetail(id: number): Promise<FootballFixtureDetail> {
  const nativeId = rawId(id);
  const cached = await cachedJson<FootballFixture>(`football-data:fixture:${id}`);
  const fixture = cached ?? parseFootballDataFixture(await get(`/matches/${nativeId}`));
  if (fixture.id !== id || !FREE_COMPETITIONS.some(([competitionId]) => footballDataId(competitionId) === fixture.competition.id)) throw new FootballProviderError("Fixture source identity or free competition is invalid.", 502);
  return { fixture: { ...fixture, isUpcoming: fixture.isUpcoming && Date.parse(fixture.kickoff) > Date.now() }, markets: [], primaryOutcome: null, model: { name: "football-data.org", version: "v4-free", status: "unavailable", generatedAt: null, summary: "Fixtures and delayed results are available. This free source does not supply prediction probabilities or bookmaker odds. Manual ticket choices are not predictions." } };
}
export async function getCurrentFixtureStatistics(id: number): Promise<FootballStatisticsResult> {
  rawId(id);
  return { fixtureId: id, available: false, teams: [], updatedAt: null, message: "Detailed match statistics are not included in the football-data.org free plan." };
}
export const footballDataProvider: FootballFixtureProvider = { source: "football-data.org", competitions: getCurrentCompetitions, fixtures: getCurrentFixtures, detail: getCurrentFixtureDetail, statistics: getCurrentFixtureStatistics };
