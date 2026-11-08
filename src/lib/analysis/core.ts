import type { AnalysisInput, GameSignal, JsonValue } from "./types";

export function record(value: unknown, name = "Input"): AnalysisInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as AnalysisInput;
}
export function number(value: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a finite number"} from ${min} to ${max}.`);
  }
  return value;
}
export function choice<T extends string>(value: unknown, name: string, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(`${name} must be ${choices.join(" or ")}.`);
  return value as T;
}
export function bool(value: unknown, name: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
  return value;
}
export function numbers(value: unknown, name: string, maxLength: number, min: number, max: number, integer = false): number[] {
  if (!Array.isArray(value) || value.length > maxLength) throw new Error(`${name} must be an array with at most ${maxLength} items.`);
  return value.map((v, i) => number(v, `${name}[${i}]`, min, max, integer));
}
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) value = value * (n - i + 1) / i;
  return value;
}
export function percent(p: number): string { return `${(p * 100).toFixed(2)}%`; }
export function completedTimestamp(value: unknown, name = "Completed timestamp"): string {
  if (typeof value !== "string" || value.length > 40) throw new Error(`${name} must be a bounded ISO timestamp with a timezone.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error(`${name} must be an ISO timestamp with seconds and a timezone.`);
  const [, y, m, d, h, minute, second] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59 || !Number.isFinite(Date.parse(value))) throw new Error(`${name} contains an invalid date or time.`);
  if (Date.parse(value) > Date.now()) throw new Error(`${name} cannot be in the future.`);
  return new Date(value).toISOString();
}
export function ev(probability: number, grossPayout: unknown): Record<string, JsonValue> {
  if (grossPayout === undefined || grossPayout === null) return {};
  const payout = number(grossPayout, "Gross payout", 0, 1e9);
  return { grossPayout: payout, grossExpectedReturn: probability * payout, netExpectedReturn: probability * payout - 1 };
}
export function configured(input: AnalysisInput, summary: string, details: Record<string, JsonValue>, action: string | null = null, explanation?: string): Omit<GameSignal, "gameId" | "generatedAt" | "roundId"> {
  const confirmed = bool(input.rulesConfirmed, "Rules confirmed");
  return {
    action: confirmed ? action : null,
    status: confirmed ? "validated" : "experimental",
    source: confirmed ? "User-confirmed rule configuration; mathematical analysis only" : "Unconfirmed example rule configuration",
    summary,
    explanation: explanation ?? "Calculations apply only to the configured model. The 1win variant and live state are not independently verified.",
    details: { ...details, rulesConfirmed: confirmed, providerVerified: false, connectionStatus: "Not connected", accuracy: "Not evaluated" },
  };
}
export function unavailable(summary: string, details: Record<string, JsonValue> = {}, source = "No verified observable game state"): Omit<GameSignal, "gameId" | "generatedAt" | "roundId"> {
  return { action: null, status: "unavailable", source, summary, details: { ...details, connectionStatus: "Not connected", accuracy: "Not evaluated" } };
}
export function payoutTable(value: unknown, maxIndex: number): Record<number, number> {
  const raw = record(value ?? {}, "Payouts");
  const result: Record<number, number> = {};
  for (const [key, payout] of Object.entries(raw)) {
    if (!/^\d+$/.test(key)) throw new Error("Payout keys must be non-negative integer hit counts.");
    const index = number(Number(key), "Payout hit count", 0, maxIndex, true);
    result[index] = number(payout, `Payout for ${key}`, 0, 1e9);
  }
  return result;
}
