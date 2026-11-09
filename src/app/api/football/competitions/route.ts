import { getFootballCompetitions } from "@/lib/football/service";
import { footballErrorResponse } from "@/lib/football/http";

export async function GET() {
  try {
    const result = await getFootballCompetitions();
    return Response.json({ ...result, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
