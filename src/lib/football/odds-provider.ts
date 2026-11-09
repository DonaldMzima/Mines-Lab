import { createHash } from "node:crypto";
import { cacheJson, cachedJson, reserveOddsCredits } from "./storage";
import { FootballProviderError } from "./errors";
import type { FootballFixture } from "./types";
import type { FootballDateRange } from "./dates";
import type { PricedSelection, TicketMarketKey } from "./ticket-generation-types";

const SPORT_KEYS: Record<string, string> = { PL: "soccer_epl", PD: "soccer_spain_la_liga", SA: "soccer_italy_serie_a", BL1: "soccer_germany_bundesliga", FL1: "soccer_france_ligue_one", CL: "soccer_uefa_champs_league", DED: "soccer_netherlands_eredivisie", PPL: "soccer_portugal_primeira_liga", ELC: "soccer_efl_champ", BSA: "soccer_brazil_campeonato", WC: "soccer_fifa_world_cup", EC: "soccer_uefa_european_championship" };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const normalize = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const validPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 1.01 && v <= 1000;
function configuration() {
  const key = process.env.ODDS_API_KEY;
  if (!key || key.length > 512 || /\s/.test(key)) throw new FootballProviderError("Configure a free The Odds API key as ODDS_API_KEY to generate priced tickets. Manual odds entry is still available in Advanced.", 503, false, "configuration_required");
  return { key, account: createHash("sha256").update(key).digest("hex").slice(0, 16) };
}
interface OddsSnapshot { data: unknown; retrievedAt: string }
async function oddsGet(path: string, params: Record<string, string>, cost: number): Promise<OddsSnapshot> {
  const { key, account } = configuration();
  const query = new URLSearchParams(params).toString();
  const cacheKey = `odds-api:${account}:${path}:${query}`;
  const cached = await cachedJson<OddsSnapshot>(cacheKey);
  if (cached) return cached;
  const cooldown = await cachedJson<{ message: string; status: number }>(`odds-api:${account}:cooldown`);
  if (cooldown) throw new FootballProviderError(cooldown.message, cooldown.status, false, cooldown.status === 401 ? "invalid_api_key" : "quota_exhausted");
  if (!await reserveOddsCredits(account, cost)) throw new FootballProviderError("The local odds credit or request budget is exhausted. Cached quotes remain available; retry later.", 429, false, "quota_exhausted");
  const url = new URL(`https://api.the-odds-api.com/v4${path}`);
  url.search = query;
  url.searchParams.set("apiKey", key);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) }); }
  catch { throw new FootballProviderError("The odds provider is temporarily unavailable. No ticket was fabricated.", 502); }
  if (!response.ok) {
    const message = response.status === 401 ? "The Odds API rejected ODDS_API_KEY or its free credits are exhausted. Check the provider account." : response.status === 429 ? "The Odds API quota or rate limit was reached." : `The odds provider could not supply this market (HTTP ${response.status}).`;
    if ([401, 429].includes(response.status)) await cacheJson(`odds-api:${account}:cooldown`, { message, status: response.status }, 300);
    throw new FootballProviderError(message, response.status === 401 ? 401 : response.status === 429 ? 429 : response.status === 422 ? 422 : 502, response.status === 422, response.status === 401 ? "invalid_api_key" : response.status === 429 ? "quota_exhausted" : response.status === 422 ? "competition_unavailable" : "provider_unavailable");
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new FootballProviderError("The odds provider returned invalid JSON.", 502); }
  const snapshot = { data, retrievedAt: new Date().toISOString() };
  await cacheJson(cacheKey, snapshot, path === "/sports" ? 3600 : 300);
  if (response.headers.get("x-requests-remaining") === "0") await cacheJson(`odds-api:${account}:cooldown`, { message: "The Odds API free credits are exhausted. Check the account reset date.", status: 429 }, 3600);
  return snapshot;
}

function matchingFixture(event: Record<string, unknown>, fixtures: FootballFixture[], sport: string): FootballFixture | null {
  if (event.sport_key !== sport || typeof event.home_team !== "string" || typeof event.away_team !== "string" || typeof event.commence_time !== "string" || !Number.isFinite(Date.parse(event.commence_time))) return null;
  if (!normalize(event.home_team) || !normalize(event.away_team)) return null;
  const matches = fixtures.filter(fixture => SPORT_KEYS[fixture.competition.code ?? ""] === sport &&
    [fixture.homeTeam, ...(fixture.homeTeamAliases ?? [])].some(name => normalize(name) === normalize(String(event.home_team))) &&
    [fixture.awayTeam, ...(fixture.awayTeamAliases ?? [])].some(name => normalize(name) === normalize(String(event.away_team))) &&
    Math.abs(Date.parse(fixture.kickoff) - Date.parse(String(event.commence_time))) <= 60_000);
  return matches.length === 1 ? matches[0] : null;
}

