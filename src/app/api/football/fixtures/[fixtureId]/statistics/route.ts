import { getFootballFixtureStatistics } from "@/lib/football/provider";
import { footballErrorResponse } from "@/lib/football/http";

export async function GET(_request: Request, context: RouteContext<"/api/football/fixtures/[fixtureId]/statistics">) {
  try {
    const { fixtureId: rawId } = await context.params;
    if (!/^\d{1,12}$/.test(rawId)) return Response.json({ error: "A valid fixture ID is required." }, { status: 400 });
    const result = await getFootballFixtureStatistics(Number(rawId));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
