import type { FootballTicket } from "./types";

export function formatFootballTicket(ticket: FootballTicket): string {
  const time = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";
  const lines = ["⚽ FOOTBALL TICKET" + (ticket.ticketNumber ? " " + ticket.ticketNumber : ""), "No bet placed. Every leg must win for the full displayed return; draws/voids in applicable markets reduce it.", `Ticket ${ticket.id}`, ticket.riskLabel ?? "Quoted/manual planning estimate; no guarantee."];
  for (const row of ticket.selections) lines.push("", `${row.homeTeam} vs ${row.awayTeam}`, time(row.kickoff), `${row.market}: ${row.selection} @ ${row.decimalOdds.toFixed(3)}`, `${row.oddsSource === "manual" ? "Manual odds" : row.oddsSource} · ${row.bookmaker}`, row.originalOdds ? `Original quote ${row.originalOdds.value} (${row.originalOdds.format}) · ${row.originalOdds.source}` : "Original odds format not recorded for this older ticket.", row.selectionReason ?? "Manual/legacy selection; independent risk unassessed.", row.oddsObservedAt ? `Retrieved ${time(row.oddsObservedAt)}` : "Odds retrieval time not recorded.", ...(typeof row.estimatedProbability === "number" ? [`Market-implied estimate ${(row.estimatedProbability * 100).toFixed(1)}%; not verified accuracy.`] : []));
  if (ticket.targetPayoutZar !== undefined) lines.push(`Requested target R${ticket.targetPayoutZar.toFixed(2)}: ${ticket.potentialReturnZar >= ticket.targetPayoutZar ? "reached by full-win payout" : "not reached"}.`);
  lines.push("", `Stake R${ticket.stakeZar.toFixed(2)} · combined odds ${ticket.combinedOdds.toFixed(3)}`, `Potential total return R${ticket.potentialReturnZar.toFixed(2)}`, `Potential net profit R${ticket.potentialProfitZar.toFixed(2)}`, "Prices can change; confirm availability with the named bookmaker.");
  return lines.join("\n");
}

/** Keep totals and every leg when a large ticket exceeds one Telegram message. */
export function splitFootballMessage(text: string): string[] {
  const messages: string[] = [];
  let remaining = text;
  while (remaining.length > 3500) {
    const newline = remaining.lastIndexOf("\n", 3500);
    const boundary = newline > 0 ? newline : 3500;
    messages.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + (newline > 0 ? 1 : 0));
  }
  if (remaining) messages.push(remaining);
  return messages;
}
