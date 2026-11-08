import { getTelegramBotConfig, secretsMatch, TelegramApiError, TelegramConfigurationError } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/types";

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
  let stage = "configuration";
  try {
    const { webhookSecret } = getTelegramBotConfig();
    stage = "secret-check";
    if (!secretsMatch(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
      return Response.json({ ok: false }, { status: 401 });
    }
    stage = "payload-check";
    const length = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(length) || length > 1_000_000) return Response.json({ ok: false }, { status: 413 });
    const payload: unknown = await request.json();
    if (!isUpdate(payload)) return Response.json({ ok: false }, { status: 400 });
    stage = "command-handler";
    await handleTelegramUpdate(payload);
    return Response.json({ ok: true });
  } catch (error) {
    // Do not log secrets, request headers, chat identifiers, or message contents.
    const kind = error instanceof TelegramConfigurationError
      ? "configuration"
      : error instanceof TelegramApiError
        ? `telegram-api:${error.method}:${error.status}`
        : "unexpected";
    console.error("[telegram-webhook] request failed", { stage, kind });
    if (error instanceof TelegramConfigurationError) {
      return Response.json({ ok: false, error: "Telegram webhook is not configured." }, { status: 503 });
    }
    if (error instanceof TelegramApiError) {
      return Response.json({ ok: false, error: "Telegram API request failed." }, { status: 502 });
    }
    // A 500 asks Telegram to retry. Failed updates are released by the command handler.
    return Response.json({ ok: false }, { status: 500 });
  }
}
