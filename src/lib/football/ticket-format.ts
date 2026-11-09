import type { FootballTicket } from "./types";

export function formatFootballTicket(ticket: FootballTicket): string {
  const time = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";
  const lines = ["⚽ FOOTBALL TICKET", "No bet placed. Every leg must win for the full displayed return; draws/voids in applicable markets reduce it.", `Ticket ${ticket.id}`, ticket.riskLabel ?? "Quoted/manual planning estimate; no guarantee."];
  for (const row of ticket.selections) lines.push("", `${row.homeTeam} vs ${row.awayTeam}`, time(row.kickoff), `${row.market}: ${row.selection} @ ${row.decimalOdds.toFixed(2)}`, `${row.oddsSource === "manual" ? "Manual odds" : row.oddsSource} · ${row.bookmaker}`, row.oddsObservedAt ? `Retrieved ${time(row.oddsObservedAt)}` : "Odds retrieval time not recorded.", ...(typeof row.estimatedProbability === "number" ? [`Market-implied estimate ${(row.estimatedProbability * 100).toFixed(1)}%; not verified accuracy.`] : []));
  lines.push("", `Stake R${ticket.stakeZar.toFixed(2)} · combined odds ${ticket.combinedOdds.toFixed(3)}`, `Potential total return R${ticket.potentialReturnZar.toFixed(2)}`, `Potential net profit R${ticket.potentialProfitZar.toFixed(2)}`, "Prices can change; confirm availability with the named bookmaker.");
  return lines.join("\n").slice(0, 3900);
}
