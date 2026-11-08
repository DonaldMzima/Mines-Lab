import { analyzeGame } from "@/lib/analysis";
import { isGameId } from "@/lib/game-registry";

/** Pure analysis only: no account access, gameplay, or Python subprocess. */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "Use application/json." }, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "A JSON body is required." }, { status: 400 });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        return Response.json({ error: "Request exceeds 64 KiB." }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected an object.");
    const { gameId, input } = body as Record<string, unknown>;
    if (!isGameId(gameId)) throw new Error("Unknown gameId.");
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object.");
    const signal = analyzeGame(gameId, input as Record<string, unknown>);
    return Response.json(signal, { status: signal.details.validationErrors ? 422 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Invalid analysis request." }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
}
