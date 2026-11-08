import { generateSignal } from "@/lib/signals/generator";
import { GAME_ID, tileIndexToNumber } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage } from "@/lib/telegram/api";
import { allowTelegramAction, claimTelegramUpdate, getTelegramUser, releaseTelegramUpdate, rememberTelegramRound, updateTelegramUser } from "@/lib/telegram/store";
import type { TelegramUserState } from "@/lib/telegram/store";
import type { TelegramCallbackQuery, TelegramUpdate, InlineKeyboardMarkup } from "@/lib/telegram/types";
import { formatPenaltyProbability, getPenaltySeriesAnalysis, PENALTY_RTP, PENALTY_TURBO_SCORE_PROBABILITY } from "@/lib/penalty";
import type { PenaltyMode } from "@/lib/penalty";

const mineCounts = [2, 3, 5, 7] as const;
const suggestionCounts = [1, 2, 3, 4, 5] as const;

function controls(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Mine count", callback_data: "mines" }, { text: "Suggestions", callback_data: "suggestions" }],
      [{ text: "Experimental Suggestions", callback_data: "signal" }],
      [{ text: "Penalty analysis", callback_data: "penalty" }],
      [{ text: "Completed Result", callback_data: "completed" }, { text: "History", callback_data: "history" }],
      [{ text: "Notifications", callback_data: "notifications" }, { text: "Status", callback_data: "status" }, { text: "Help", callback_data: "help" }],
    ],
  };
}

function penaltyControls(state: TelegramUserState): InlineKeyboardMarkup {
  return { inline_keyboard: [[
    { text: `${state.penaltyMode === "turbo" ? "✓ " : ""}Turbo`, callback_data: "penalty:turbo" },
    { text: `${state.penaltyMode === "series" ? "✓ " : ""}Series`, callback_data: "penalty:series" },
  ]] };
}

function penaltyText(mode: PenaltyMode): string {
  if (mode === "turbo") {
    return [
      "PENALTY — TURBO ANALYSIS",
      `RTP: ${formatPenaltyProbability(PENALTY_RTP)}`,
      `Theoretical score probability: ${formatPenaltyProbability(PENALTY_TURBO_SCORE_PROBABILITY)}`,
      `Theoretical save probability: ${formatPenaltyProbability(1 - PENALTY_TURBO_SCORE_PROBABILITY)}`,
      "One shot. This does not predict a goalkeeper direction or an individual outcome.",
      "No live Penalty data feed or verified Turbo payout schedule is connected.",
    ].join("\n");
  }
  const steps = getPenaltySeriesAnalysis().map((step) =>
    `Step ${step.step}: score ${formatPenaltyProbability(step.scoreProbability)} · cumulative ${formatPenaltyProbability(step.cumulativeScoreProbability)} · shown ${step.displayedMultiplier.toFixed(2)}×`,
  );
  return [
    "PENALTY — SERIES ANALYSIS",
    `RTP: ${formatPenaltyProbability(PENALTY_RTP)}`,
    ...steps,
    "Cumulative probability is the product of the documented conditional scoring probabilities.",
    "Displayed multipliers do not alone verify expected return or cash-out rules. No direction prediction or live data feed is available.",
  ].join("\n");
}

function mineCountControls(state: TelegramUserState): InlineKeyboardMarkup {
  return {
    inline_keyboard: [mineCounts.map((count) => ({
      text: `${state.mineCount === count ? "✓ " : ""}${count} mines`,
      callback_data: `mines:${count}`,
    }))],
  };
}

