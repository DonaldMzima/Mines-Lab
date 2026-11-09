import { sendTelegramMessage } from "./api";
import { getFootballCompetitions } from "../football/service";
import { cacheJson, cachedJson, getLinkedBrowserId, getTickets, FootballStorageError } from "../football/storage";
import { generateFootballTicket, saveGeneratedFootballTicket } from "../football/ticket-generator";
import { FootballProviderError } from "../football/errors";
import { periodRange, timezoneDate, validateDateRange } from "../football/dates";
import { formatFootballTicket } from "../football/ticket-format";
import { TICKET_MARKETS, type TicketGenerationSettings, type TicketStrategy } from "../football/ticket-generation-types";
import type { InlineKeyboardMarkup } from "./types";

const menu: InlineKeyboardMarkup = { inline_keyboard: [
  [{ text: "Generate Football Ticket", callback_data: "ft:generate" }],
  [{ text: "Today's Tickets", callback_data: "ft:today" }, { text: "Weekend Tickets", callback_data: "ft:weekend" }],
  [{ text: "Choose Dates", callback_data: "ft:dates" }, { text: "Choose Budget", callback_data: "ft:budget" }],
  [{ text: "Choose Leagues", callback_data: "ft:leagues" }, { text: "Choose Markets", callback_data: "ft:markets" }],
  [{ text: "Conservative", callback_data: "ft:strategy:conservative" }, { text: "Balanced", callback_data: "ft:strategy:balanced" }, { text: "High Risk", callback_data: "ft:strategy:high-risk" }],
  [{ text: "My Saved Tickets", callback_data: "ft:saved" }, { text: "Advanced fixtures", callback_data: "football:period:next7" }],
] };

