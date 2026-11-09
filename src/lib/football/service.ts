import { footballDataProvider, FREE_COMPETITIONS, footballDataId, isFootballDataId } from "./football-data";
import { getFootballFixtureDetail as apiDetail, getFootballFixtureStatistics as apiStatistics } from "./provider";
import { FootballProviderError } from "./errors";
import type { FootballCompetition, FootballFixtureProvider, FootballPeriod } from "./types";

export { FootballProviderError } from "./errors";

const southAfrica: FootballCompetition = { id: 288, name: "South African Premiership", country: "South Africa", code: null, season: 0, available: false, unavailableReason: "Not included in football-data.org's documented free coverage. No complete free fallback has been verified." };

export async function getFootballCompetitions() {
  try {
    return { competitions: [...await footballDataProvider.competitions(), southAfrica], truncated: false, source: footballDataProvider.source, message: null as string | null };
  } catch (error) {
    if (!(error instanceof FootballProviderError) || error.code !== "configuration_required") throw error;
    // Display the supported catalogue without claiming live account coverage.
    return { competitions: [...FREE_COMPETITIONS.map(([id, code, name, country]): FootballCompetition => ({ id: footballDataId(id), code, name, country, season: 0, source: "football-data.org", available: false, unavailableReason: "Configure the free fixture token to enable this competition." })), southAfrica], truncated: false, source: footballDataProvider.source, message: error.message };
  }
}

export async function listFootballFixtures(period: FootballPeriod = "next7", competitionId?: number | number[]) {
  const ids = competitionId === undefined ? (await footballDataProvider.competitions()).filter(item => item.available).map(item => item.id) : Array.isArray(competitionId) ? competitionId : [competitionId];
  if (ids.length > 12 || ids.some(id => !isFootballDataId(id))) throw new FootballProviderError("Select supported current competitions. API-Football archive data requires an explicit historical request.", 400, false, "invalid_request");
  const fixtures = await footballDataProvider.fixtures(period, [...new Set(ids)]);
  return { fixtures, period, updatedAt: new Date().toISOString(), truncated: false, source: footballDataProvider.source };
}

export function getFootballFixtureDetail(id: number) {
  return isFootballDataId(id) ? footballDataProvider.detail(id) : apiDetail(id);
}
export function getFootballFixtureStatistics(id: number) {
  return isFootballDataId(id) ? footballDataProvider.statistics(id) : apiStatistics(id);
}

/** Explicit typed archive adapter; never used as a current-fixture fallback. */
export const apiFootballArchiveProvider: Pick<FootballFixtureProvider, "source" | "detail" | "statistics"> = { source: "API-Football", detail: apiDetail, statistics: apiStatistics };
