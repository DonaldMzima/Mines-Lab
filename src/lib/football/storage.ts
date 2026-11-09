import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FootballTicket } from "./types";

const ROOT = (process.env.FOOTBALL_STORAGE_NAMESPACE ?? "mines-lab:football:v1").replace(/:+$/, "");
export const API_FOOTBALL_DAILY_REQUEST_LIMIT = 90;

export class FootballStorageError extends Error {
  constructor(message = "Football shared storage is unavailable.") {
    super(message);
    this.name = "FootballStorageError";
  }
}

function redisConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new FootballStorageError("Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for shared football fixtures, forecasts, tickets, and account links.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new FootballStorageError("UPSTASH_REDIS_REST_URL must be an HTTPS origin."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new FootballStorageError("UPSTASH_REDIS_REST_URL must be an HTTPS origin.");
  }
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(ROOT)) throw new FootballStorageError("FOOTBALL_STORAGE_NAMESPACE is invalid.");
  return { url: parsed.origin, token };
}

async function command(args: (string | number)[]): Promise<unknown> {
  const config = redisConfig();
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new FootballStorageError("Football shared storage could not be reached.");
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new FootballStorageError("Football shared storage returned an invalid response."); }
  if (!response.ok || !payload || typeof payload !== "object" || !("result" in payload) || "error" in payload) {
    throw new FootballStorageError("Football shared storage request failed.");
  }
  return (payload as { result: unknown }).result;
}

function key(...parts: string[]): string { return [ROOT, ...parts].join(":"); }

function validBrowserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseTicket(value: unknown): FootballTicket {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FootballStorageError("A saved ticket is malformed.");
  const ticket = value as Partial<FootballTicket>;
  if (typeof ticket.id !== "string" || !/^[0-9a-f-]{36}$/i.test(ticket.id) ||
      typeof ticket.createdAt !== "string" || !Number.isFinite(Date.parse(ticket.createdAt)) ||
      typeof ticket.stakeZar !== "number" || !Number.isFinite(ticket.stakeZar) || ticket.stakeZar < 1 ||
      typeof ticket.combinedOdds !== "number" || !Number.isFinite(ticket.combinedOdds) || ticket.combinedOdds <= 1 ||
      typeof ticket.potentialReturnZar !== "number" || !Number.isFinite(ticket.potentialReturnZar) ||
      typeof ticket.potentialProfitZar !== "number" || !Number.isFinite(ticket.potentialProfitZar) ||
      typeof ticket.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(ticket.fingerprint) ||
      !Array.isArray(ticket.selections) || ticket.selections.length < 1 || ticket.selections.length > 10) {
    throw new FootballStorageError("A saved ticket is malformed.");
  }
  for (const selection of ticket.selections) {
    if (!selection || typeof selection !== "object") throw new FootballStorageError("A saved ticket selection is malformed.");
    const oddsSource = String(selection.oddsSource);
    if (typeof selection.fixtureId !== "number" || !Number.isSafeInteger(selection.fixtureId) || selection.fixtureId <= 0 ||
        typeof selection.kickoff !== "string" || !Number.isFinite(Date.parse(selection.kickoff)) ||
        typeof selection.homeTeam !== "string" || typeof selection.awayTeam !== "string" ||
        typeof selection.competition !== "string" || typeof selection.market !== "string" || typeof selection.selection !== "string" ||
        typeof selection.decimalOdds !== "number" || !Number.isFinite(selection.decimalOdds) || selection.decimalOdds < 1.01 ||
        !["manual", "legacy-provider", "Sportmonks"].includes(oddsSource) ||
        (oddsSource !== "manual" && (typeof selection.providerOddId !== "number" || selection.providerOddId <= 0)) ||
        (oddsSource === "manual" && selection.providerOddId !== null) ||
        typeof selection.bookmaker !== "string" ||
        (selection.oddsObservedAt !== null && (typeof selection.oddsObservedAt !== "string" || !Number.isFinite(Date.parse(selection.oddsObservedAt))))) {
      throw new FootballStorageError("A saved ticket selection is malformed.");
    }
  }
  const selections = ticket.selections.map((selection) => ({
    ...selection,
    oddsSource: String(selection.oddsSource) === "Sportmonks" ? "legacy-provider" : selection.oddsSource,
  }));
  return { ...ticket, selections } as FootballTicket;
}

