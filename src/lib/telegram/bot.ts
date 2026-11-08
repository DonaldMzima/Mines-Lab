import { generateSignal } from "@/lib/signals/generator";
import { GAME_ID, tileIndexToNumber } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage } from "@/lib/telegram/api";
import { allowTelegramAction, claimTelegramUpdate, getTelegramUser, releaseTelegramUpdate, rememberTelegramRound, updateTelegramUser } from "@/lib/telegram/store";
import type { TelegramUserState } from "@/lib/telegram/store";
import type { TelegramCallbackQuery, TelegramUpdate, InlineKeyboardMarkup } from "@/lib/telegram/types";

const mineCounts = [2, 3, 5, 7] as const;

function controls(): InlineKeyboardMarkup {
  return { inline_keyboard: [[
    { text: "Mines", callback_data: "mines" },
    { text: "Generate Signal", callback_data: "signal" },
  ], [{ text: "Status", callback_data: "status" }, { text: "Help", callback_data: "help" }]] };
}

function mineCountControls(): InlineKeyboardMarkup {
  return { inline_keyboard: [mineCounts.map((count) => ({ text: `${count} mines`, callback_data: `mines:${count}` }))] };
}

function board(state: TelegramUserState): InlineKeyboardMarkup {
  const suggested = new Set(state.latestSignal?.suggestedTiles ?? []);
  const selected = new Set(state.selectedTiles);
  return {
    inline_keyboard: Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
      const tile = row * 5 + col;
      const label = selected.has(tile) ? "•" : suggested.has(tile) ? "✳" : "·";
      return { text: `${label}${String(tileIndexToNumber(tile)).padStart(2, "0")}`, callback_data: `tile:${tile}` };
    })),
  };
}

function statusText(chatId: number): string {
  const state = getTelegramUser(chatId);
  const last = state.rounds[0];
  return [
    "Mines Lab status",
    "Telegram bot: online",
    "Mines Lab integration: available",
    "1win live connection: unavailable",
    "Data source: unavailable",
    "Bot storage: separate from browser history",
    `Mine count: ${state.mineCount}`,
    `Last completed result: ${last ? `${last.id} · ${last.minePositions.length} mines` : "none received"}`,
  ].join("\n");
}

function historyText(chatId: number): string {
  const rounds = getTelegramUser(chatId).rounds;
  if (!rounds.length) return "No completed game-data results are available to this bot yet.";
  return ["Recent completed results", ...rounds.slice(0, 5).map((round) => `${round.id} · ${round.minePositions.length} mines · ${round.result === "unknown" ? "finished" : round.result}`)].join("\n");
}

async function sendSignal(chatId: number): Promise<void> {
  const state = getTelegramUser(chatId);
  const signal = generateSignal({ gameId: GAME_ID, mineCount: state.mineCount, suggestedTileCount: Math.min(3, 25 - state.mineCount) });
  const next = updateTelegramUser(chatId, { latestSignal: signal, selectedTiles: [] });
  await sendTelegramMessage(chatId, `Experimental random suggestion for ${signal.mineCount} mines. Purple ✳ tiles are not verified safe and do not predict future mine positions.`, board(next));
}

async function handleCommand(chatId: number, text: string): Promise<void> {
  const command = text.trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  if (command === "/start") {
    await sendTelegramMessage(chatId, "Welcome to Mines Lab!\n\nUse this bot to explore Mines game probabilities, generate experimental tile suggestions, and view supported game results.\n\nChoose an option below.", controls());
    return;
  }
  if (command === "/help") {
    await sendTelegramMessage(chatId, "Commands:\n/start — open controls\n/help — show this help\n/status — bot and data status\n/signal — experimental random suggestion\n/history — bot-known completed results", controls());
    return;
  }
  if (command === "/status") { await sendTelegramMessage(chatId, statusText(chatId), controls()); return; }
  if (command === "/signal") { await sendSignal(chatId); return; }
  if (command === "/history") { await sendTelegramMessage(chatId, historyText(chatId), controls()); return; }
  await sendTelegramMessage(chatId, "I don’t recognize that command. Send /help for available commands.", controls());
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) { await answerTelegramCallback(callback.id, "This control is no longer available."); return; }
  const data = callback.data;
  if (data === "mines") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, "Choose the number of mines for experimental suggestions.", mineCountControls()); return; }
  if (data === "signal") { await answerTelegramCallback(callback.id); await sendSignal(chatId); return; }
  if (data === "status") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, statusText(chatId), controls()); return; }
  if (data === "help") { await answerTelegramCallback(callback.id); await handleCommand(chatId, "/help"); return; }
  if (data === "history") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, historyText(chatId), controls()); return; }
  const count = /^mines:(2|3|5|7)$/.exec(data);
  if (count) {
    updateTelegramUser(chatId, { mineCount: Number(count[1]) as 2 | 3 | 5 | 7, selectedTiles: [] });
    await answerTelegramCallback(callback.id, `${count[1]} mines selected.`);
    await sendTelegramMessage(chatId, `Mine count set to ${count[1]}. Request a signal when ready.`, controls());
    return;
  }
  const tile = /^tile:(\d{1,2})$/.exec(data);
  if (tile) {
    const index = Number(tile[1]);
    if (index < 0 || index > 24) { await answerTelegramCallback(callback.id, "Invalid tile."); return; }
    const state = getTelegramUser(chatId);
    const selectedTiles = state.selectedTiles.includes(index) ? state.selectedTiles.filter((item) => item !== index) : [...state.selectedTiles, index];
    const next = updateTelegramUser(chatId, { selectedTiles });
    await answerTelegramCallback(callback.id, `Tile ${tileIndexToNumber(index)} marked locally.`);
    if (callback.message) await editTelegramMessage(chatId, callback.message.message_id, "Experimental random suggestion. Marks are local only; no tile is guaranteed safe.", board(next));
    return;
  }
  await answerTelegramCallback(callback.id, "Unknown control.");
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (!claimTelegramUpdate(update.update_id)) return;
  try {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId !== undefined && !allowTelegramAction(chatId)) {
      if (update.callback_query) await answerTelegramCallback(update.callback_query.id, "Please wait a moment before trying again.");
      else await sendTelegramMessage(chatId, "Please wait a moment before trying another command.");
      return;
    }
    if (update.message?.chat && typeof update.message.text === "string") await handleCommand(update.message.chat.id, update.message.text);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (error) {
    releaseTelegramUpdate(update.update_id);
    throw error;
  }
}

/** Call only from a future genuine server-side game-data integration, never from browser localStorage. */
export async function notifyTelegramCompletedRound(round: GameRound): Promise<void> {
  const users = rememberTelegramRound(round);
  await Promise.allSettled(users.map((user) => sendTelegramMessage(user.chatId, `Round finished: ${round.id} · ${round.minePositions.length} mines. This is reported game data, not a prediction.`)));
}
