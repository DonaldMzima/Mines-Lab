import { timingSafeEqual } from "node:crypto";
import type { InlineKeyboardMarkup } from "@/lib/telegram/types";

interface TelegramBotConfig { token: string; webhookSecret: string; }
interface TelegramSetupConfig extends TelegramBotConfig { appBaseUrl: string; }

export class TelegramConfigurationError extends Error {
  constructor() {
    super("Telegram bot configuration is incomplete or invalid.");
    this.name = "TelegramConfigurationError";
  }
}

export class TelegramApiError extends Error {
  constructor(public readonly method: string, public readonly status: number) {
    super(`Telegram ${method} failed with HTTP ${status}.`);
    this.name = "TelegramApiError";
  }
}

export function getTelegramBotConfig(): TelegramBotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !webhookSecret || !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    throw new TelegramConfigurationError();
  }
  return { token, webhookSecret };
}

export function getTelegramSetupConfig(): TelegramSetupConfig {
  const config = getTelegramBotConfig();
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!appBaseUrl || !/^https:\/\//.test(appBaseUrl)) throw new TelegramConfigurationError();
  return { ...config, appBaseUrl };
}

export function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const first = Buffer.from(received);
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}

async function telegramRequest<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token } = getTelegramBotConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isTelegramSuccess(payload)) throw new TelegramApiError(method, response.status);
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
  const { appBaseUrl, webhookSecret } = getTelegramSetupConfig();
  return telegramRequest<boolean>("setWebhook", {
    url: `${appBaseUrl}/api/telegram/webhook`, secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"], drop_pending_updates: false,
  });
}
