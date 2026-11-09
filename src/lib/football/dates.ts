import type { FootballPeriod } from "./types";
import { FootballProviderError } from "./errors";

export interface FootballDateRange { start: string; end: string }
export function validateDateRange(value: unknown, now = new Date()): FootballDateRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FootballProviderError("Choose a start and end date.", 400);
  const { start, end } = value as Record<string, unknown>;
  const valid = (date: unknown): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(start) || !valid(end) || start > end || start < timezoneDate(now)) throw new FootballProviderError("Choose valid calendar dates from today onward, with the end on or after the start.", 400);
  if (Date.parse(end) - Date.parse(start) > 89 * 86_400_000) throw new FootballProviderError("Choose at most 90 days per request to protect free-provider quotas. Dates can extend into the next month.", 400);
  return { start, end };
}

export function timezoneDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function dateOffset(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return timezoneDate(date);
}

export function periodRange(period: FootballPeriod): { start: string; end: string } {
  const today = timezoneDate(new Date());
  if (period === "today") return { start: today, end: today };
  if (period === "tomorrow") {
    const tomorrow = dateOffset(today, 1);
    return { start: tomorrow, end: tomorrow };
  }
  if (period === "week" || period === "next7") return { start: today, end: dateOffset(today, 6) };
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Johannesburg", weekday: "short" }).format(new Date(`${today}T12:00:00.000Z`));
  const daysUntilSaturday = weekday === "Sun" ? -1 : (6 - ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday) + 7) % 7;
  const start = dateOffset(today, daysUntilSaturday);
  return { start, end: dateOffset(start, 1) };
}

