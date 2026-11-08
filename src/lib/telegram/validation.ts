import { isRecord } from "@/lib/mines";
import type { TelegramUpdate } from "./types";
function id(value: unknown, positive = true): value is number { return typeof value === "number" && Number.isSafeInteger(value) && (positive ? value > 0 : value !== 0); }
function message(value: unknown): boolean {
  if (!isRecord(value) || !id(value.message_id) || !isRecord(value.chat) || !id(value.chat.id, false) || typeof value.chat.type !== "string" || !["private", "group", "supergroup", "channel"].includes(value.chat.type)) return false;
  if (value.text !== undefined && (typeof value.text !== "string" || value.text.length > 16_000)) return false;
  return value.from === undefined || (isRecord(value.from) && id(value.from.id));
}
export function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  if (!isRecord(value) || typeof value.update_id !== "number" || !Number.isSafeInteger(value.update_id) || value.update_id < 0) return false;
  if (value.message !== undefined) return message(value.message) && value.callback_query === undefined;
  const callback = value.callback_query;
  return isRecord(callback) && typeof callback.id === "string" && callback.id.length > 0 && callback.id.length <= 200 &&
    isRecord(callback.from) && id(callback.from.id) && (callback.message === undefined || message(callback.message)) &&
    (callback.data === undefined || (typeof callback.data === "string" && new TextEncoder().encode(callback.data).length <= 64));
}
/** Enforce limits even when a sender omits Content-Length or streams a chunked body. */
export async function readTelegramBody(request: Request, maxBytes = 32_768): Promise<unknown> {
  if (!request.body) throw new SyntaxError("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RangeError("Telegram update exceeds size limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