export async function cachedJson<T>(cacheKey: string): Promise<T | null> {
  const value = await command(["GET", key("cache", cacheKey)]);
  if (value === null) return null;
  if (typeof value !== "string") throw new FootballStorageError("A cached football response is malformed.");
  try { return JSON.parse(value) as T; } catch { throw new FootballStorageError("A cached football response is malformed."); }
}

export async function cacheJson(cacheKey: string, value: unknown, seconds: number): Promise<void> {
  await command(["SET", key("cache", cacheKey), JSON.stringify(value), "EX", seconds]);
}

export async function reserveApiFootballRequest(now = new Date()): Promise<{ allowed: boolean; count: number }> {
  const day = now.toISOString().slice(0, 10);
  const limit = API_FOOTBALL_DAILY_REQUEST_LIMIT;
  const script = `
    local count = tonumber(redis.call('GET', KEYS[1]) or '0')
    if count >= tonumber(ARGV[1]) then return {0, count} end
    count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
    return {1, count}
  `;
  const result = await command(["EVAL", script, 1, key("api-football", "requests", day), limit]);
  if (!Array.isArray(result) || result.length !== 2 ||
      (result[0] !== 0 && result[0] !== 1) || typeof result[1] !== "number") {
    throw new FootballStorageError("API-Football daily request counter returned an invalid response.");
  }
  return { allowed: result[0] === 1, count: result[1] };
}

export async function saveForecast(fixtureId: number, forecast: Record<string, unknown>, kickoff: string): Promise<void> {
  if (Date.parse(kickoff) <= Date.now()) return;
  const generatedAt = typeof forecast.generatedAt === "string" ? Date.parse(forecast.generatedAt) : Number.NaN;
  if (!Number.isFinite(generatedAt) || generatedAt >= Date.parse(kickoff)) throw new FootballStorageError("A football forecast must be saved with a valid pre-kickoff timestamp.");
  const forecastKey = key("api-football", "forecast", String(fixtureId));
  const script = `
    local saved = redis.call('SET', KEYS[1], ARGV[1], 'NX')
    if saved then
      redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
      return 1
    end
    return 0
  `;
  await command(["EVAL", script, 2, forecastKey, key("api-football", "forecasts"), JSON.stringify(forecast), generatedAt, String(fixtureId)]);
}

export async function updateForecastResult(fixtureId: number, result: { home: number; away: number; completedAt: string }): Promise<void> {
  const forecastKey = key("api-football", "forecast", String(fixtureId));
  const stored = await command(["GET", forecastKey]);
  if (stored === null) return;
  if (typeof stored !== "string") throw new FootballStorageError("A saved football forecast is malformed.");
  let forecast: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    forecast = parsed as Record<string, unknown>;
  } catch {
    throw new FootballStorageError("A saved football forecast is malformed.");
  }
  if (typeof forecast.kickoff !== "string" || Date.parse(forecast.kickoff) > Date.parse(result.completedAt)) return;
  await command(["HSET", key("api-football", "results"), String(fixtureId), JSON.stringify({ ...result, fixtureId })]);
}

export async function getForecastHistory(): Promise<{ forecast: Record<string, unknown>; result: Record<string, unknown> | null }[]> {
  const ids = await command(["ZREVRANGE", key("api-football", "forecasts"), 0, 499]);
  if (!Array.isArray(ids)) throw new FootballStorageError("Saved forecast index is malformed.");
  const output: { forecast: Record<string, unknown>; result: Record<string, unknown> | null }[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !/^\d+$/.test(id)) throw new FootballStorageError("Saved forecast index is malformed.");
    const [forecastRaw, resultRaw] = await Promise.all([
      command(["GET", key("api-football", "forecast", id)]),
      command(["HGET", key("api-football", "results"), id]),
    ]);
    if (typeof forecastRaw !== "string") throw new FootballStorageError("A forecast index entry has no saved forecast.");
    try {
      const forecast: unknown = JSON.parse(forecastRaw);
      if (!forecast || typeof forecast !== "object" || Array.isArray(forecast)) throw new Error();
      let result: unknown = null;
      if (resultRaw !== null) {
        if (typeof resultRaw !== "string") throw new Error();
        result = JSON.parse(resultRaw);
        if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
      }
      output.push({ forecast: forecast as Record<string, unknown>, result: result as Record<string, unknown> | null });
    } catch { throw new FootballStorageError("Saved football evaluation data is malformed."); }
  }
  return output.sort((left, right) => Date.parse(String(right.forecast.generatedAt)) - Date.parse(String(left.forecast.generatedAt)));
}

