import { getTelegramBotConfig, secretsMatch, TelegramApiError, TelegramConfigurationError } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import { isTelegramUpdate, readTelegramBody } from "@/lib/telegram/validation";
import { TelegramStoreError } from "@/lib/telegram/store";

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
    if (!Number.isFinite(length) || length > 32_768) return Response.json({ ok: false }, { status: 413 });
    const payload: unknown = await readTelegramBody(request);
    if (!isTelegramUpdate(payload)) return Response.json({ ok: false }, { status: 400 });
    stage = "command-handler";
    await handleTelegramUpdate(payload);
    return Response.json({ ok: true });
  } catch (error) {
    if (stage === "payload-check" && (error instanceof SyntaxError || error instanceof TypeError)) return Response.json({ ok: false }, { status: 400 });
    if (stage === "payload-check" && error instanceof RangeError) return Response.json({ ok: false }, { status: 413 });
    if (error instanceof TelegramStoreError) return Response.json({ ok: false, error: "Telegram state is temporarily unavailable; retry later." }, { status: 503 });
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
