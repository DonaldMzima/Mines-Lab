import { calculateTicketPayout } from "./ticket-math";
export { calculateTicketPayout } from "./ticket-math";
import { randomUUID } from "node:crypto";
import { getFixturesInRange, isFootballDataId } from "./football-data";
import { validateDateRange } from "./dates";
import { cacheJson, cachedJson, saveTicket } from "./storage";
import { FootballProviderError } from "./errors";
import { getPricedCandidates } from "./odds-provider";
import { TICKET_MARKETS, type GeneratedFootballTickets, type GeneratedFootballTicket, type PricedSelection, type TicketGenerationSettings, type TicketStrategy } from "./ticket-generation-types";

export const NO_SUITABLE_TICKET = "No suitable ticket available for these dates and settings.";
export const TICKET_METHODOLOGY = "Rank complete, fresh same-bookmaker markets by margin-adjusted implied probability and overround; use at most one leg per fixture and one bookmaker per ticket. These are estimates derived from bookmaker prices, not independent forecasts, verified accuracy or evidence of value. No team-strength/form model is claimed without supported data. Combined probability is only an independence scenario; correlations and settlement rules can change outcomes.";
export const STRATEGIES = {
  conservative: { maxLegs: 2, minProbability: .65, maxPrice: 2.1, minPrice: 1.1, explanation: "Higher market-implied event probabilities; up to two legs. No bet is safe." },
  balanced: { maxLegs: 3, minProbability: .45, maxPrice: 3.5, minPrice: 1.2, explanation: "Balance market-implied probability, price and bookmaker margin; up to three legs." },
  "high-risk": { maxLegs: 5, minProbability: .2, maxPrice: 8, minPrice: 1.5, explanation: "Higher-loss-risk choices and up to five legs. Longer accumulators compound risk." },
} as const;


export function parseTicketSettings(value: unknown): TicketGenerationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FootballProviderError("Choose dates, leagues, stake and strategy.", 400);
  const raw = value as Record<string, unknown>;
  const dates = validateDateRange(raw.dates);
  if (!Array.isArray(raw.competitionIds) || !raw.competitionIds.length || raw.competitionIds.length > 12 || raw.competitionIds.some(id => !isFootballDataId(id))) throw new FootballProviderError("Select one to twelve supported current leagues.", 400);
  if (typeof raw.stakeZar !== "number" || !Number.isFinite(raw.stakeZar) || raw.stakeZar < 1 || raw.stakeZar > 100_000) throw new FootballProviderError("Enter a ZAR stake from 1 to 100000.", 400);
  if (raw.strategy !== "conservative" && raw.strategy !== "balanced" && raw.strategy !== "high-risk") throw new FootballProviderError("Choose Conservative, Balanced or High Risk.", 400);
  const markets = raw.markets === undefined || Array.isArray(raw.markets) && raw.markets.length === 0 ? TICKET_MARKETS.map(market => market.key) : raw.markets;
  if (!Array.isArray(markets) || markets.length > TICKET_MARKETS.length || markets.some(key => !TICKET_MARKETS.some(market => market.key === key))) throw new FootballProviderError("Choose supported betting markets or Automatic.", 400);
  const matchesPerTicket = raw.matchesPerTicket ?? 4, ticketCount = raw.ticketCount ?? 3, targetPayoutZar = raw.targetPayoutZar ?? 158;
  if (!Number.isInteger(matchesPerTicket) || Number(matchesPerTicket) < 1 || Number(matchesPerTicket) > 10 || !Number.isInteger(ticketCount) || Number(ticketCount) < 1 || Number(ticketCount) > 5 || typeof targetPayoutZar !== "number" || !Number.isFinite(targetPayoutZar) || targetPayoutZar < 1 || targetPayoutZar > 10000000) throw new FootballProviderError("Choose 1–10 matches, 1–5 tickets and a valid target payout.", 400);
  return { matchesPerTicket: Number(matchesPerTicket), ticketCount: Number(ticketCount), targetPayoutZar, dates, competitionIds: [...new Set(raw.competitionIds)], stakeZar: Math.round(raw.stakeZar * 100) / 100, strategy: raw.strategy, markets: [...new Set(markets)] as TicketGenerationSettings["markets"] };
}

