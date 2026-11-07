import { getTelegramConfig, secretsMatch } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUpdate(value: unknown): value is TelegramUpdate {
  if (typeof value !== "object" || value === null) return false;
  const update = value as Record<string, unknown>;
  if (typeof update.update_id !== "number" || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return false;
  const message = update.message;
  const callback = update.callback_query;
  const validMessage = typeof message === "object" && message !== null && typeof (message as { message_id?: unknown }).message_id === "number" && typeof (message as { chat?: { id?: unknown } }).chat?.id === "number";
  const validCallback = typeof callback === "object" && callback !== null && typeof (callback as { id?: unknown }).id === "string";
  return validMessage || validCallback;
}

export async function POST(request: Request) {
  try {
    const { webhookSecret } = getTelegramConfig();
    if (!secretsMatch(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(length) || length > 1_000_000) return Response.json({ ok: false }, { status: 413 });
    const payload: unknown = await request.json();
    if (!isUpdate(payload)) return Response.json({ ok: false }, { status: 400 });
    await handleTelegramUpdate(payload);
    return Response.json({ ok: true });
  } catch {
    // A 500 asks Telegram to retry. The update-id store prevents duplicate work after a successful claim.
    return Response.json({ ok: false }, { status: 500 });
  }
}
