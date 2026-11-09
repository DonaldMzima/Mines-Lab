import { listFootballFixtures } from "@/lib/football/service";
import { getHistoricalFootballFixtures } from "@/lib/football/provider";
import { footballErrorResponse } from "@/lib/football/http";
import type { FootballPeriod } from "@/lib/football/types";

const periods = new Set<FootballPeriod>(["today", "tomorrow", "week", "weekend", "next7"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("provider") === "api-football") {
      const fixtures = await getHistoricalFootballFixtures(Number(url.searchParams.get("competitionId")), Number(url.searchParams.get("season")), url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
      return Response.json({ fixtures, source: "API-Football", historical: true, truncated: false, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
    }
    const periodValue = url.searchParams.get("period") ?? "next7";
    if (!periods.has(periodValue as FootballPeriod)) return Response.json({ error: "Choose today, tomorrow, week, weekend, or next7." }, { status: 400 });
    const competitionValue = url.searchParams.get("competitionIds") ?? url.searchParams.get("competitionId") ?? "";
    const competitionIds = competitionValue ? competitionValue.split(",").map(Number) : [];
    const result = await listFootballFixtures(periodValue as FootballPeriod, competitionIds);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
