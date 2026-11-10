export type FootballPeriod = "today" | "tomorrow" | "week" | "weekend" | "next7";
export type FootballSource = "API-Football" | "football-data.org";

export interface FootballCompetition {
  id: number;
  name: string;
  country: string | null;
  code: string | null;
  season: number;
  source?: FootballSource;
  available?: boolean;
  unavailableReason?: string;
}

export interface FootballOutcome {
  label: string;
  probability: number;
}

export interface FootballMarket {
  key: string;
  name: string;
  outcomes: FootballOutcome[];
}

export interface FootballPrimaryOutcome {
  marketKey: string;
  market: string;
  outcome: string;
  probability: number;
}

export interface FootballTeamStatistic {
  teamId: number;
  teamName: string;
  statistics: { type: string; value: string | number | null }[];
}

export interface FootballStatisticsResult {
  fixtureId: number;
  available: boolean;
  teams: FootballTeamStatistic[];
  message: string;
  updatedAt: string | null;
}

export interface FootballFixture {
  id: number;
  competition: FootballCompetition;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  state: string;
  stateCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  predictable: boolean | null;
  isUpcoming: boolean;
  isCompleted: boolean;
  source?: FootballSource;
  homeTeamAliases?: string[];
  awayTeamAliases?: string[];
}

export interface FootballFixtureProvider {
  source: FootballSource;
  competitions(): Promise<FootballCompetition[]>;
  fixtures(period: FootballPeriod, competitionIds: number[]): Promise<FootballFixture[]>;
  detail(id: number): Promise<FootballFixtureDetail>;
  statistics(id: number): Promise<FootballStatisticsResult>;
}

export interface FootballFixtureDetail {
  fixture: FootballFixture;
  markets: FootballMarket[];
  primaryOutcome: FootballPrimaryOutcome | null;
  model: {
    name: string;
    version: string;
    status: "provider-model" | "unavailable";
    generatedAt: string | null;
    summary: string;
  };
}

export interface FootballTicketSelection {
  fixtureId: number;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  selection: string;
  decimalOdds: number;
  oddsSource: "manual" | "legacy-provider" | "The Odds API";
  providerOddId: number | null;
  bookmaker: string;
  bookmakerKey?: string;
  oddsObservedAt: string | null;
  oddsUpdatedAt?: string;
  providerEventId?: string;
  providerMarketKey?: string;
  estimatedProbability?: number;
  probabilityBasis?: "market-implied";
  pushProbability?: number;
  originalOdds?: { value: string | number; format: "decimal" | "fractional" | "american"; source: string };
  selectionReason?: string;
  riskExplanation?: string;
}

export interface FootballTicket {
  id: string;
  createdAt: string;
  stakeZar: number;
  selections: FootballTicketSelection[];
  combinedOdds: number;
  potentialReturnZar: number;
  potentialProfitZar: number;
  fingerprint: string;
  riskLabel?: string;
  ticketNumber?: number;
  targetPayoutZar?: number;
  methodology?: string;
}
