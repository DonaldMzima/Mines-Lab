import { timingSafeEqual } from "node:crypto";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";

interface TelegramConfig { token: string; webhookSecret: string; appBaseUrl: string; }

export function getTelegramConfig(): TelegramConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!token || !webhookSecret || !appBaseUrl) throw new Error("Telegram bot configuration is incomplete.");
  if (!/^https:\/\//.test(appBaseUrl)) throw new Error("APP_BASE_URL must use HTTPS for Telegram webhooks.");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) throw new Error("TELEGRAM_WEBHOOK_SECRET has an invalid format.");
  return { token, webhookSecret, appBaseUrl };
}

export function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const first = Buffer.from(received);
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}

async function telegramRequest<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token } = getTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isTelegramSuccess(payload)) throw new Error(`Telegram ${method} failed.`);
  return payload.result as T;
}

function isTelegramSuccess(value: unknown): value is { ok: true; result: unknown } {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true;
}

export function sendTelegramMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup) {
  return telegramRequest<{ message_id: number }>("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup: InlineKeyboardMarkup) {
  return telegramRequest<unknown>("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup });
}

export function answerTelegramCallback(callbackQueryId: string, text?: string) {
  return telegramRequest<boolean>("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

export function setTelegramWebhook() {
  const { appBaseUrl, webhookSecret } = getTelegramConfig();
  return telegramRequest<boolean>("setWebhook", {
    url: `${appBaseUrl}/api/telegram/webhook`, secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"], drop_pending_updates: false,
  });
}
