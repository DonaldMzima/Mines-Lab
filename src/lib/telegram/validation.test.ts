import assert from "node:assert/strict";
import { test } from "node:test";
import { isTelegramUpdate, readTelegramBody } from "./validation";
import { parseTelegramUser } from "./store";
import { getDefaultInput } from "../analysis";
const message = { update_id: 1, message: { message_id: 2, from: { id: 42 }, chat: { id: 42, type: "private" }, text: "/games" } };
test("validates nested Telegram identity and callback payloads", () => {
  assert.equal(isTelegramUpdate(message), true);
  assert.equal(isTelegramUpdate({ ...message, message: { ...message.message, chat: { id: "42", type: "private" } } }), false);
  assert.equal(isTelegramUpdate({ ...message, message: { ...message.message, chat: { id: 42, type: ["private"] } } }), false);
  assert.equal(isTelegramUpdate({ update_id: 2, callback_query: { id: "x", from: { id: "42" }, data: "signal" } }), false);
  assert.equal(isTelegramUpdate({ update_id: 2, callback_query: { id: "x", from: { id: 42 }, data: "🎲".repeat(30) } }), false);
});
test("rejects oversized chunked input without trusting Content-Length", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65)); controller.close(); } });
  const request = new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(readTelegramBody(request, 64), RangeError);
});
test("does not accept string numeric settings or cross-user state", () => {
  const state = { chatId: 42, mineCount: 3, suggestionCount: 3, penaltyMode: "turbo", notificationsEnabled: false, selectedTiles: [], rounds: [] };
  assert.equal(parseTelegramUser(state, 42).selectedGame, "mines");
  assert.throws(() => parseTelegramUser({ ...state, mineCount: "3" }, 42));
  assert.throws(() => parseTelegramUser(state, 7));
});

test("rejects duplicate prospective links and non-string signal status on restore", () => {
  const state = { chatId: 42, mineCount: 3, suggestionCount: 3, penaltyMode: "turbo", notificationsEnabled: false, selectedTiles: [], rounds: [] };
  const record = { id: "signal-1", signal: { gameId: "dice", action: null, status: "experimental", source: "test model", summary: "baseline", generatedAt: "2020-01-01T00:00:00Z", roundId: "round-1", details: {} }, input: getDefaultInput("dice"), recordedAt: "2020-01-01T00:00:01Z" };
  assert.equal(parseTelegramUser({ ...state, signalHistory: { dice: [record] } }, 42).signalHistory.dice?.length, 1);
  assert.throws(() => parseTelegramUser({ ...state, signalHistory: { dice: [record, { ...record, id: "signal-2" }] } }, 42));
  assert.throws(() => parseTelegramUser({ ...state, signalHistory: { dice: [{ ...record, signal: { ...record.signal, status: ["experimental"] } }] } }, 42));
});