function suggestionCountControls(state: TelegramUserState): InlineKeyboardMarkup {
  return {
    inline_keyboard: [suggestionCounts.map((count) => ({
      text: `${state.suggestionCount === count ? "✓ " : ""}${count} tile${count === 1 ? "" : "s"}`,
      callback_data: `suggestions:${count}`,
    }))],
  };
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
    "Browser game detection: unavailable to the server-side bot",
    "1win live connection: unavailable",
    "Penalty: theoretical probability analysis available; no live data",
    "Data source: unavailable",
    "Bot storage: separate from browser history",
    `Mine count: ${state.mineCount}`,
    `Suggestion count: ${state.suggestionCount}`,
    `Completed-round notifications: ${state.notificationsEnabled ? "enabled" : "disabled"}`,
    `Last completed result: ${last ? `${last.id} · ${last.minePositions.length} mines` : "none received"}`,
  ].join("\n");
}

function historyText(chatId: number): string {
  const rounds = getTelegramUser(chatId).rounds;
  if (!rounds.length) return "No completed game-data results are available to this bot yet.";
  return ["Recent completed results", ...rounds.slice(0, 5).map((round) => `${round.id} · ${round.minePositions.length} mines · ${round.result === "unknown" ? "finished" : round.result}`)].join("\n");
}

function sourceText(round: GameRound): string {
  if (round.source === "demo") return "Local simulation";
  if (round.source === "provider" || round.source === "live") return "Provider adapter record";
  if (round.source === "manual") return "User-entered record";
  return "User-imported record";
}

function completedRoundText(chatId: number): string {
  const round = getTelegramUser(chatId).rounds[0];
  if (!round) return "No confirmed completed-round result is available.";
  const positions = round.minePositions.map(tileIndexToNumber).sort((first, second) => first - second);
  return [
    "MINES LAB — COMPLETED ROUND",
    "",
    `Round: ${round.id}`,
    `Mode: ${round.mode ?? "unknown"}`,
    `Mines: ${round.bombCount}`,
    `Result: ${round.result === "unknown" ? "Finished" : round.result.replace("_", " ")}`,
    `Received: ${new Date(round.timestamp).toISOString()}`,
    "",
    `Bomb positions: ${positions.map((position) => String(position).padStart(2, "0")).join(", ")}`,
    `Source: ${sourceText(round)}`,
    "Verification: structurally validated; provider origin is not independently verified by this bot.",
  ].join("\n");
}

async function sendSignal(chatId: number): Promise<void> {
  const state = getTelegramUser(chatId);
  const signal = generateSignal({
    gameId: GAME_ID,
    mineCount: state.mineCount,
    suggestedTileCount: state.suggestionCount,
  });
  const next = updateTelegramUser(chatId, { latestSignal: signal, selectedTiles: [] });
  await sendTelegramMessage(chatId, `Experimental Suggestions: ${signal.suggestedTiles.length} tile${signal.suggestedTiles.length === 1 ? "" : "s"} for ${signal.mineCount} mines. Purple ✳ tiles are not verified safe and do not predict future mine positions.`, board(next));
}

