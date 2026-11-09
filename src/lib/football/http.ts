import { FootballProviderError } from "./provider";
import { FootballStorageError } from "./storage";

export function footballErrorResponse(error: unknown): Response {
  if (error instanceof FootballProviderError || error instanceof FootballStorageError) {
    return Response.json({ error: error.message, code: error instanceof FootballProviderError ? error.code : "redis_unavailable" }, { status: error instanceof FootballProviderError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
  console.error("Unexpected football API error", error);
  return Response.json({ error: "The football request failed unexpectedly." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function readJsonBody(request: Request, maximumBytes = 65_536): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new FootballProviderError("Use application/json.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new FootballProviderError("A JSON request body is required.", 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new FootballProviderError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new FootballProviderError("Request body must be valid JSON.", 400); }
  } finally {
    reader.releaseLock();
  }
}

export function isBrowserId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
