import { footballErrorResponse, isBrowserId, readJsonBody } from "@/lib/football/http";
import { FootballProviderError } from "@/lib/football/provider";
import { createTelegramLink } from "@/lib/football/storage";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || !isBrowserId(body.browserId)) throw new FootballProviderError("A valid browser ID is required.", 400);
    const link = await createTelegramLink(body.browserId);
    return Response.json(link, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return footballErrorResponse(error);
  }
}
