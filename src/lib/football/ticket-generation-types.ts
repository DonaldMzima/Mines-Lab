import type { FootballDateRange } from "./dates";
import type { FootballTicketSelection } from "./types";

export const TICKET_MARKETS = [
  { key: "h2h", label: "Home / Draw / Away" }, { key: "totals", label: "Over / Under goals" },
  { key: "double_chance", label: "Double chance" }, { key: "draw_no_bet", label: "Draw no bet" },
  { key: "btts", label: "Both teams to score" }, { key: "team_totals", label: "Team goals" },
  { key: "h2h_3_way_h1", label: "First-half result (1X2)" },
  { key: "h2h_3_way_h2", label: "Second-half result (1X2)" },
  { key: "totals_h1", label: "First-half goals" }, { key: "totals_h2", label: "Second-half goals" },
  { key: "btts_h1", label: "First-half both teams to score" },
  { key: "alternate_totals", label: "Alternate total goals" },
  { key: "alternate_team_totals", label: "Alternate team goals" },
] as const;
export type TicketMarketKey = typeof TICKET_MARKETS[number]["key"];
export type TicketStrategy = "conservative" | "balanced" | "high-risk";
export interface TicketGenerationSettings {
  dates: FootballDateRange;
  competitionIds: number[];
  stakeZar: number;
  strategy: TicketStrategy;
  markets: TicketMarketKey[];
  matchesPerTicket?: number;
  ticketCount?: number;
  targetPayoutZar?: number;
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
  ticketNumber?: number;
  targetAchieved?: boolean;
}

export interface GeneratedFootballTickets { tickets: GeneratedFootballTicket[]; message: string; warnings: string[] }