async function handleCommand(chatId: number, text: string): Promise<void> {
  const command = text.trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  if (command === "/start") {
    await sendTelegramMessage(chatId, "Welcome to Mines Lab!\n\nChoose the mine count and the independent number of experimental suggestions, then generate a board. Suggestions are random and not verified safe.\n\nChoose an option below.", controls());
    return;
  }
  if (command === "/help") {
    await sendTelegramMessage(chatId, "Commands:\n/start — open controls\n/help — show this help\n/status — bot and data status\n/signal — experimental random suggestions\n/penalty — theoretical Penalty analysis\n/result — latest completed result\n/history — bot-known completed results\n/notifications — toggle completed-round notifications\n\nUse Mine count and Suggestions to configure the board. These settings are independent.", controls());
    return;
  }
  if (command === "/status") { await sendTelegramMessage(chatId, statusText(chatId), controls()); return; }
  if (command === "/signal") { await sendSignal(chatId); return; }
  if (command === "/penalty") {
    const state = getTelegramUser(chatId);
    await sendTelegramMessage(chatId, penaltyText(state.penaltyMode), penaltyControls(state));
    return;
  }
  if (command === "/result" || command === "/round") { await sendTelegramMessage(chatId, completedRoundText(chatId), controls()); return; }
  if (command === "/history") { await sendTelegramMessage(chatId, historyText(chatId), controls()); return; }
  if (command === "/notifications") {
    const state = getTelegramUser(chatId);
    const next = updateTelegramUser(chatId, { notificationsEnabled: !state.notificationsEnabled });
    await sendTelegramMessage(chatId, `Completed-round notifications ${next.notificationsEnabled ? "enabled" : "disabled"}. Notifications are available only when an authorized server-side data source exists.`, controls());
    return;
  }
  await sendTelegramMessage(chatId, "I don’t recognize that command. Send /help for available commands.", controls());
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) { await answerTelegramCallback(callback.id, "This control is no longer available."); return; }
  const data = callback.data;
  if (data === "mines") {
    await answerTelegramCallback(callback.id);
    await sendTelegramMessage(chatId, "Choose the number of hidden mines. This does not change the suggestion count.", mineCountControls(getTelegramUser(chatId)));
    return;
  }
  if (data === "suggestions") {
    await answerTelegramCallback(callback.id);
    await sendTelegramMessage(chatId, "Choose 1–5 experimental suggestion tiles. This does not change the mine count.", suggestionCountControls(getTelegramUser(chatId)));
    return;
  }
  if (data === "signal") { await answerTelegramCallback(callback.id); await sendSignal(chatId); return; }
  if (data === "penalty") {
    const state = getTelegramUser(chatId);
    await answerTelegramCallback(callback.id);
    await sendTelegramMessage(chatId, penaltyText(state.penaltyMode), penaltyControls(state));
    return;
  }
  if (data === "completed") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, completedRoundText(chatId), controls()); return; }
  if (data === "notifications") {
    const state = getTelegramUser(chatId);
    const next = updateTelegramUser(chatId, { notificationsEnabled: !state.notificationsEnabled });
    await answerTelegramCallback(callback.id, `Notifications ${next.notificationsEnabled ? "enabled" : "disabled"}.`);
    await sendTelegramMessage(chatId, `Completed-round notifications ${next.notificationsEnabled ? "enabled" : "disabled"}.`, controls());
    return;
  }
  if (data === "status") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, statusText(chatId), controls()); return; }
  if (data === "help") { await answerTelegramCallback(callback.id); await handleCommand(chatId, "/help"); return; }
  if (data === "history") { await answerTelegramCallback(callback.id); await sendTelegramMessage(chatId, historyText(chatId), controls()); return; }
  const penaltyMode = /^penalty:(turbo|series)$/.exec(data);
  if (penaltyMode) {
    const next = updateTelegramUser(chatId, { penaltyMode: penaltyMode[1] as PenaltyMode });
    await answerTelegramCallback(callback.id, `${penaltyMode[1]} analysis selected.`);
    await sendTelegramMessage(chatId, penaltyText(next.penaltyMode), penaltyControls(next));
    return;
  }
  const count = /^mines:(2|3|5|7)$/.exec(data);
  if (count) {
    updateTelegramUser(chatId, { mineCount: Number(count[1]) as 2 | 3 | 5 | 7, selectedTiles: [] });
    await answerTelegramCallback(callback.id, `${count[1]} mines selected.`);
    await sendTelegramMessage(chatId, `Mine count set to ${count[1]}. Request a signal when ready.`, controls());
    return;
  }
  const suggestionCount = /^suggestions:([1-5])$/.exec(data);
  if (suggestionCount) {
    updateTelegramUser(chatId, { suggestionCount: Number(suggestionCount[1]) as 1 | 2 | 3 | 4 | 5, selectedTiles: [] });
    await answerTelegramCallback(callback.id, `${suggestionCount[1]} suggestion${suggestionCount[1] === "1" ? "" : "s"} selected.`);
    await sendTelegramMessage(chatId, `Suggestion count set to ${suggestionCount[1]}. Mine count is unchanged. Request a signal when ready.`, controls());
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
