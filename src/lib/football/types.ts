export type FootballPeriod = "today" | "tomorrow" | "week" | "weekend" | "next7";

export interface FootballCompetition {
  id: number;
  name: string;
  country: string | null;
  code: string | null;
  season: number;
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
  oddsSource: "manual" | "legacy-provider";
  providerOddId: number | null;
  bookmaker: string;
  oddsObservedAt: string | null;
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
}
