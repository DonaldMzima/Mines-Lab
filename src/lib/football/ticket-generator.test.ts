import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDateRange } from "./dates";
import { parseOddsEvent } from "./odds-provider";
import { calculateTicketPayout, parseTicketSettings, rankTicketCandidates } from "./ticket-generator";
import type { FootballFixture } from "./types";
import type { PricedSelection, TicketMarketKey } from "./ticket-generation-types";

const now = new Date("2099-01-01T00:00:00Z");
export const fixture: FootballFixture = { id: 1_000_000_123, source: "football-data.org", competition: { id: 1_000_002_021, code: "PL", name: "Premier League", country: "England", season: 2098 }, homeTeam: "Home FC", awayTeam: "Away FC", homeTeamAliases: ["Home FC", "Home"], awayTeamAliases: ["Away FC", "Away"], kickoff: "2099-01-02T12:00:00Z", state: "TIMED", stateCode: "TIMED", isUpcoming: true, isCompleted: false, predictable: false, homeScore: null, awayScore: null };
export const event = () => ({ id: "offline-event-id", sport_key: "soccer_epl", commence_time: fixture.kickoff, home_team: "Home", away_team: "Away", bookmakers: [{ key: "book-a", title: "Book A", last_update: now.toISOString(), markets: [{ key: "h2h", outcomes: [{ name: "Home", price: 1.4 }, { name: "Draw", price: 5 }, { name: "Away", price: 9 }] }] }] });
export const settings = { dates: { start: "2099-01-01", end: "2099-02-10" }, competitionIds: [fixture.competition.id], stakeZar: 10, strategy: "conservative", markets: ["h2h"] };
const priced = (id: number, bookmaker = "Book A", probability = .7, price = 1.4): PricedSelection => ({ fixtureId: id, kickoff: fixture.kickoff, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, competition: fixture.competition.name, market: "Full-time result", selection: "Home", decimalOdds: price, bookmaker, oddsSource: "The Odds API", providerOddId: null, providerEventId: String(id), providerMarketKey: "h2h", oddsObservedAt: now.toISOString(), oddsUpdatedAt: now.toISOString(), estimatedProbability: probability, probabilityBasis: "market-implied", overround: .04 });

test("custom calendars accept next-month ranges and reject rollover, reversed, past and oversized ranges", () => {
  assert.deepEqual(validateDateRange({ start: "2099-01-27", end: "2099-02-15" }, now), { start: "2099-01-27", end: "2099-02-15" });
  for (const range of [{ start: "2099-02-30", end: "2099-03-03" }, { start: "2099-02-01", end: "2099-01-01" }, { start: "2098-12-31", end: "2099-01-01" }, { start: "2099-01-01", end: "2099-12-01" }]) assert.throws(() => validateDateRange(range, now));
  assert.deepEqual(parseTicketSettings({ ...settings, competitionIds: [fixture.competition.id, fixture.competition.id] }).competitionIds, [fixture.competition.id]);
  assert.deepEqual(parseTicketSettings({ ...settings, markets: [] }).markets, ["h2h", "totals"]);
  for (const change of [{ stakeZar: 0 }, { strategy: "guaranteed" }, { markets: ["invented"] }, { competitionIds: [39] }]) assert.throws(() => parseTicketSettings({ ...settings, ...change }));
});

test("odds require an unambiguous fixture, correct league, fresh prices and complete result distribution", () => {
  const output = parseOddsEvent(event(), [fixture], "soccer_epl", now.toISOString(), ["h2h"], now);
  assert.equal(output.length, 3);
  assert.equal(output[0].decimalOdds, 1.4);
  assert.equal(output[0].bookmaker, "Book A");
  assert.equal(output[0].oddsSource, "The Odds API");
  assert.equal(output[0].probabilityBasis, "market-implied");
  assert.ok(Math.abs(output.reduce((sum, row) => sum + row.estimatedProbability, 0) - 1) < 1e-12);
  assert.deepEqual(parseOddsEvent(event(), [fixture, { ...fixture, id: fixture.id + 1 }], "soccer_epl", now.toISOString(), ["h2h"], now), []);
  assert.deepEqual(parseOddsEvent(event(), [fixture], "soccer_spain_la_liga", now.toISOString(), ["h2h"], now), []);
  assert.deepEqual(parseOddsEvent({ ...event(), home_team: "Another team" }, [fixture], "soccer_epl", now.toISOString(), ["h2h"], now), []);
  const incomplete = event(); incomplete.bookmakers[0].markets[0].outcomes.pop();
  assert.deepEqual(parseOddsEvent(incomplete, [fixture], "soccer_epl", now.toISOString(), ["h2h"], now), []);
  const stale = event(); stale.bookmakers[0].last_update = "2098-12-30T00:00:00Z";
  assert.deepEqual(parseOddsEvent(stale, [fixture], "soccer_epl", now.toISOString(), ["h2h"], now), []);
});