async function settings(chatId: number): Promise<TicketGenerationSettings> {
  const saved = await cachedJson<TicketGenerationSettings>(`football-ticket-settings:${chatId}`);
  if (saved && Array.isArray(saved.competitionIds) && Array.isArray(saved.markets) && saved.dates && typeof saved.dates.start === "string" && typeof saved.dates.end === "string" && typeof saved.stakeZar === "number" && ["conservative", "balanced", "high-risk"].includes(saved.strategy)) return saved;
  const today = timezoneDate(new Date());
  return { dates: { start: today, end: today }, competitionIds: [], stakeZar: 10, strategy: "conservative", markets: [] };
}
async function updateSettings(chatId: number, patch: Partial<TicketGenerationSettings>) {
  const next = { ...await settings(chatId), ...patch };
  await cacheJson(`football-ticket-settings:${chatId}`, next, 30 * 86_400);
  return next;
}
export async function footballTicketMenu(chatId: number): Promise<void> {
  try {
    const value = await settings(chatId);
    await sendTelegramMessage(chatId, `⚽ FOOTBALL TICKETS\n${value.dates.start} through ${value.dates.end}\nStake R${value.stakeZar.toFixed(2)} · ${value.strategy}\n${value.competitionIds.length} leagues · markets: ${value.markets.join(", ") || "Automatic"}\n\nGenerate a proposal, then choose Save. No bet is placed. Estimates derived from prices are not verified accuracy.`, menu);
  } catch (error) { await report(chatId, error); }
}
async function report(chatId: number, error: unknown) {
  if (!(error instanceof FootballProviderError) && !(error instanceof FootballStorageError)) throw error;
  await sendTelegramMessage(chatId, `Football ticket unavailable: ${error.message}`, menu);
}
async function linked(chatId: number): Promise<string> {
  const browserId = await getLinkedBrowserId(chatId);
  if (!browserId) throw new FootballProviderError("Link your website first using its one-time /link CODE. The same tickets will then be available on both surfaces.", 409);
  return browserId;
}
async function leagues(chatId: number) {
  const value = await settings(chatId);
  const result = await getFootballCompetitions();
  const available = result.competitions.filter(row => row.available !== false);
  await sendTelegramMessage(chatId, result.message ?? "Choose leagues; tap again to remove a league.", { inline_keyboard: [
    ...available.map(row => [{ text: `${value.competitionIds.includes(row.id) ? "✓ " : ""}${row.name}`, callback_data: `ft:league:${row.id}` }]),
    [{ text: "Select All", callback_data: "ft:leaguesall" }, { text: "Clear", callback_data: "ft:leaguesclear" }],
    [{ text: "Back to ticket", callback_data: "ft:menu" }],
  ] });
}
async function generate(chatId: number) {
  const browserId = await linked(chatId);
  const proposal = await generateFootballTicket(browserId, await settings(chatId));
  if (!proposal.proposalId || !proposal.selections.length) { await sendTelegramMessage(chatId, [proposal.message, ...proposal.warnings].join("\n"), menu); return; }
  const lines = ["⚽ PROPOSED TICKET — NOT SAVED", proposal.riskLabel];
  for (const row of proposal.selections) lines.push("", `${row.homeTeam} vs ${row.awayTeam}`, `${row.kickoff} · ${row.market}: ${row.selection}`, `${row.bookmaker} · ${row.decimalOdds.toFixed(3)} · The Odds API`, `Retrieved ${row.oddsObservedAt}`, `Market-implied estimate ${(row.estimatedProbability * 100).toFixed(1)}%; not verified accuracy.`);
  lines.push("", `Stake R${proposal.settings.stakeZar.toFixed(2)} · combined odds ${proposal.combinedOdds?.toFixed(3)}`, `Potential total return R${proposal.potentialReturnZar?.toFixed(2)}`, `Potential net profit R${proposal.potentialProfitZar?.toFixed(2)}`, "Every leg must win for the full displayed return. Draws/voids change settlement. Prices can change. No bet was placed.", ...proposal.warnings);
  await sendTelegramMessage(chatId, lines.join("\n").slice(0, 3900), { inline_keyboard: [[{ text: "Save Ticket", callback_data: `ft:save:${proposal.proposalId}` }], [{ text: "Choose settings", callback_data: "ft:menu" }]] });
}
async function savedTickets(chatId: number, id?: string) {
  const tickets = await getTickets(await linked(chatId));
  if (id) {
    const ticket = tickets.find(row => row.id === id);
    if (!ticket) throw new FootballProviderError("Ticket not found in your linked history.", 404);
    await sendTelegramMessage(chatId, formatFootballTicket(ticket)); return;
  }
  await sendTelegramMessage(chatId, tickets.length ? "⚽ MY SAVED TICKETS\nChoose Ticket Details." : "No saved tickets yet.", { inline_keyboard: tickets.slice(0, 10).map(ticket => [{ text: `Ticket Details · R${ticket.stakeZar.toFixed(2)} · ${ticket.selections.length} legs`, callback_data: `ft:ticket:${ticket.id}` }]) });
}

