import { FootballProviderError } from "./provider";
import type { FootballMarket } from "./types";

export interface FootballPrimaryOutcome {
  marketKey: string;
  market: string;
  outcome: string;
  probability: number;
}

interface PythonValidation {
  status: "validated" | "unavailable";
  modelVersion: string;
  primaryOutcome: FootballPrimaryOutcome | null;
  markets: FootballMarket[];
  message: string;
}

export function pythonServiceConfigured(): boolean {
  return Boolean(process.env.FOOTBALL_MODEL_API_URL || process.env.FOOTBALL_MODEL_API_TOKEN);
}

function pythonService(): { endpoint: string; token: string } {
  const rawUrl = process.env.FOOTBALL_MODEL_API_URL;
  const token = process.env.FOOTBALL_MODEL_API_TOKEN;
  if (!rawUrl || !token) {
    throw new FootballProviderError("Configure FOOTBALL_MODEL_API_URL and FOOTBALL_MODEL_API_TOKEN for the hosted Python analysis service.", 503);
  }
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) {
    throw new FootballProviderError("FOOTBALL_MODEL_API_TOKEN must be a high-entropy server-side token.", 503);
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new FootballProviderError("FOOTBALL_MODEL_API_URL must be an HTTPS origin.", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new FootballProviderError("FOOTBALL_MODEL_API_URL must be an HTTPS origin without a path or credentials.", 503);
  }
  return { endpoint: url.origin, token };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validPrimary(value: unknown, markets: FootballMarket[]): FootballPrimaryOutcome | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.marketKey !== "string" || typeof value.market !== "string" ||
      typeof value.outcome !== "string" || typeof value.probability !== "number" ||
      !Number.isFinite(value.probability) || value.probability < 0 || value.probability > 100) {
    throw new FootballProviderError("The Python analysis service returned an invalid recommendation.", 502);
  }
  const market = markets.find((item) => item.key === value.marketKey && item.name === value.market);
  if (!market || !market.outcomes.some((item) => item.label === value.outcome && item.probability === value.probability)) {
    throw new FootballProviderError("The Python analysis service returned a recommendation that did not match provider data.", 502);
  }
  return { marketKey: value.marketKey, market: value.market, outcome: value.outcome, probability: value.probability };
}

function matchesMarkets(value: unknown, expected: FootballMarket[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((rawMarket, index) => {
    const market = expected[index];
    if (!isRecord(rawMarket) || rawMarket.key !== market.key || rawMarket.name !== market.name || !Array.isArray(rawMarket.outcomes) || rawMarket.outcomes.length !== market.outcomes.length) return false;
    return rawMarket.outcomes.every((rawOutcome, outcomeIndex) => {
      const outcome = market.outcomes[outcomeIndex];
      return isRecord(rawOutcome) && rawOutcome.label === outcome.label && typeof rawOutcome.probability === "number" && rawOutcome.probability === outcome.probability;
    });
  });
}

async function post(path: string, value: unknown): Promise<unknown> {
  const config = pythonService();
  let response: Response;
  try {
    response = await fetch(`${config.endpoint}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(value),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FootballProviderError("The hosted Python analysis service could not be reached.", 503);
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new FootballProviderError("The Python analysis service returned invalid JSON.", 502); }
  if (!response.ok) {
    const message = isRecord(result) && typeof result.detail === "string" ? result.detail : "The Python analysis service rejected the request.";
    throw new FootballProviderError(message, response.status === 401 ? 503 : response.status === 422 ? 502 : 503);
  }
  return result;
}

export async function validateProviderForecast(input: {
  fixtureId: number;
  kickoff: string;
  predictable: boolean;
  markets: FootballMarket[];
}): Promise<PythonValidation> {
  const result = await post("/v1/validate-predictions", input);
  if (!isRecord(result) || !["validated", "unavailable"].includes(String(result.status)) ||
      typeof result.modelVersion !== "string" || !Array.isArray(result.markets) || typeof result.message !== "string") {
    throw new FootballProviderError("The Python analysis service returned an invalid validation response.", 502);
  }
  if (result.status === "validated" && !matchesMarkets(result.markets, input.markets)) {
    throw new FootballProviderError("The Python analysis service returned probabilities that do not match API-Football data.", 502);
  }
  const markets = result.status === "validated" ? input.markets : [];
  const primaryOutcome = validPrimary(result.primaryOutcome, markets);
  if (result.status === "validated" && !primaryOutcome) throw new FootballProviderError("The Python analysis service validated a forecast without a supported action.", 502);
  return {
    status: result.status as PythonValidation["status"],
    modelVersion: result.modelVersion,
    primaryOutcome,
    markets,
    message: result.message,
  };
}

export async function evaluateProviderForecasts(records: unknown[]): Promise<Record<string, unknown>> {
  const result = await post("/v1/evaluate", { records });
  if (!isRecord(result) || typeof result.modelVersion !== "string" ||
      typeof result.evaluatedFixtures !== "number" || !Number.isSafeInteger(result.evaluatedFixtures) || result.evaluatedFixtures < 0 ||
      !Array.isArray(result.calibrationBins) ||
      typeof result.disclaimer !== "string") {
    throw new FootballProviderError("The Python analysis service returned an invalid evaluation response.", 502);
  }
  const probabilities = ["topOutcomeAccuracy", "multiclassBrierScore", "uniformBaselineBrierScore", "bookmakerBrierScore"];
  for (const field of probabilities) {
    const value = result[field];
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new FootballProviderError("The Python analysis service returned invalid evaluation metrics.", 502);
    }
  }
  if (typeof result.bookmakerEvaluatedFixtures !== "number" || !Number.isSafeInteger(result.bookmakerEvaluatedFixtures) ||
      typeof result.hypotheticalTopOutcomeBets !== "number" || !Number.isSafeInteger(result.hypotheticalTopOutcomeBets) ||
      (result.hypotheticalOneUnitNetReturn !== null && (typeof result.hypotheticalOneUnitNetReturn !== "number" || !Number.isFinite(result.hypotheticalOneUnitNetReturn)))) {
    throw new FootballProviderError("The Python analysis service returned invalid evaluation metrics.", 502);
  }
  for (const bin of result.calibrationBins) {
    if (!isRecord(bin) || typeof bin.count !== "number" || !Number.isSafeInteger(bin.count) ||
        typeof bin.lower !== "number" || typeof bin.upper !== "number" ||
        (bin.meanConfidence !== null && (typeof bin.meanConfidence !== "number" || !Number.isFinite(bin.meanConfidence))) ||
        (bin.empiricalAccuracy !== null && (typeof bin.empiricalAccuracy !== "number" || !Number.isFinite(bin.empiricalAccuracy)))) {
      throw new FootballProviderError("The Python analysis service returned malformed calibration bins.", 502);
    }
  }
  return result;
}
