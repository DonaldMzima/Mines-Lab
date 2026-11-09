import { footballTicketMenu, handleFootballTicketCallback, handleFootballTicketCommand } from "./football-tickets";
import { analyzeGame, getDefaultInput, validateGameInput } from "@/lib/analysis";
import type { GameSignal } from "@/lib/analysis";
import { parseCompletedGameResult, evaluateGameRecord, summarizeEvaluations } from "@/lib/analysis-records";
import type { CompletedGameResult } from "@/lib/analysis-records";
import { getGameDefinition, isGameId } from "@/lib/game-registry";
import type { GameId } from "@/lib/game-registry";
import { generateSignal } from "@/lib/signals/generator";
import { toMinesGameSignal } from "@/lib/mines-game-signal";
import { GAME_ID, isRecord, tileIndexToNumber } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage } from "@/lib/telegram/api";
import { allowTelegramAction, claimTelegramUpdate, completeTelegramUpdate, getTelegramUser, releaseTelegramUpdate, rememberTelegramCompletedResult, rememberTelegramRound, rememberTelegramSignal, telegramStorageMode, updateTelegramUser, withTelegramUserLock } from "@/lib/telegram/store";
import type { TelegramUserState } from "@/lib/telegram/store";
import type { TelegramCallbackQuery, TelegramUpdate, InlineKeyboardMarkup } from "@/lib/telegram/types";
import { formatPenaltyProbability, getPenaltySeriesAnalysis } from "@/lib/penalty";
import { getFootballCompetitions, getFootballFixtureDetail, getFootballFixtureStatistics, listFootballFixtures } from "@/lib/football/service";
import { FootballProviderError } from "@/lib/football/provider";
import { FootballStorageError, consumeTelegramLink, getLinkedBrowserId, getTickets } from "@/lib/football/storage";
import { getForecastHistory } from "@/lib/football/storage";
import { evaluateProviderForecasts } from "@/lib/football/analysis";
import type { FootballPeriod } from "@/lib/football/types";

