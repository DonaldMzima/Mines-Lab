import { getTelegramConfig, secretsMatch, setTelegramWebhook } from "@/lib/telegram/api";

/** Deployment-only endpoint. Send Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>. */
export async function POST(request: Request) {
  try {
    const { webhookSecret } = getTelegramConfig();
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    if (!secretsMatch(bearer, webhookSecret)) return Response.json({ ok: false }, { status: 401 });
    await setTelegramWebhook();
    return Response.json({ ok: true, webhook: "/api/telegram/webhook" });
  } catch {
    return Response.json({ ok: false, error: "Webhook setup failed. Check server configuration and HTTPS deployment." }, { status: 500 });
  }
}
