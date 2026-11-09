import { getFootballFixtureDetail } from "@/lib/football/provider";
import { FootballProviderError } from "@/lib/football/provider";
import { footballErrorResponse, isBrowserId, readJsonBody } from "@/lib/football/http";
import { getTickets, saveTicket } from "@/lib/football/storage";
import type { FootballFixtureDetail, FootballMarket, FootballTicketSelection } from "@/lib/football/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ticketSelection(value: unknown): Pick<FootballTicketSelection, "fixtureId" | "market" | "selection" | "decimalOdds" | "oddsSource" | "providerOddId" | "bookmaker"> {
  if (!isRecord(value) || typeof value.fixtureId !== "number" || !Number.isSafeInteger(value.fixtureId) || value.fixtureId <= 0 ||
      typeof value.market !== "string" || value.market.length > 80 || typeof value.selection !== "string" || value.selection.length > 80 ||
      value.oddsSource !== "manual") {
    throw new FootballProviderError("A ticket selection is malformed.", 400);
  }
  if (typeof value.decimalOdds !== "number" || !Number.isFinite(value.decimalOdds) || value.decimalOdds < 1.01 || value.decimalOdds > 1000 ||
      typeof value.bookmaker !== "string" || value.bookmaker.trim().length > 80) {
    throw new FootballProviderError("Manual decimal odds must be from 1.01 to 1000 and include a bookmaker or manual label.", 400);
  }
  return { fixtureId: value.fixtureId, market: value.market, selection: value.selection, decimalOdds: value.decimalOdds, oddsSource: "manual", providerOddId: null, bookmaker: value.bookmaker };
}

function supportedOutcome(market: FootballMarket, selection: string): boolean {
  return market.outcomes.some((outcome) => outcome.label.toLocaleLowerCase() === selection.toLocaleLowerCase());
}

export async function GET(request: Request) {
  try {
    const browserId = new URL(request.url).searchParams.get("browserId");
    if (!isBrowserId(browserId)) throw new FootballProviderError("A valid browser ID is required.", 400);
    return Response.json({ tickets: await getTickets(browserId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || !isBrowserId(body.browserId) || typeof body.stakeZar !== "number" || !Number.isFinite(body.stakeZar) ||
        body.stakeZar < 1 || body.stakeZar > 100_000 || !Array.isArray(body.selections) || body.selections.length < 1 || body.selections.length > 10) {
      throw new FootballProviderError("A ticket requires a valid browser ID, a ZAR stake from 1 to 100000, and 1 to 10 selections.", 400);
    }
    const parsed = body.selections.map(ticketSelection);
    if (new Set(parsed.map((selection) => selection.fixtureId)).size !== parsed.length) throw new FootballProviderError("A ticket can include only one selection per fixture.", 400);
    const details = new Map<number, FootballFixtureDetail>();
    for (const fixtureId of new Set(parsed.map((selection) => selection.fixtureId))) {
      details.set(fixtureId, await getFootballFixtureDetail(fixtureId));
    }
    const selections: FootballTicketSelection[] = parsed.map((selection) => {
      const detail = details.get(selection.fixtureId);
      if (!detail || !detail.fixture.isUpcoming) throw new FootballProviderError("Tickets can only contain upcoming fixtures.", 409);
      const market = detail.markets.find((item) => item.name === selection.market);
      if (!market || !supportedOutcome(market, selection.selection)) throw new FootballProviderError(`The selected outcome is not present in the current API-Football predictions for fixture ${selection.fixtureId}.`, 409);
      return {
        ...selection,
        kickoff: detail.fixture.kickoff,
        homeTeam: detail.fixture.homeTeam,
        awayTeam: detail.fixture.awayTeam,
        competition: detail.fixture.competition.name,
        bookmaker: selection.bookmaker.trim() || "Manual",
        oddsObservedAt: null,
      };
    });
    const combinedOdds = selections.reduce((product, selection) => product * selection.decimalOdds, 1);
    if (!Number.isFinite(combinedOdds) || combinedOdds > 1_000_000_000) throw new FootballProviderError("Combined odds exceed the supported limit.", 400);
    const stakeZar = Math.round(body.stakeZar * 100) / 100;
    const potentialReturnZar = Math.round(stakeZar * combinedOdds * 100) / 100;
    const potentialProfitZar = Math.round((potentialReturnZar - stakeZar) * 100) / 100;
    const result = await saveTicket(body.browserId, { stakeZar, selections, combinedOdds, potentialReturnZar, potentialProfitZar });
    return Response.json({ ...result, disclaimer: "Planning estimate only. No bet was placed; returns are not guaranteed." }, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