const icons: Record<GameId, string> = { mines: "💣", penalty: "⚽", blackjack: "🃏", hilo: "🃏", dice: "🎲", plinko: "🔵", keno: "🔢", towers: "🏰", coinflip: "🪙", poker: "♠️", "lucky-jet": "🚀", "rocket-queen": "🚀", "rocket-x": "🚀", aviator: "✈️", "speed-cash": "🏎️" };
const mineCounts = [2, 3, 5, 7] as const;
const suggestionCounts = [1, 2, 3, 4, 5] as const;
function gameName(id: GameId): string { return icons[id] + " " + getGameDefinition(id).name.toUpperCase(); }
function gameButton(id: GameId) { return { text: icons[id] + " " + getGameDefinition(id).name, callback_data: "game:" + id }; }
function menu(category: "main" | "crash" | "more" = "main"): InlineKeyboardMarkup {
  const games: GameId[] = category === "crash" ? ["lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash"] : category === "more" ? ["hilo", "plinko", "keno", "towers", "coinflip", "poker"] : ["mines", "penalty", "blackjack", "dice"];
  const rows = Array.from({ length: Math.ceil(games.length / 2) }, (_, i) => games.slice(i * 2, i * 2 + 2).map(gameButton));
  if (category === "main") rows.push([{ text: "⚽ Football Tickets", callback_data: "menu:football" }]);
  rows.push(category === "main" ? [{ text: "🚀 Crash", callback_data: "menu:crash" }, { text: "🎮 More Games", callback_data: "menu:more" }] : [{ text: "All Games", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}

function footballError(error: unknown): string | null {
  if (error instanceof FootballProviderError || error instanceof FootballStorageError) return error.message;
  return null;
}

const footballPeriods: { value: FootballPeriod; label: string }[] = [
  { value: "today", label: "Today's Matches" },
  { value: "tomorrow", label: "Tomorrow's Matches" },
  { value: "weekend", label: "Weekend Matches" },
  { value: "next7", label: "Weekly Predictions · Next 7 Days" },
];

async function footballMenu(chatId: number): Promise<void> {
  await sendTelegramMessage(chatId, "⚽ FOOTBALL PREDICTIONS\n\nChoose a period or manage saved tickets.", { inline_keyboard: [
    footballPeriods.slice(0, 2).map((period) => ({ text: period.label, callback_data: `football:period:${period.value}` })),
    footballPeriods.slice(2).map((period) => ({ text: period.label, callback_data: `football:period:${period.value}` })),
    [{ text: "Build Ticket", callback_data: "football:ticket" }, { text: "My Tickets", callback_data: "football:tickets" }],
    [{ text: "Match Search", callback_data: "football:search" }, { text: "Prediction History", callback_data: "football:history" }],
    [{ text: "Main menu", callback_data: "menu:main" }],
  ] });
}

async function footballCompetitions(chatId: number, period: FootballPeriod = "next7", page = 0): Promise<void> {
  try {
    const result = await getFootballCompetitions();
    const competitions = result.competitions.filter(item => item.available !== false);
    const pageSize = 20;
    const pageCount = Math.max(1, Math.ceil(competitions.length / pageSize));
    const safePage = Math.min(Math.max(0, page), pageCount - 1);
    const rows = competitions.slice(safePage * pageSize, (safePage + 1) * pageSize).map((competition) => [{
      text: (competition.country ? `${competition.country} · ` : "") + competition.name,
      callback_data: `football:league:${period}:${competition.id}`,
    }]);
    rows.push([
      ...(safePage > 0 ? [{ text: "Previous", callback_data: `football:competitions:${period}:${safePage - 1}` }] : []),
      ...(safePage + 1 < pageCount ? [{ text: "Next", callback_data: `football:competitions:${period}:${safePage + 1}` }] : []),
      { text: "Periods", callback_data: "menu:football" },
    ]);
    await sendTelegramMessage(chatId, `⚽ ${footballPeriods.find((item) => item.value === period)?.label ?? "Upcoming fixtures"}\n\n${result.message ?? (competitions.length ? "Choose a supported current league:" : "No supported current competitions were returned for this account.")}${result.truncated ? "\nShowing the first leagues available under the daily request budget." : ""}`, { inline_keyboard: rows });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Football data unavailable: ${message}`); return; }
    throw error;
  }
}

async function footballFixtures(chatId: number, competitionId: number, period: FootballPeriod): Promise<void> {
  try {
    await updateTelegramUser(chatId, { footballCompetitionId: competitionId, footballPeriod: period });
    const result = await listFootballFixtures(period, competitionId);
    if (result.fixtures.length === 0) {
      await sendTelegramMessage(chatId, "No fixtures were returned for this competition and period.", { inline_keyboard: [[{ text: "Choose competition", callback_data: `football:period:${period}` }]] });
      return;
    }
    const fixtures = result.fixtures.slice(0, 20);
    const keyboard = fixtures.map((fixture) => [{
      text: `${fixture.homeTeam} ${fixture.isCompleted ? `${fixture.homeScore ?? "?"}-${fixture.awayScore ?? "?"}` : "vs"} ${fixture.awayTeam}`.slice(0, 60),
      callback_data: `football:fixture:${fixture.id}`,
    }]);
    keyboard.push([{ text: "Choose competition", callback_data: "menu:football" }, { text: "Main menu", callback_data: "menu:main" }]);
    await sendTelegramMessage(chatId, `⚽ FIXTURES & RESULTS · ${result.fixtures[0].competition.name}\n${footballPeriods.find((item) => item.value === period)?.label} · times SAST\nChoose a match for available prediction data or final score.${result.truncated || result.fixtures.length > 20 ? "\nShowing a partial list; narrow the period or use the website." : ""}`, { inline_keyboard: keyboard });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Football data unavailable: ${message}`); return; }
    throw error;
  }
}

async function footballPrediction(chatId: number, fixtureId: number): Promise<void> {
  try {
    const detail = await getFootballFixtureDetail(fixtureId);
    const prediction = detail.primaryOutcome;
    const kickoff = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(detail.fixture.kickoff)) + " SAST";
    await sendTelegramMessage(chatId, [
      `⚽ ${detail.fixture.homeTeam} vs ${detail.fixture.awayTeam}`,
      `${detail.fixture.competition.name} · ${kickoff}`,
      "",
      prediction && detail.model.status === "provider-model"
        ? `Most likely provider outcome: ${prediction.outcome} · ${prediction.market} · ${prediction.probability.toFixed(1)}%`
        : detail.model.summary,
      `Source: ${detail.fixture.source ?? "API-Football"} · ${detail.model.version}.`,
      "Not a guarantee or instruction to bet. No bet was placed.",
      "/tickets shows your linked website tickets.",
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "Prediction details", callback_data: `football:details:${fixtureId}` }, { text: "Match statistics", callback_data: `football:stats:${fixtureId}` }],
        [{ text: "Choose competition", callback_data: "menu:football" }, { text: "Main menu", callback_data: "menu:main" }],
      ],
    });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Football data unavailable: ${message}`); return; }
    throw error;
  }
}

async function footballDetails(chatId: number, fixtureId: number): Promise<void> {
  try {
    const detail = await getFootballFixtureDetail(fixtureId);
    const lines = [
      `⚽ ${detail.fixture.homeTeam} vs ${detail.fixture.awayTeam}`,
      `Source: ${detail.fixture.source ?? "API-Football"} · ${detail.model.version}`,
      ...detail.markets.map((market) => `${market.name}: ${market.outcomes.map((item) => `${item.label} ${item.probability.toFixed(1)}%`).join(" · ")}`),
      "",
      detail.model.summary,
      detail.fixture.isCompleted && detail.fixture.homeScore !== null && detail.fixture.awayScore !== null
        ? `Final result: ${detail.fixture.homeScore}-${detail.fixture.awayScore}.`
        : "Bookmaker odds are not fetched. Ticket odds must be entered manually on the website.",
      "No bet was placed.",
    ];
    await sendTelegramMessage(chatId, lines.join("\n"), { inline_keyboard: [
      [{ text: "Match statistics", callback_data: `football:stats:${fixtureId}` }],
      [{ text: "Back to prediction", callback_data: `football:fixture:${fixtureId}` }],
    ] });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Football data unavailable: ${message}`); return; }
    throw error;
  }
}

async function footballStatistics(chatId: number, fixtureId: number): Promise<void> {
  try {
    const result = await getFootballFixtureStatistics(fixtureId);
    const lines = [`⚽ MATCH STATISTICS · Fixture ${fixtureId}`, result.message];
    for (const team of result.teams) {
      lines.push("", team.teamName);
      lines.push(...team.statistics.map((item) => `${item.type}: ${item.value ?? "Not reported"}`));
    }
    await sendTelegramMessage(chatId, lines.join("\n").slice(0, 3900), { inline_keyboard: [[{ text: "Back to prediction", callback_data: `football:fixture:${fixtureId}` }]] });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Match statistics unavailable: ${message}`); return; }
    throw error;
  }
}

async function linkFootballTickets(chatId: number, code: string): Promise<void> {
  if (!/^[0-9a-f]{16}$/i.test(code)) {
    await sendTelegramMessage(chatId, "Use a 16-character, one-time code from the website: /link CODE.");
    return;
  }
  try {
    if (!await consumeTelegramLink(code.toLowerCase(), chatId)) {
      await sendTelegramMessage(chatId, "That code is invalid, expired, or already used. Create a new code on the website.");
      return;
    }
    await sendTelegramMessage(chatId, "Website tickets are now linked to this private chat. Use /tickets to view them.");
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Ticket linking unavailable: ${message}`); return; }
    throw error;
  }
}