export async function handleFootballTicketCallback(chatId: number, data: string): Promise<boolean> {
  if (!data.startsWith("ft:")) return false;
  try {
    if (data === "ft:menu") await footballTicketMenu(chatId);
    else if (data === "ft:generate") await generate(chatId);
    else if (data === "ft:today" || data === "ft:weekend") {
      const today = timezoneDate(new Date());
      const range = data === "ft:today" ? { start: today, end: today } : periodRange("weekend");
      await updateSettings(chatId, { dates: { ...range, start: range.start < today ? today : range.start } });
      await generate(chatId);
    } else if (data === "ft:dates") await sendTelegramMessage(chatId, "Choose a date or range with /ticketdates YYYY-MM-DD YYYY-MM-DD\nDates can extend into next month. Scheduled fixtures and prices must actually be available.", menu);
    else if (data === "ft:budget") await sendTelegramMessage(chatId, "Enter any ZAR budget with /ticketbudget 50", { inline_keyboard: [[10, 50, 100].map(amount => ({ text: `R${amount}`, callback_data: `ft:budget:${amount}` }))] });
    else if (data === "ft:markets") await sendTelegramMessage(chatId, "Use /ticketmarkets auto or /ticketmarkets h2h,totals,btts,draw_no_bet,double_chance,team_totals\nOnly actual returned prices are eligible. Additional markets consume more free credits.", menu);
    else if (data === "ft:leagues") await leagues(chatId);
    else if (data === "ft:leaguesall" || data === "ft:leaguesclear") { const result = await getFootballCompetitions(); await updateSettings(chatId, { competitionIds: data === "ft:leaguesall" ? result.competitions.filter(row => row.available !== false).map(row => row.id) : [] }); await leagues(chatId); }
    else if (data === "ft:saved") await savedTickets(chatId);
    else if (/^ft:league:\d{1,12}$/.test(data)) {
      const id = Number(data.split(":")[2]), result = await getFootballCompetitions();
      if (!result.competitions.some(row => row.id === id && row.available !== false)) throw new FootballProviderError("This league is not available.", 400);
      const current = await settings(chatId);
      await updateSettings(chatId, { competitionIds: current.competitionIds.includes(id) ? current.competitionIds.filter(value => value !== id) : [...new Set([...current.competitionIds, id])] }); await leagues(chatId);
    } else if (/^ft:budget:(10|50|100)$/.test(data)) { await updateSettings(chatId, { stakeZar: Number(data.split(":")[2]) }); await footballTicketMenu(chatId); }
    else if (/^ft:strategy:(conservative|balanced|high-risk)$/.test(data)) { await updateSettings(chatId, { strategy: data.split(":")[2] as TicketStrategy }); await footballTicketMenu(chatId); }
    else if (/^ft:save:[a-f0-9-]{36}$/.test(data)) { const result = await saveGeneratedFootballTicket(await linked(chatId), data.slice(8)); await sendTelegramMessage(chatId, result.duplicate ? "Ticket already saved." : "Ticket saved. It is also available on the linked website. No bet was placed."); await sendTelegramMessage(chatId, formatFootballTicket(result.ticket)); }
    else if (/^ft:ticket:[a-f0-9-]{36}$/.test(data)) await savedTickets(chatId, data.slice(10));
    else throw new FootballProviderError("This ticket control is no longer available.", 400);
  } catch (error) { await report(chatId, error); }
  return true;
}

export async function handleFootballTicketCommand(chatId: number, command: string, body: string): Promise<boolean> {
  if (!["/footballticket", "/generateticket", "/ticketdates", "/ticketbudget", "/ticketstrategy", "/ticketmarkets", "/todaystickets", "/weekendtickets"].includes(command)) return false;
  try {
    if (command === "/footballticket") await footballTicketMenu(chatId);
    else if (command === "/generateticket") await generate(chatId);
    else if (command === "/todaystickets" || command === "/weekendtickets") await handleFootballTicketCallback(chatId, command === "/todaystickets" ? "ft:today" : "ft:weekend");
    else if (command === "/ticketdates") { const parts = body.trim().split(/\s+/); if (parts.length > 2) throw new FootballProviderError("Use /ticketdates YYYY-MM-DD YYYY-MM-DD.", 400); await updateSettings(chatId, { dates: validateDateRange({ start: parts[0], end: parts[1] ?? parts[0] }) }); await footballTicketMenu(chatId); }
    else if (command === "/ticketbudget") { const stake = Number(body); if (!Number.isFinite(stake) || stake < 1 || stake > 100_000) throw new FootballProviderError("Use /ticketbudget with a ZAR amount from 1 to 100000.", 400); await updateSettings(chatId, { stakeZar: Math.round(stake * 100) / 100 }); await footballTicketMenu(chatId); }
    else if (command === "/ticketstrategy") { if (!["conservative", "balanced", "high-risk"].includes(body)) throw new FootballProviderError("Use /ticketstrategy conservative, balanced or high-risk.", 400); await updateSettings(chatId, { strategy: body as TicketStrategy }); await footballTicketMenu(chatId); }
    else if (command === "/ticketmarkets") { const keys = body === "auto" ? [] : body.split(",").map(key => key.trim()); if (keys.some(key => !TICKET_MARKETS.some(market => market.key === key))) throw new FootballProviderError("Choose supported market keys or auto.", 400); await updateSettings(chatId, { markets: [...new Set(keys)] as TicketGenerationSettings["markets"] }); await footballTicketMenu(chatId); }
  } catch (error) { await report(chatId, error); }
  return true;
}