export async function saveTicket(browserId: string, input: Omit<FootballTicket, "id" | "createdAt" | "fingerprint">): Promise<{ ticket: FootballTicket; duplicate: boolean }> {
  if (!validBrowserId(browserId)) throw new FootballStorageError("A valid browser identity is required.");
  const canonicalSelections = [...input.selections].sort((left, right) => left.fixtureId - right.fixtureId);
  const fingerprint = createHash("sha256").update(JSON.stringify({ stakeZar: input.stakeZar, selections: canonicalSelections })).digest("hex");
  const ticket: FootballTicket = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), fingerprint };
  const script = `
    local prior = redis.call('GET', KEYS[1])
    if prior then return {prior, 0} end
    redis.call('SET', KEYS[1], ARGV[1])
    redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
    redis.call('SET', KEYS[3], ARGV[2])
    return {ARGV[2], 1}
  `;
  const result = await command(["EVAL", script, 3, key("ticket-fingerprint", browserId, fingerprint), key("ticket-index", browserId), key("ticket", browserId, ticket.id), JSON.stringify(ticket), ticket.id, Date.parse(ticket.createdAt)]);
  if (!Array.isArray(result) || typeof result[0] !== "string") throw new FootballStorageError("Ticket save returned an invalid result.");
  const existing = await command(["GET", key("ticket", browserId, result[0])]);
  if (typeof existing !== "string") throw new FootballStorageError("Saved ticket could not be read.");
  try { return { ticket: parseTicket(JSON.parse(existing)), duplicate: String(result[1]) !== "1" }; }
  catch { throw new FootballStorageError("Saved ticket is malformed."); }
}

export async function getTickets(browserId: string): Promise<FootballTicket[]> {
  if (!validBrowserId(browserId)) throw new FootballStorageError("A valid browser identity is required.");
  const ids = await command(["ZREVRANGE", key("ticket-index", browserId), 0, 99]);
  if (!Array.isArray(ids)) throw new FootballStorageError("Saved ticket index is malformed.");
  const tickets: FootballTicket[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new FootballStorageError("Saved ticket index is malformed.");
    const raw = await command(["GET", key("ticket", browserId, id)]);
    if (typeof raw !== "string") throw new FootballStorageError("A saved ticket index entry has no ticket.");
    try { tickets.push(parseTicket(JSON.parse(raw))); } catch (error) {
      if (error instanceof FootballStorageError) throw error;
      throw new FootballStorageError("A saved ticket is malformed.");
    }
  }
  return tickets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createTelegramLink(browserId: string): Promise<{ code: string; expiresInSeconds: number }> {
  const code = randomBytes(8).toString("hex");
  const result = await command(["SET", key("link-code", code), browserId, "EX", 600, "NX"]);
  if (result !== "OK") throw new FootballStorageError("A unique account link could not be created; retry once.");
  return { code, expiresInSeconds: 600 };
}

export async function consumeTelegramLink(code: string, chatId: number): Promise<boolean> {
  const script = `
    local browserId = redis.call('GET', KEYS[1])
    if not browserId then return 0 end
    redis.call('DEL', KEYS[1])
    redis.call('SET', KEYS[2], browserId)
    return 1
  `;
  const result = await command(["EVAL", script, 2, key("link-code", code), key("telegram-link", String(chatId))]);
  return result === 1;
}

export async function getLinkedBrowserId(chatId: number): Promise<string | null> {
  const result = await command(["GET", key("telegram-link", String(chatId))]);
  if (result === null) return null;
  if (typeof result !== "string" || !validBrowserId(result)) throw new FootballStorageError("The saved Telegram link is malformed.");
  return result;
}
