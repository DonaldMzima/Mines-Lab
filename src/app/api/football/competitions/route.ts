import { getFootballCompetitions } from "@/lib/football/provider";
import { footballErrorResponse } from "@/lib/football/http";

export async function GET() {
  try {
    const result = await getFootballCompetitions();
    return Response.json({ ...result, source: "API-Football", updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
