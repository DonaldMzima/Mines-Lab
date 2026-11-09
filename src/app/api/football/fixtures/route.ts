import { listFootballFixtures } from "@/lib/football/provider";
import { footballErrorResponse } from "@/lib/football/http";
import type { FootballPeriod } from "@/lib/football/types";

const periods = new Set<FootballPeriod>(["today", "tomorrow", "week", "weekend", "next7"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const periodValue = url.searchParams.get("period") ?? "next7";
    if (!periods.has(periodValue as FootballPeriod)) return Response.json({ error: "Choose today, tomorrow, week, weekend, or next7." }, { status: 400 });
    const competitionValue = url.searchParams.get("competitionId");
    const competitionId = competitionValue === null || competitionValue === "" ? undefined : Number(competitionValue);
    const result = await listFootballFixtures(periodValue as FootballPeriod, competitionId);
    return Response.json({ ...result, source: "API-Football" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