export function rankTicketCandidates(candidates: PricedSelection[], strategy: TicketStrategy, now = new Date(), maxLegs: number = STRATEGIES[strategy].maxLegs, targetCombinedOdds?: number): PricedSelection[] {
  const policy = STRATEGIES[strategy];
  const score = (row: PricedSelection) => row.estimatedProbability - row.overround * 2;
  const eligible = candidates.filter(row => Number.isFinite(row.estimatedProbability) && row.estimatedProbability >= policy.minProbability && row.estimatedProbability < 1 && row.probabilityBasis === "market-implied" && row.oddsSource === "The Odds API" && row.decimalOdds >= policy.minPrice && row.decimalOdds <= policy.maxPrice && row.overround >= -.01 && row.overround <= .15 && Date.parse(row.kickoff) > now.getTime() + 300_000 && row.oddsObservedAt !== null && now.getTime() - Date.parse(row.oddsObservedAt) <= 900_000 && Date.parse(row.oddsObservedAt) <= now.getTime() + 60_000 && row.oddsUpdatedAt !== undefined && Number.isFinite(Date.parse(row.oddsUpdatedAt)) && now.getTime() - Date.parse(row.oddsUpdatedAt) <= 900000 && Date.parse(row.oddsUpdatedAt) <= now.getTime() + 60000);
  const groups = new Map<string, PricedSelection[]>();
  for (const row of eligible) { const key = row.bookmakerKey ?? row.bookmaker; groups.set(key, [...(groups.get(key) ?? []), row]); }
  let best: PricedSelection[] = [], bestScore = -Infinity, bestDistance = Infinity;
  for (const [, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ranked = rows.slice().sort((a, b) => score(b) - score(a) || a.fixtureId - b.fixtureId || a.selection.localeCompare(b.selection) || a.market.localeCompare(b.market));
    const used = new Set<number>();
    const selected = ranked.filter(row => { if (used.has(row.fixtureId)) return false; used.add(row.fixtureId); return true; }).slice(0, maxLegs);
    // Prefer supported leg count up to the requested leg count, then average quality.
    const quality = selected.length ? selected.length + selected.reduce((sum, row) => sum + score(row), 0) / selected.length : -Infinity;
    const distance = targetCombinedOdds ? Math.abs(selected.reduce((product, row) => product * row.decimalOdds, 1) - targetCombinedOdds) : Infinity;
    if (quality > bestScore || quality === bestScore && distance < bestDistance) { best = selected; bestScore = quality; bestDistance = distance; }
  }
  return best;
}

export async function generateFootballTicket(browserId: string, input: unknown, prepared?: { candidates: PricedSelection[]; warnings: string[] }, preparedFixtures?: boolean): Promise<GeneratedFootballTicket> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserId)) throw new FootballProviderError("A valid linked browser identity is required.", 400);
  const settings = parseTicketSettings(input);
  const fixtures = preparedFixtures ? [] : (await getFixturesInRange(settings.dates, settings.competitionIds)).filter(fixture => fixture.isUpcoming && Date.parse(fixture.kickoff) > Date.now() + 300_000);
  const priced = prepared ?? (fixtures.length ? await getPricedCandidates(fixtures, settings.dates, settings.markets) : { candidates: [], warnings: [] });
  const selections = rankTicketCandidates(priced.candidates, settings.strategy, new Date(), settings.matchesPerTicket, (settings.targetPayoutZar ?? 158) / settings.stakeZar);
  if (selections.length !== settings.matchesPerTicket) selections.splice(0);
  const now = new Date();
  const payout = selections.length ? calculateTicketPayout(settings.stakeZar, selections.map(row => row.decimalOdds)) : null;
  const proposal: GeneratedFootballTicket = {
    proposalId: selections.length ? randomUUID() : null, settings, selections,
    combinedOdds: payout?.combinedOdds ?? null, potentialReturnZar: payout?.potentialReturnZar ?? null, potentialProfitZar: payout?.potentialProfitZar ?? null,
    estimatedAllWinProbability: selections.length ? selections.reduce((p, row) => p * row.estimatedProbability, 1) : null,
    riskLabel: `Risk unassessed. Requested preference: ${settings.strategy}. No calibrated independent probability model is available; accumulator loss risk compounds.`,
    targetAchieved: payout !== null && payout.potentialReturnZar >= (settings.targetPayoutZar ?? 158),
    message: selections.length ? `${selections.length} supported selection${selections.length === 1 ? "" : "s"} at ${selections[0].bookmaker}. Recheck prices with the bookmaker before acting.` : NO_SUITABLE_TICKET,
    warnings: [...priced.warnings, ...(fixtures.length && !selections.length ? ["No complete, fresh market met the strategy filters. Try different dates or use manual odds entry in Advanced."] : [])],
    generatedAt: now.toISOString(), expiresAt: selections.length ? new Date(now.getTime() + 600_000).toISOString() : null, methodology: TICKET_METHODOLOGY,
  };
  if (proposal.proposalId && !preparedFixtures) await cacheJson(`football-ticket-proposal:${browserId}:${proposal.proposalId}`, proposal, 600);
  return proposal;
}