async function showFootballTickets(chatId: number): Promise<void> {
  try {
    const browserId = await getLinkedBrowserId(chatId);
    if (!browserId) {
      await sendTelegramMessage(chatId, "No website is linked. Open Football in Mines Lab and create a one-time Telegram link code.");
      return;
    }

    const tickets = await getTickets(browserId);
    if (tickets.length === 0) {
      await sendTelegramMessage(chatId, "No saved website tickets yet. Saved tickets will appear here; no bet is placed.");
      return;
    }
    const lines = ["⚽ SAVED WEBSITE TICKETS"];
    for (const ticket of tickets.slice(0, 5)) {
      lines.push("", `Stake R${ticket.stakeZar.toFixed(2)} · odds ${ticket.combinedOdds.toFixed(2)} · ${new Date(ticket.createdAt).toLocaleString()}`);
      for (const selection of ticket.selections) lines.push(`${selection.homeTeam} vs ${selection.awayTeam}: ${selection.market} — ${selection.selection} @ ${selection.decimalOdds.toFixed(2)} (${selection.oddsSource === "manual" ? "Manual" : selection.oddsSource + ": " + selection.bookmaker})`);
      lines.push(`Potential return R${ticket.potentialReturnZar.toFixed(2)} · estimate only, not guaranteed.`);
      lines.push(`Potential profit R${ticket.potentialProfitZar.toFixed(2)} · all selections must win.`);
      lines.push(`Ticket details: /footballticket, then My Saved Tickets.`);
    }
    await sendTelegramMessage(chatId, lines.join("\n"));
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Saved tickets unavailable: ${message}`); return; }
    throw error;
  }
}

async function searchFootballMatches(chatId: number, query: string): Promise<void> {
  const search = query.trim().toLocaleLowerCase();
  if (search.length < 2 || search.length > 80) {
    await sendTelegramMessage(chatId, "Use /search followed by at least two team-name characters. Choose a football competition first.");
    return;
  }
  const state = await getTelegramUser(chatId);
  if (!state.footballCompetitionId) {
    await sendTelegramMessage(chatId, "Choose a competition and period with /football first, then use /search TEAM.");
    return;
  }
  try {
    const { fixtures } = await listFootballFixtures(state.footballPeriod, state.footballCompetitionId);
    const matches = fixtures.filter((fixture) => fixture.homeTeam.toLocaleLowerCase().includes(search) || fixture.awayTeam.toLocaleLowerCase().includes(search)).slice(0, 20);
    if (matches.length === 0) { await sendTelegramMessage(chatId, "No matching upcoming teams were found in the selected competition and period."); return; }
    await sendTelegramMessage(chatId, "⚽ MATCH SEARCH · " + matches.length + " result(s)", { inline_keyboard: matches.map((fixture) => [{ text: `${fixture.homeTeam} vs ${fixture.awayTeam}`.slice(0, 60), callback_data: `football:fixture:${fixture.id}` }]) });
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Football search unavailable: ${message}`); return; }
    throw error;
  }
}

