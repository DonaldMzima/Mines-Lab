export type FootballErrorCode = "configuration_required" | "invalid_api_key" | "season_restricted" | "competition_unavailable" | "quota_exhausted" | "rate_limited" | "redis_unavailable" | "provider_unavailable" | "invalid_request";

export class FootballProviderError extends Error {
  constructor(message: string, readonly status: number, readonly unavailableData = false, readonly code: FootballErrorCode = status === 400 ? "invalid_request" : "provider_unavailable") {
    super(message);
    this.name = "FootballProviderError";
  }
}
