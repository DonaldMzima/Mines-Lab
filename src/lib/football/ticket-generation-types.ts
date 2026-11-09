import type { FootballDateRange } from "./dates";
import type { FootballTicketSelection } from "./types";

export const TICKET_MARKETS = [
  { key: "h2h", label: "Home / Draw / Away" }, { key: "totals", label: "Over / Under goals" },
  { key: "double_chance", label: "Double chance" }, { key: "draw_no_bet", label: "Draw no bet" },
  { key: "btts", label: "Both teams to score" }, { key: "team_totals", label: "Team goals" },
] as const;
export type TicketMarketKey = typeof TICKET_MARKETS[number]["key"];
export type TicketStrategy = "conservative" | "balanced" | "high-risk";
export interface TicketGenerationSettings {
  dates: FootballDateRange;
  competitionIds: number[];
  stakeZar: number;
  strategy: TicketStrategy;
  markets: TicketMarketKey[];
}
export interface PricedSelection extends FootballTicketSelection {
  oddsSource: "The Odds API";
  providerEventId: string;
  providerMarketKey: string;
  estimatedProbability: number;
  probabilityBasis: "market-implied";
  overround: number;
}
export interface GeneratedFootballTicket {
  proposalId: string | null;
  settings: TicketGenerationSettings;
  selections: PricedSelection[];
  combinedOdds: number | null;
  potentialReturnZar: number | null;
  potentialProfitZar: number | null;
  estimatedAllWinProbability: number | null;
  riskLabel: string;
  message: string;
  warnings: string[];
  generatedAt: string;
  expiresAt: string | null;
  methodology: string;
}