async function footballPredictionHistory(chatId: number): Promise<void> {
  try {
    const records = (await getForecastHistory()).filter(({ forecast }) => forecast.provider === "API-Football");
    const evaluation = evaluateProviderForecasts(records);
    const accuracy = evaluation && typeof evaluation.topOutcomeAccuracy === "number" ? `${(evaluation.topOutcomeAccuracy * 100).toFixed(1)}%` : "Not available";
    const brier = evaluation && typeof evaluation.multiclassBrierScore === "number" ? evaluation.multiclassBrierScore.toFixed(4) : "Not available";
    const bookmaker = evaluation && typeof evaluation.bookmakerBrierScore === "number" ? evaluation.bookmakerBrierScore.toFixed(4) : "Not available";
    const bets = evaluation && typeof evaluation.hypotheticalOneUnitNetReturn === "number" ? `${evaluation.hypotheticalOneUnitNetReturn >= 0 ? "+" : ""}${evaluation.hypotheticalOneUnitNetReturn.toFixed(2)} units (${evaluation.hypotheticalTopOutcomeBets} bets)` : "Not available";
    const recent = records.slice(0, 5).map(({ forecast, result }) => {
      const teams = `${String(forecast.homeTeam ?? "Home")} vs ${String(forecast.awayTeam ?? "Away")}`;
      const primary = isRecord(forecast.primaryOutcome) && typeof forecast.primaryOutcome.outcome === "string" ? forecast.primaryOutcome.outcome : "No outcome";
      const score = result && typeof result.home === "number" && typeof result.away === "number" ? ` · ${result.home}-${result.away}` : " · pending";
      return `${teams}: ${primary}${score}`;
    });
    await sendTelegramMessage(chatId, [
      "⚽ PREDICTION HISTORY",
      `Settled fixtures: ${evaluation && typeof evaluation.evaluatedFixtures === "number" ? evaluation.evaluatedFixtures : "Not evaluated"}`,
      `Top-outcome accuracy: ${accuracy}`,
      `Multiclass Brier score: ${brier}`,
      `Uniform baseline Brier score: ${evaluation && typeof evaluation.uniformBaselineBrierScore === "number" ? evaluation.uniformBaselineBrierScore.toFixed(4) : "Not available"}`,
      `Bookmaker baseline Brier score: ${bookmaker}`,
      `Flat one-unit simulation: ${bets}`,
      "",
      ...recent,
      "",
      String(evaluation?.disclaimer ?? "Evaluation is descriptive only. No future accuracy claim is made."),
    ].join("\n"));
  } catch (error) {
    const message = footballError(error);
    if (message) { await sendTelegramMessage(chatId, `Prediction history unavailable: ${message}`); return; }
    throw error;
  }
}
function controls(game: GameId): InlineKeyboardMarkup {
  const rows = [
    [{ text: "Get Signal", callback_data: "signal" }, { text: "Game Settings", callback_data: "settings" }],
    [{ text: "Latest Result", callback_data: "completed" }, { text: "History", callback_data: "history" }],
    [{ text: "Connection Status", callback_data: "status" }, { text: "Details", callback_data: "details" }],
    [{ text: "Choose Game", callback_data: "menu:main" }, { text: "Notifications", callback_data: "notifications" }],
  ];
  if (game === "mines") rows.unshift([{ text: "Mine count", callback_data: "mines" }, { text: "Suggestions", callback_data: "suggestions" }]);
  if (game === "penalty") rows.unshift([{ text: "Turbo", callback_data: "penalty:turbo" }, { text: "Series", callback_data: "penalty:series" }]);
  return { inline_keyboard: rows };
}
function configFor(state: TelegramUserState): Record<string, unknown> {
  const config = { ...getDefaultInput(state.selectedGame), ...state.gameConfigs[state.selectedGame] };
  if (state.selectedGame === "penalty") { config.mode = state.penaltyMode; if (state.penaltyMode === "turbo") config.step = 1; }
  if (state.selectedGame === "mines") { config.mines = state.mineCount; config.picks = state.suggestionCount; }
  if (typeof config.roundId === "string") config.roundId = config.roundId.trim();
  return config;
}
function board(state: TelegramUserState): InlineKeyboardMarkup {
  const suggested = new Set(state.latestSignal?.suggestedTiles ?? []);
  const selected = new Set(state.selectedTiles);
  return { inline_keyboard: [
    ...Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
      const tile = row * 5 + col;
      return { text: (selected.has(tile) ? "•" : suggested.has(tile) ? "✳" : "·") + String(tileIndexToNumber(tile)).padStart(2, "0"), callback_data: "tile:" + tile };
    })),
    [{ text: "Get Signal", callback_data: "signal" }, { text: "Game Settings", callback_data: "settings" }],
    [{ text: "Choose Game", callback_data: "menu:main" }],
  ] };
}
function shortSignal(signal: GameSignal): string {
  return [gameName(signal.gameId as GameId), signal.gameMode ? "Mode: " + signal.gameMode : "", "Round: " + (signal.roundId ?? "Not connected"), "", "SIGNAL", signal.action ?? "No verified action available.", signal.summary, "Status: " + (signal.status === "validated" ? "validated calculation" : signal.status), ...(signal.details.rulesConfirmed !== undefined ? ["Rules: " + (signal.details.rulesConfirmed === true ? "user configured" : "example configuration")] : []), "Connection: Not connected"].filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");
}
async function penaltySummary(state: TelegramUserState, signal = analyzeGame("penalty", configFor(state))): Promise<void> {
  const config = configFor(state);
  const step = typeof config.step === "number" && Number.isInteger(config.step) && config.step >= 1 && config.step <= 5 ? config.step : 1;
  const series = getPenaltySeriesAnalysis()[step - 1];
  await sendTelegramMessage(state.chatId, ["⚽ PENALTY", "Mode: " + state.penaltyMode, ...(state.penaltyMode === "series" ? ["Step: " + step] : []), "Round: " + (typeof config.roundId === "string" ? config.roundId + " (manual)" : "Not connected"), "", signal.summary, ...(state.penaltyMode === "series" ? ["Reach chance: " + formatPenaltyProbability(series.cumulativeScoreProbability)] : []), "Direction signal: Unavailable", "Connection: Not connected"].join("\n"), controls("penalty"));
}
async function sendSignal(chatId: number): Promise<void> {
  let state = await getTelegramUser(chatId);
  const input = configFor(state);
  if (typeof input.roundId === "string" && ((state.signalHistory[state.selectedGame] ?? []).some(record => record.signal.roundId === input.roundId) || (state.completedResults[state.selectedGame] ?? []).some(result => result.roundId === input.roundId) || (state.selectedGame === "mines" && state.rounds.some(round => round.id === input.roundId)))) {
    await sendTelegramMessage(chatId, "This round already has a recorded signal or completed result. View /details or use the next round ID in /config.", controls(state.selectedGame)); return;
  }
  let signal = analyzeGame(state.selectedGame, input);
  if (state.selectedGame === "mines") {
    const legacy = generateSignal({ gameId: GAME_ID, mineCount: state.mineCount, suggestedTileCount: state.suggestionCount, ...(typeof input.roundId === "string" ? { roundId: input.roundId } : {}) });
    state = await updateTelegramUser(chatId, { latestSignal: legacy, selectedTiles: [] });
    signal = toMinesGameSignal(legacy);
  }
  // Persist the exact input and signal before delivering it or receiving an outcome.
  await rememberTelegramSignal(chatId, signal, input);
  if (state.selectedGame === "penalty") { await penaltySummary(state, signal); return; }
  await sendTelegramMessage(chatId, shortSignal(signal) + (state.selectedGame === "mines" ? "\nRandom suggestions; no tile is verified safe." : "\nUse /details for the calculation basis."), state.selectedGame === "mines" ? board(state) : controls(state.selectedGame));
}
async function settings(chatId: number): Promise<void> {
  const state = await getTelegramUser(chatId);
  const input = configFor(state);
  const lines = [gameName(state.selectedGame), "Game settings", JSON.stringify(input, null, 2), "", "Change fields with /config {JSON}", "Use your known state and checked rules. Defaults are examples.", "Optional roundId links a future completed record."];
  if (state.selectedGame === "penalty") lines.push("Choose Turbo/Series below. Set step 1–5 with /config.");
  if (state.selectedGame === "mines") lines.push("Mine count and suggestion count have separate buttons.");
  await sendTelegramMessage(chatId, lines.join("\n").slice(0, 3900), controls(state.selectedGame));
}
async function status(chatId: number): Promise<void> {
  const state = await getTelegramUser(chatId);
  await sendTelegramMessage(chatId, [gameName(state.selectedGame), "Connection: Not connected", "Source: manual input only", "Bot storage: " + telegramStorageMode(), "Browser history: separate", "Notifications: " + (state.notificationsEnabled ? "enabled" : "disabled"), "Validated future accuracy: unavailable"].join("\n"), controls(state.selectedGame));
}
async function details(chatId: number): Promise<void> {
  const state = await getTelegramUser(chatId);
  const record = state.signalHistory[state.selectedGame]?.[0];
  await sendTelegramMessage(chatId, record ? [gameName(state.selectedGame), "Latest analysis details", record.signal.explanation ?? record.signal.source, JSON.stringify(record.signal.details, null, 2), "Generated: " + record.signal.generatedAt].join("\n").slice(0, 3900) : "No signal recorded for this game. Choose Get Signal first.", controls(state.selectedGame));
}
function minesResult(round: GameRound): string {
  return ["💣 MINES — COMPLETED RESULT", "Round: " + round.id, "Mines: " + round.bombCount, "Result: " + round.result, "Bomb tiles: " + round.minePositions.map(tile => String(tileIndexToNumber(tile)).padStart(2, "0")).join(", "), "Source: " + round.source, "Provider origin not independently verified."].join("\n");
}
async function latestResult(chatId: number): Promise<void> {
  const state = await getTelegramUser(chatId);
  const result = state.completedResults[state.selectedGame]?.[0];
  const text = result ? [gameName(state.selectedGame) + " — COMPLETED RESULT", "Round: " + result.roundId, "Completed: " + result.completedAt, JSON.stringify(result.data), "Source: manual record; not independently verified"].join("\n") : state.selectedGame === "mines" && state.rounds[0] ? minesResult(state.rounds[0]) : "No completed result recorded for this game. Use /record with a completed manual record. See /help.";
  await sendTelegramMessage(chatId, text.slice(0, 3900), controls(state.selectedGame));
}
async function history(chatId: number): Promise<void> {
  const state = await getTelegramUser(chatId);
  const results = state.completedResults[state.selectedGame] ?? [];
  const records = state.signalHistory[state.selectedGame] ?? [];
  const evaluations = results.flatMap(result => {
    const candidates = records.filter(record => record.signal.roundId === result.roundId);
    if (candidates.length !== 1) return [];
    try { const evaluated = evaluateGameRecord(candidates[0], result); return evaluated ? [evaluated] : []; } catch { return []; }
  });
  const summary = summarizeEvaluations(evaluations);
  const lines = [gameName(state.selectedGame), "COMPLETED RESULTS", ...results.slice(0, 5).map(result => result.roundId + " · " + result.completedAt + " · manual"), ...(!results.length ? [state.selectedGame === "mines" && state.rounds.length ? state.rounds.length + " server-known Mines results; /result shows latest" : "None recorded"] : []), "", "SIGNAL HISTORY", ...records.slice(0, 5).map(record => record.signal.generatedAt + " · " + (record.signal.action ?? "Unavailable") + " · " + record.signal.status), ...(!records.length ? ["None recorded"] : []), "", ...(summary ? ["Manual event successes: " + summary.successes + "/" + summary.samples, "Observed: " + (100 * summary.observedRate).toFixed(1) + "% · model baseline: " + (100 * summary.meanBaseline).toFixed(1) + "%", "95% interval: " + summary.wilson95.map(value => (value * 100).toFixed(1) + "%").join("–"), "Mean Brier score: " + summary.meanBrierScore.toFixed(4)] : []), "Independently evaluated accuracy: unavailable"];
  await sendTelegramMessage(chatId, lines.join("\n").slice(0, 3900), controls(state.selectedGame));
}
async function configure(chatId: number, raw: string): Promise<void> {
  const state = await getTelegramUser(chatId);
  let updates: Partial<Omit<TelegramUserState, "chatId">>;
  try {
    if (!raw || raw.length > 16_000) throw new Error("Send /config followed by a settings object.");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("Settings must be a JSON object.");
    const allowedKeys = new Set([...Object.keys(getDefaultInput(state.selectedGame)), "roundId"]);
    if (Object.keys(parsed).some(key => !allowedKeys.has(key))) throw new Error("Unknown setting. Use /settings to view supported fields.");
    const input = { ...configFor(state), ...parsed };
    if (input.roundId === null) delete input.roundId;
    else if (typeof input.roundId === "string") input.roundId = input.roundId.trim();
    if (JSON.stringify(input).length > 16_000) throw new Error("Settings exceed the 16 KB limit.");
    const errors = validateGameInput(state.selectedGame, input);
    if (errors.length) throw new Error(errors.join(" "));
    updates = { gameConfigs: { ...state.gameConfigs, [state.selectedGame]: input } };
    if (state.selectedGame === "penalty" && (input.mode === "turbo" || input.mode === "series")) updates.penaltyMode = input.mode;
    if (state.selectedGame === "mines") {
      if (!mineCounts.some(count => count === input.mines) || !suggestionCounts.some(count => count === input.picks)) throw new Error("Mines supports counts 2, 3, 5, 7 and 1–5 suggestions.");
      updates.mineCount = input.mines as TelegramUserState["mineCount"]; updates.suggestionCount = input.picks as TelegramUserState["suggestionCount"];
    }
  } catch (error) {
    await sendTelegramMessage(chatId, (error instanceof Error ? error.message : "Invalid settings.").slice(0, 1000), controls(state.selectedGame)); return;
  }
  await updateTelegramUser(chatId, updates);
  await sendTelegramMessage(chatId, "Settings saved for " + getGameDefinition(state.selectedGame).name + ".", controls(state.selectedGame));
}
async function recordResult(chatId: number, raw: string): Promise<void> {
  const state = await getTelegramUser(chatId);
  let result: CompletedGameResult;
  try {
    if (!raw || raw.length > 16_000) throw new Error("Use /record {gameId,roundId,completedAt,source:\"manual\",data:{...}} with valid JSON.");
    result = parseCompletedGameResult(JSON.parse(raw));
    if (result.gameId !== state.selectedGame) throw new Error("Select the matching game first.");
  } catch (error) {
    await sendTelegramMessage(chatId, (error instanceof Error ? error.message : "Invalid completed record.").slice(0, 1000), controls(state.selectedGame)); return;
  }
  const prior = state.completedResults[result.gameId]?.find(item => item.roundId === result.roundId);
  if (prior && JSON.stringify(prior) !== JSON.stringify(result)) { await sendTelegramMessage(chatId, "This round has a conflicting saved result. The original was preserved.", controls(state.selectedGame)); return; }
  const added = await rememberTelegramCompletedResult(chatId, result);
  if (getGameDefinition(state.selectedGame).category === "crash") {
    const fresh = await getTelegramUser(chatId);
    const config = configFor(fresh);
    if (validateGameInput(state.selectedGame, config).length) { await sendTelegramMessage(chatId, "Completed result saved separately. Existing configured history needs review in /settings and was preserved.", controls(state.selectedGame)); return; }
    const previous = Array.isArray(config.history) ? config.history.filter(isRecord) : [];
    const incoming = { roundId: result.roundId, completedAt: result.completedAt, multiplier: result.data.multiplier, source: "manual" };
    const existing = previous.find(item => item.roundId === incoming.roundId);
    if (existing && (existing.multiplier !== incoming.multiplier || Date.parse(String(existing.completedAt)) !== Date.parse(incoming.completedAt))) {
      await sendTelegramMessage(chatId, "Completed result saved separately. Your configured history has a conflicting record and was preserved.", controls(state.selectedGame)); return;
    }
    const nextConfig = { ...config, history: existing ? previous : [incoming, ...previous] };
    if (JSON.stringify(nextConfig).length > 16_000) {
      await sendTelegramMessage(chatId, "Completed result saved. Configured history is at capacity and was preserved.", controls(state.selectedGame)); return;
    }
    const errors = validateGameInput(state.selectedGame, nextConfig);
    if (errors.length) {
      await sendTelegramMessage(chatId, "Completed result saved separately. Configured historical analysis was preserved; check /settings.", controls(state.selectedGame)); return;
    }
    await updateTelegramUser(chatId, { gameConfigs: { ...fresh.gameConfigs, [state.selectedGame]: nextConfig } });
  }

  await sendTelegramMessage(chatId, added ? "Completed manual result saved. Source is not independently verified." : "This completed result is already saved.", controls(state.selectedGame));
}
async function notifications(chatId: number, enabled?: boolean): Promise<void> {
  const state = await getTelegramUser(chatId);
  // Set the desired value rather than toggling: a failed send can replay this update safely.
  const next = enabled === undefined ? state : await updateTelegramUser(chatId, { notificationsEnabled: enabled });
  await sendTelegramMessage(chatId,
    "Completed-result notifications: " + (next.notificationsEnabled ? "enabled" : "disabled") +
    ". Choose a preference. A permitted server data source is required for live notifications.",
    { inline_keyboard: [
      [{ text: (next.notificationsEnabled ? "✓ " : "") + "Enable", callback_data: "notifications:on" },
       { text: (!next.notificationsEnabled ? "✓ " : "") + "Disable", callback_data: "notifications:off" }],
      [{ text: "Back to Game", callback_data: "game:" + state.selectedGame }],
    ] });
}
async function handleCommand(chatId: number, text: string): Promise<void> {
  const [head = ""] = text.trim().split(/\s+/, 1);
  const command = head.toLowerCase().split("@")[0];
  const body = text.trim().slice(head.length).trim();
  if (await handleFootballTicketCommand(chatId, command, body)) return;
  if (command === "/start" || command === "/games") { await sendTelegramMessage(chatId, "MINES LAB\n\nChoose Game", menu()); return; }
  if (command === "/help") {
    await sendTelegramMessage(chatId, "MINES LAB\n/games — choose game\n/signal — selected game analysis\n/settings — settings and input format\n/config {JSON} — update selected game\n/details — calculations and limitations\n/result or /round — latest completed result\n/history — results and signals separately\n/status — connection and storage\n/penalty — select Penalty\n/football — generate football tickets\n/fixtures — advanced fixture browser\n/ticketdates START END — custom dates\n/ticketbudget ZAR — budget\n/ticketstrategy conservative|balanced|high-risk\n/ticketmarkets auto|h2h,totals — supported markets\n/generateticket — proposed ticket\n/todaystickets and /weekendtickets — generate for these dates\n/search TEAM — search the selected football competition\n/footballstats ID — fixture statistics when available\n/footballhistory — prediction evaluation\n/prediction ID — provider prediction for a fixture\n/link CODE — link website tickets once\n/tickets — view linked website tickets\n/notifications [on|off] — notification preference\n\n/record {\"gameId\":\"dice\",\"roundId\":\"your-round\",\"completedAt\":\"ISO timestamp\",\"source\":\"manual\",\"data\":{\"value\":42}}\n\nUse your actual completed records. Link a roundId in settings before Get Signal for prospective matching. Manual results do not establish verified accuracy. Mines suggestions are experimental random tiles. Football probabilities and ticket returns are not guaranteed.", menu()); return;
  }
  if (command === "/football") { await footballTicketMenu(chatId); return; }
  if (command === "/fixtures") { await footballMenu(chatId); return; }
  if (command === "/weekly") { await footballCompetitions(chatId, "next7"); return; }
  if (command === "/search") { await searchFootballMatches(chatId, body); return; }
  if (command === "/footballhistory" || command === "/predictions") { await footballPredictionHistory(chatId); return; }
  if (command === "/link") { await linkFootballTickets(chatId, body); return; }
  if (command === "/tickets") { await showFootballTickets(chatId); return; }
  if (command === "/prediction") {
    if (!/^\d{1,12}$/.test(body)) { await sendTelegramMessage(chatId, "Use /prediction followed by a fixture ID."); return; }
    await footballPrediction(chatId, Number(body)); return;
  }
  if (command === "/footballstats") {
    if (!/^\d{1,12}$/.test(body)) { await sendTelegramMessage(chatId, "Use /footballstats followed by a fixture ID."); return; }
    await footballStatistics(chatId, Number(body)); return;
  }
  if (command === "/signal") { await sendSignal(chatId); return; }
  if (command === "/settings") { await settings(chatId); return; }
  if (command === "/config") { await configure(chatId, body); return; }
  if (command === "/record") { await recordResult(chatId, body); return; }
  if (command === "/status") { await status(chatId); return; }
  if (command === "/details") { await details(chatId); return; }
  if (command === "/result" || command === "/round") { await latestResult(chatId); return; }
  if (command === "/history") { await history(chatId); return; }
  if (command === "/notifications") {
    const choice = body.toLowerCase();
    if (choice !== "" && choice !== "on" && choice !== "off") {
      await sendTelegramMessage(chatId, "Use /notifications to choose, or /notifications on or off."); return;
    }
    await notifications(chatId, choice === "" ? undefined : choice === "on"); return;
  }
  if (command === "/penalty") { const state = await updateTelegramUser(chatId, { selectedGame: "penalty" }); await penaltySummary(state); return; }
  await sendTelegramMessage(chatId, "Send /games to choose a game or /help for commands.", menu());
}
async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat.id;
  if (!chatId || !callback.data) { await answerTelegramCallback(callback.id, "This control is no longer available."); return; }
  const data = callback.data;
  // Answer once before slow storage/analysis work. Acknowledgment alone does not mark an update completed.
  await answerTelegramCallback(callback.id);
  if (await handleFootballTicketCallback(chatId, data)) return;
  if (data === "menu:football") { await footballTicketMenu(chatId); return; }
  if (data.startsWith("menu:")) { const category = data.slice(5); if (category === "main" || category === "crash" || category === "more") { await sendTelegramMessage(chatId, "MINES LAB\n\nChoose Game", menu(category)); return; } }
  const footballPeriod = /^football:period:(today|tomorrow|weekend|next7)$/.exec(data);
  if (footballPeriod) { await footballCompetitions(chatId, footballPeriod[1] as FootballPeriod); return; }
  const competitionPage = /^football:competitions:(today|tomorrow|weekend|next7):(\d{1,2})$/.exec(data);
  if (competitionPage) { await footballCompetitions(chatId, competitionPage[1] as FootballPeriod, Number(competitionPage[2])); return; }
  const competition = /^football:league:(today|tomorrow|weekend|next7):(\d{1,12})$/.exec(data);
  if (competition) { await footballFixtures(chatId, Number(competition[2]), competition[1] as FootballPeriod); return; }
  if (data === "football:tickets") { await showFootballTickets(chatId); return; }
  if (data === "football:history") { await footballPredictionHistory(chatId); return; }
  if (data === "football:search") {
    const state = await getTelegramUser(chatId);
    await sendTelegramMessage(chatId, state.footballCompetitionId ? "Search upcoming teams in your selected competition and period with /search TEAM." : "Choose a competition and period first, then search with /search TEAM.", { inline_keyboard: [[{ text: "Choose fixtures", callback_data: "menu:football" }]] });
    return;
  }
  if (data === "football:ticket") { await footballTicketMenu(chatId); return; }
  const footballFixture = /^football:fixture:(\d{1,12})$/.exec(data);
  if (footballFixture) { await footballPrediction(chatId, Number(footballFixture[1])); return; }
  const footballDetail = /^football:details:(\d{1,12})$/.exec(data);
  if (footballDetail) { await footballDetails(chatId, Number(footballDetail[1])); return; }
  const footballStats = /^football:stats:(\d{1,12})$/.exec(data);
  if (footballStats) { await footballStatistics(chatId, Number(footballStats[1])); return; }
  if (data.startsWith("game:") && isGameId(data.slice(5))) {
    const id = data.slice(5) as GameId;
    await updateTelegramUser(chatId, { selectedGame: id });
    await sendTelegramMessage(chatId, gameName(id) + "\nConnection: Not connected\n\nChoose settings, then Get Signal.", controls(id)); return;
  }
  if (data === "signal") { await sendSignal(chatId); return; }
  if (data === "settings") { await settings(chatId); return; }
  if (data === "completed") { await latestResult(chatId); return; }
  if (data === "history") { await history(chatId); return; }
  if (data === "status") { await status(chatId); return; }
  if (data === "details") { await details(chatId); return; }
  // Older notification buttons open choices without changing saved opt-in.
  if (data === "notifications" || data === "notifications:toggle") { await notifications(chatId); return; }
  if (data === "notifications:on" || data === "notifications:off") {
    await notifications(chatId, data === "notifications:on"); return;
  }
  if (data === "help") { await handleCommand(chatId, "/help"); return; }
  if (data === "penalty") { const state = await updateTelegramUser(chatId, { selectedGame: "penalty" }); await penaltySummary(state); return; }
  const mode = /^penalty:(turbo|series)$/.exec(data);
  if (mode) { const state = await updateTelegramUser(chatId, { selectedGame: "penalty", penaltyMode: mode[1] as "turbo" | "series" }); await penaltySummary(state); return; }
  if (data === "mines") { const state = await getTelegramUser(chatId); await sendTelegramMessage(chatId, "Choose mine count", { inline_keyboard: [mineCounts.map(count => ({ text: (state.mineCount === count ? "✓ " : "") + count, callback_data: "mines:" + count }))] }); return; }
  if (data === "suggestions") { const state = await getTelegramUser(chatId); await sendTelegramMessage(chatId, "Choose suggestion count", { inline_keyboard: [suggestionCounts.map(count => ({ text: (state.suggestionCount === count ? "✓ " : "") + count, callback_data: "suggestions:" + count }))] }); return; }
  const count = /^mines:(2|3|5|7)$/.exec(data);
  if (count) { await updateTelegramUser(chatId, { selectedGame: "mines", mineCount: Number(count[1]) as TelegramUserState["mineCount"], selectedTiles: [], latestSignal: undefined }); await sendTelegramMessage(chatId, "Mine count: " + count[1], controls("mines")); return; }
  const suggestions = /^suggestions:([1-5])$/.exec(data);
  if (suggestions) { await updateTelegramUser(chatId, { selectedGame: "mines", suggestionCount: Number(suggestions[1]) as TelegramUserState["suggestionCount"], selectedTiles: [], latestSignal: undefined }); await sendTelegramMessage(chatId, "Suggestion count: " + suggestions[1], controls("mines")); return; }
  const tile = /^tile:(\d{1,2})$/.exec(data);
  if (tile) {
    const index = Number(tile[1]); const state = await getTelegramUser(chatId);
    if (index > 24 || state.selectedGame !== "mines") { await sendTelegramMessage(chatId, "Select Mines and request a new board.", controls(state.selectedGame)); return; }
    const selectedTiles = state.selectedTiles.includes(index) ? state.selectedTiles.filter(item => item !== index) : [...state.selectedTiles, index];
    const next = await updateTelegramUser(chatId, { selectedTiles });
    if (callback.message) await editTelegramMessage(chatId, callback.message.message_id, "MINES — Experimental random suggestions. Marks are local; no tile is verified safe.", board(next)); return;
  }
  await sendTelegramMessage(chatId, "That control is no longer available. Choose a game.", menu());
}
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const token = await claimTelegramUpdate(update.update_id);
  if (!token) return;
  try {
    const message = update.message ?? update.callback_query?.message;
    const senderId = update.message?.from?.id ?? update.callback_query?.from.id;
    const chatId = message?.chat.id;
    if (message && (message.chat.type !== "private" || (senderId !== undefined && senderId !== chatId))) {
      if (update.callback_query) await answerTelegramCallback(update.callback_query.id, "Open Mines Lab privately to keep your settings independent.");
      else await sendTelegramMessage(message.chat.id, "Open @MinesLabSignalsBot privately to keep your settings and history independent.");
    } else if (chatId !== undefined) {
      await withTelegramUserLock(chatId, async () => {
        if (!await allowTelegramAction(chatId)) {
          if (update.callback_query) await answerTelegramCallback(update.callback_query.id, "Please wait before trying again.");
          else await sendTelegramMessage(chatId, "Please wait before trying another command.");
          return;
        }
        // Register users before commands so notification opt-in persists in durable deployments.
        await updateTelegramUser(chatId, {});
        if (typeof update.message?.text === "string") await handleCommand(chatId, update.message.text);
        else if (update.callback_query) await handleCallback(update.callback_query);
      });
    } else if (update.callback_query) await answerTelegramCallback(update.callback_query.id, "This control is unavailable.");
    await completeTelegramUpdate(update.update_id, token);
  } catch (error) {
    await releaseTelegramUpdate(update.update_id, token);
    throw error;
  }
}
/** Called only by an authorized server adapter. This does not connect a provider or read browser storage. */
export async function notifyTelegramCompletedRound(round: GameRound): Promise<void> {
  const users = await rememberTelegramRound(round);
  await Promise.allSettled(users.map(user => sendTelegramMessage(user.chatId, "💣 MINES — COMPLETED RESULT\nRound: " + round.id + "\nSource: " + round.source + "\nUse /result for details.")));
}