/** Complete, same-bookmaker distributions only. No price is derived or invented. */
export function parseOddsEvent(value: unknown, fixtures: FootballFixture[], sport: string, retrievedAt: string, selectedMarkets: TicketMarketKey[], now = new Date()): PricedSelection[] {
  if (!record(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) || !Array.isArray(value.bookmakers)) return [];
  const fixture = matchingFixture(value, fixtures, sport);
  if (!fixture?.isUpcoming || Date.parse(fixture.kickoff) <= now.getTime() + 5 * 60_000 || !Number.isFinite(Date.parse(retrievedAt)) || Date.parse(retrievedAt) > now.getTime() + 60_000 || now.getTime() - Date.parse(retrievedAt) > 15 * 60_000) return [];
  const selections: PricedSelection[] = [];
  for (const bookmaker of value.bookmakers) {
    if (!record(bookmaker) || typeof bookmaker.key !== "string" || typeof bookmaker.title !== "string" || !Array.isArray(bookmaker.markets)) continue;
    const h2h = bookmaker.markets.find((m: unknown) => record(m) && m.key === "h2h");
    const result = record(h2h) && Array.isArray(h2h.outcomes) ? h2h.outcomes : [];
    const side = (name: string) => normalize(name) === normalize(String(value.home_team)) ? "home" : normalize(name) === normalize(String(value.away_team)) ? "away" : name.toLowerCase() === "draw" ? "draw" : null;
    const resultOutcomes = result.filter((o: unknown) => record(o) && typeof o.name === "string" && validPrice(o.price) && side(o.name));
    const resultSum = resultOutcomes.reduce((sum: number, o: Record<string, unknown>) => sum + 1 / Number(o.price), 0);
    const resultUpdated = record(h2h) && typeof h2h.last_update === "string" ? h2h.last_update : typeof bookmaker.last_update === "string" ? bookmaker.last_update : "";
    const completeResult = resultOutcomes.length === 3 && new Set(resultOutcomes.map((o: Record<string, unknown>) => side(String(o.name)))).size === 3 && Number.isFinite(Date.parse(resultUpdated)) && now.getTime() - Date.parse(resultUpdated) <= 6 * 3_600_000 && Date.parse(resultUpdated) <= now.getTime() + 60_000;
    const resultProbability = (which: string) => completeResult ? (1 / Number(resultOutcomes.find((o: Record<string, unknown>) => side(String(o.name)) === which)?.price)) / resultSum : 0;
    for (const market of bookmaker.markets) {
      if (!record(market) || typeof market.key !== "string" || !selectedMarkets.includes(market.key as TicketMarketKey) || !Array.isArray(market.outcomes)) continue;
      const updatedAt = typeof market.last_update === "string" ? market.last_update : typeof bookmaker.last_update === "string" ? bookmaker.last_update : "";
      if (!Number.isFinite(Date.parse(updatedAt)) || now.getTime() - Date.parse(updatedAt) > 6 * 3_600_000 || Date.parse(updatedAt) > now.getTime() + 60_000) continue;
      const outcomes = market.outcomes.filter((o: unknown): o is Record<string, unknown> => record(o) && typeof o.name === "string" && validPrice(o.price));
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const outcome of outcomes) {
        const group = `${outcome.description ?? ""}:${outcome.point ?? ""}`;
        groups.set(group, [...(groups.get(group) ?? []), outcome]);
      }
      for (const group of groups.values()) {
        const total = group.reduce((sum, outcome) => sum + 1 / Number(outcome.price), 0);
        const labels = group.map(o => String(o.name).toLowerCase());
        const exclusive = market.key === "h2h" ? completeResult && group.length === 3 : market.key === "btts" ? group.length === 2 && labels.includes("yes") && labels.includes("no") : ["totals", "team_totals"].includes(market.key) ? group.length === 2 && labels.includes("over") && labels.includes("under") && typeof group[0].point === "number" && group[0].point >= 0 && group[0].point <= 20 && group[0].point % 1 === .5 : false;
        if (!exclusive && !["draw_no_bet", "double_chance"].includes(market.key)) continue;
        const overround = exclusive ? total - 1 : market.key === "draw_no_bet" ? Math.max(total - 1, resultSum - 1) : resultSum - 1;
        if (!Number.isFinite(overround) || overround < -.01 || overround > .15) continue;
        for (const outcome of group) {
          let probability = exclusive ? (1 / Number(outcome.price)) / total : 0;
          let pushProbability = 0;
          if (market.key === "draw_no_bet") {
            const which = side(String(outcome.name));
            if (!completeResult || group.length !== 2 || !group.some(o => side(String(o.name)) === "home") || !group.some(o => side(String(o.name)) === "away") || !which || which === "draw") continue;
            probability = resultProbability(which); pushProbability = resultProbability("draw");
          }
          if (market.key === "double_chance") {
            if (!completeResult) continue;
            const label = normalize(String(outcome.name));
            const pairs = [["home", "draw", String(value.home_team), "Draw"], ["away", "draw", String(value.away_team), "Draw"], ["home", "away", String(value.home_team), String(value.away_team)]];
            const pair = pairs.find(([, , a, b]) => [a + " or " + b, b + " or " + a, a + "/" + b, b + "/" + a].some(name => normalize(name) === label));
            if (!pair) continue;
            probability = resultProbability(pair[0]) + resultProbability(pair[1]);
          }
          if (market.key === "team_totals" && (typeof outcome.description !== "string" || ![normalize(String(value.home_team)), normalize(String(value.away_team))].includes(normalize(outcome.description)))) continue;
          if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) continue;
          const line = typeof outcome.point === "number" ? ` ${outcome.point}` : "";
          const team = typeof outcome.description === "string" ? ` · ${outcome.description}` : "";
          selections.push({ fixtureId: fixture.id, kickoff: fixture.kickoff, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, competition: fixture.competition.name,
            market: ({ h2h: "Full-time result", totals: "Total goals", btts: "Both teams to score", double_chance: "Double chance", draw_no_bet: "Draw no bet", team_totals: "Team goals" } as Record<string, string>)[market.key] + team,
            selection: String(outcome.name) + line, decimalOdds: Number(outcome.price), bookmaker: bookmaker.title, bookmakerKey: bookmaker.key,
            oddsSource: "The Odds API", providerOddId: null, oddsObservedAt: retrievedAt, oddsUpdatedAt: updatedAt,
            providerEventId: value.id, providerMarketKey: market.key, estimatedProbability: probability, probabilityBasis: "market-implied", pushProbability, overround });
        }
      }
    }
  }
  return selections;
}

