import { footballErrorResponse, isBrowserId, readJsonBody } from "@/lib/football/http";
import { FootballProviderError } from "@/lib/football/errors";
import { sendSavedTicketToTelegram } from "@/lib/football/ticket-share";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("browserId" in body) || !isBrowserId(body.browserId) || !("ticketId" in body) || typeof body.ticketId !== "string") throw new FootballProviderError("Choose a saved ticket and valid browser identity.", 400);
    await sendSavedTicketToTelegram(body.browserId, body.ticketId);
    return Response.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return footballErrorResponse(error); }
}
