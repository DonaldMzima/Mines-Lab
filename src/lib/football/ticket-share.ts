import { claimTicketShare, getLinkedTelegramChatId, getTickets } from "./storage";
import { sendTelegramMessage } from "../telegram/api";
import { FootballProviderError } from "./errors";
import { formatFootballTicket, splitFootballMessage } from "./ticket-format";

/** Only called after an explicit website Send to Telegram action. */
export async function sendSavedTicketToTelegram(browserId: string, ticketId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new FootballProviderError("Choose a saved ticket.", 400);
  const ticket = (await getTickets(browserId)).find(row => row.id === ticketId);
  if (!ticket) throw new FootballProviderError("Saved ticket not found for this browser.", 404);
  const chatId = await getLinkedTelegramChatId(browserId);
  if (!chatId) throw new FootballProviderError("Create a one-time Telegram link below first. Older links may need to be renewed for website delivery; /tickets still reads saved records.", 409);
  if (!await claimTicketShare(browserId, ticketId)) throw new FootballProviderError("This ticket was recently shared. Wait one minute before sending it again.", 429, false, "rate_limited");
  for (const message of splitFootballMessage(formatFootballTicket(ticket))) await sendTelegramMessage(chatId, message);
}