test("additional markets use returned prices, half-goal lines and correct push semantics", () => {
  const value: Record<string, unknown> = event();
  const books = value.bookmakers as { markets: unknown[] }[];
  books[0].markets.push(
    { key: "totals", outcomes: [{ name: "Over", point: 2.5, price: 1.8 }, { name: "Under", point: 2.5, price: 2.1 }] },
    { key: "btts", outcomes: [{ name: "Yes", price: 1.8 }, { name: "No", price: 2.1 }] },
    { key: "draw_no_bet", outcomes: [{ name: "Home", price: 1.2 }, { name: "Away", price: 4 }] },
    { key: "double_chance", outcomes: [{ name: "Home or Draw", price: 1.1 }] },
    { key: "team_totals", outcomes: [{ name: "Over", description: "Home", point: 1.5, price: 1.8 }, { name: "Under", description: "Home", point: 1.5, price: 2.1 }] },
  );
  const keys: TicketMarketKey[] = ["totals", "btts", "draw_no_bet", "double_chance", "team_totals"];
  const output = parseOddsEvent(value, [fixture], "soccer_epl", now.toISOString(), keys, now);
  assert.equal(new Set(output.map(row => row.providerMarketKey)).size, 5);
  assert.equal(output.find(row => row.providerMarketKey === "double_chance")?.decimalOdds, 1.1);
  assert.ok((output.find(row => row.providerMarketKey === "draw_no_bet")?.pushProbability ?? 0) > 0);
  const integerLine = { ...event(), bookmakers: [{ ...event().bookmakers[0], markets: [{ key: "totals", outcomes: [{ name: "Over", point: 2, price: 1.8 }, { name: "Under", point: 2, price: 2.1 }] }] }] };
  assert.deepEqual(parseOddsEvent(integerLine, [fixture], "soccer_epl", now.toISOString(), ["totals"], now), []);
});

test("strategies are deterministic, same-bookmaker, distinct-fixture, bounded and never padded", () => {
  const candidates = [priced(1), priced(1), priced(2), priced(3), priced(4, "Book B"), priced(5, "Book B")];
  const conservative = rankTicketCandidates(candidates, "conservative", now);
  assert.equal(conservative.length, 2);
  assert.equal(new Set(conservative.map(row => row.fixtureId)).size, 2);
  assert.equal(new Set(conservative.map(row => row.bookmaker)).size, 1);
  assert.deepEqual(rankTicketCandidates(candidates.slice().reverse(), "conservative", now), conservative);
  assert.equal(rankTicketCandidates([priced(1)], "conservative", now).length, 1);
  assert.deepEqual(rankTicketCandidates([priced(1, "Book A", .3, 4)], "conservative", now), []);
  assert.equal(rankTicketCandidates([priced(1, "Book A", .3, 4)], "high-risk", now).length, 1);
  assert.deepEqual(rankTicketCandidates([{ ...priced(1), kickoff: now.toISOString() }], "balanced", now), []);
});

test("accumulator returns include stake, net profit and correct cent rounding", () => {
  assert.deepEqual(calculateTicketPayout(100, [1.5, 2]), { stakeZar: 100, combinedOdds: 3, potentialReturnZar: 300, potentialProfitZar: 200 });
  assert.equal(calculateTicketPayout(10, [1.85]).potentialReturnZar, 18.5);
  assert.throws(() => calculateTicketPayout(0, [2]));
  assert.throws(() => calculateTicketPayout(100, []));
  assert.throws(() => calculateTicketPayout(100, [NaN]));
});