export async function getPricedCandidates(fixtures: FootballFixture[], dates: FootballDateRange, markets: TicketMarketKey[]): Promise<{ candidates: PricedSelection[]; warnings: string[] }> {
  configuration();
  const sports = await oddsGet("/sports", {}, 0);
  if (!Array.isArray(sports.data)) throw new FootballProviderError("Invalid odds sport catalogue.", 502);
  const active = new Set(sports.data.filter(item => record(item) && item.active === true).map(item => item.key));
  const candidates: PricedSelection[] = [], warnings: string[] = [];
  let budget = 24;
  const extended = markets.filter(key => !["h2h", "totals"].includes(key));
  for (const code of [...new Set(fixtures.map(f => f.competition.code ?? ""))]) {
    const sport = SPORT_KEYS[code];
    if (!sport || !active.has(sport)) { warnings.push(`No active free odds coverage for ${code || "this competition"}.`); continue; }
    const group = fixtures.filter(f => f.competition.code === code);
    const featured = [...new Set<TicketMarketKey>([...markets.filter(key => ["h2h", "totals"].includes(key)), ...(extended.length ? ["h2h" as const] : [])])];
    if (budget < featured.length) { warnings.push("The per-generation odds budget was reached; coverage is partial. Narrow the leagues or markets."); break; }
    const snapshot = await oddsGet(`/sports/${sport}/odds`, { regions: "uk", markets: featured.join(","), oddsFormat: "decimal", dateFormat: "iso", commenceTimeFrom: new Date(`${dates.start}T00:00:00+02:00`).toISOString().replace(".000Z", "Z"), commenceTimeTo: new Date(`${dates.end}T23:59:59+02:00`).toISOString().replace(".000Z", "Z") }, featured.length);
    budget -= featured.length;
    if (!Array.isArray(snapshot.data)) throw new FootballProviderError("Invalid bookmaker odds response.", 502);
    for (const event of snapshot.data) {
      candidates.push(...parseOddsEvent(event, group, sport, snapshot.retrievedAt, markets));
      if (!extended.length || !record(event) || !matchingFixture(event, group, sport) || typeof event.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)) continue;
      const requested = [...new Set<TicketMarketKey>(["h2h", ...extended])];
      if (budget < requested.length) { warnings.push("Additional market queries stopped at the per-generation credit budget; not every fixture was priced."); continue; }
      budget -= requested.length;
      try {
        const extra = await oddsGet(`/sports/${sport}/events/${event.id}/odds`, { regions: "uk", markets: requested.join(","), oddsFormat: "decimal", dateFormat: "iso" }, requested.length);
        candidates.push(...parseOddsEvent(extra.data, group, sport, extra.retrievedAt, markets));
      } catch (error) {
        if (!(error instanceof FootballProviderError) || error.status !== 422) throw error;
        warnings.push(`Additional requested markets are not available for a ${code} fixture. No odds were derived.`);
      }
    }
  }
  return { candidates, warnings: [...new Set(warnings)] };
}