/** Save only the server-held quote. Client edits may remove legs or change stake. */
export async function saveGeneratedFootballTicket(browserId: string, proposalId: string, selectedFixtureIds?: unknown, stake?: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new FootballProviderError("Invalid ticket proposal.", 400);
  const proposal = await cachedJson<GeneratedFootballTicket>(`football-ticket-proposal:${browserId}:${proposalId}`);
  if (!proposal || !proposal.expiresAt || Date.parse(proposal.expiresAt) <= Date.now()) throw new FootballProviderError("This quote expired. Generate a fresh ticket before saving.", 409);
  if (selectedFixtureIds !== undefined && (!Array.isArray(selectedFixtureIds) || !selectedFixtureIds.length || selectedFixtureIds.some(id => !proposal.selections.some(row => row.fixtureId === id)))) throw new FootballProviderError("Choose only legs from the generated proposal.", 400);
  const selections = proposal.selections.filter(row => selectedFixtureIds === undefined || (selectedFixtureIds as unknown[]).includes(row.fixtureId));
  if (selections.some(row => Date.parse(row.kickoff) <= Date.now() + 300_000 || !row.oddsObservedAt || Date.now() - Date.parse(row.oddsObservedAt) > 900_000 || !row.oddsUpdatedAt || Date.now() - Date.parse(row.oddsUpdatedAt) > 900000)) throw new FootballProviderError("A match or price is no longer eligible. Generate a fresh ticket.", 409);
  const payout = calculateTicketPayout(stake === undefined ? proposal.settings.stakeZar : typeof stake === "number" ? stake : NaN, selections.map(row => row.decimalOdds));
  return saveTicket(browserId, { ...payout, selections, riskLabel: proposal.riskLabel, methodology: proposal.methodology, ticketNumber: proposal.ticketNumber, targetPayoutZar: proposal.settings.targetPayoutZar });
}

/** Fetch once, then construct distinct non-overlapping tickets without padding. */
export async function generateFootballTickets(browserId: string, input: unknown): Promise<GeneratedFootballTickets> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserId)) throw new FootballProviderError("A valid linked browser identity is required.", 400);
  const settings = parseTicketSettings(input);
  const fixtures = (await getFixturesInRange(settings.dates, settings.competitionIds)).filter(f => f.isUpcoming && Date.parse(f.kickoff) > Date.now() + 300000);
  const priced = fixtures.length ? await getPricedCandidates(fixtures, settings.dates, settings.markets) : { candidates: [], warnings: [] };
  const tickets: GeneratedFootballTicket[] = [];
  const groups = planTicketGroups(priced.candidates, settings);
  for (let i = 0; i < groups.length; i++) {
    const ticket = await generateFootballTicket(browserId, settings, { candidates: groups[i], warnings: priced.warnings }, true);
    if (!ticket.proposalId) break;
    ticket.ticketNumber = i + 1;
    await cacheJson(`football-ticket-proposal:${browserId}:${ticket.proposalId}`, ticket, 600);
    tickets.push(ticket);

  }
  return { tickets, warnings: priced.warnings, message: tickets.length ? tickets.length + " of " + settings.ticketCount + " requested tickets constructed. Target payout is a preference, not a guarantee; no weaker selections were added to reach it." : NO_SUITABLE_TICKET };
}

export function planTicketGroups(candidates: PricedSelection[], settings: TicketGenerationSettings, now = new Date()): PricedSelection[][] {
  const groups: PricedSelection[][] = [];
  let remaining = candidates;
  for (let i = 0; i < (settings.ticketCount ?? 3); i++) {
    const rows = rankTicketCandidates(remaining, settings.strategy, now, settings.matchesPerTicket ?? 4, (settings.targetPayoutZar ?? 158) / settings.stakeZar);
    if (rows.length !== (settings.matchesPerTicket ?? 4)) break;
    groups.push(rows);
    const used = new Set(rows.map(row => row.fixtureId));
    remaining = remaining.filter(row => !used.has(row.fixtureId));
  }
  return groups;
}
