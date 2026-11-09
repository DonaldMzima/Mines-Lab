import { generateFootballTicket } from "@/lib/football/ticket-generator";
import { footballErrorResponse, isBrowserId, readJsonBody } from "@/lib/football/http";
import { FootballProviderError } from "@/lib/football/errors";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("browserId" in body) || !isBrowserId(body.browserId)) throw new FootballProviderError("A valid browser identity is required.", 400);
    const proposal = await generateFootballTicket(body.browserId, body);
    return Response.json(proposal, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return footballErrorResponse(error); }
}
