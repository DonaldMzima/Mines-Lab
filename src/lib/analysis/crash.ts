import { wilsonInterval } from "./evaluation";
export { wilsonInterval } from "./evaluation";
import type { GameId } from "../game-registry";
import { completedTimestamp, configured, number, percent, record, unavailable } from "./core";
import type { GameAnalyzer, JsonValue } from "./types";

export interface CrashHistoryRecord { roundId: string; completedAt: string; multiplier: number; source: "manual" | "import" }
export function parseCrashHistory(value: unknown): CrashHistoryRecord[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error("History must be an array of at most 5,000 completed records.");
  const seen = new Set<string>();
  return value.map((raw, i) => {
    const r = record(raw, `History record ${i + 1}`);
    if (typeof r.roundId !== "string" || r.roundId.trim().length === 0 || r.roundId.length > 200 || seen.has(r.roundId.trim())) throw new Error("Every history record needs a unique roundId of 1–200 characters.");
    const roundId = r.roundId.trim();
    seen.add(roundId);
    const completedAt = completedTimestamp(r.completedAt);
    const rawSource = r.source;
    if (rawSource !== "manual" && rawSource !== "import") throw new Error("History source must be manual or import; provider provenance is not verified.");
    const source: CrashHistoryRecord["source"] = rawSource === "manual" ? "manual" : "import";
    return { roundId, completedAt, multiplier: number(r.multiplier, "Completed multiplier", 1, 1e9), source };
  }).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
}
export const CRASH_PROFILES: Record<Extract<GameId, "lucky-jet" | "rocket-queen" | "rocket-x" | "aviator" | "speed-cash">, { label: string; reference: string; verifiedMechanics: string }> = {
  "lucky-jet": { label: "Lucky Jet", reference: "https://1win.com/", verifiedMechanics: "Rising multiplier crash game; exact multiplier law and payout limits unverified" },
  "rocket-queen": { label: "Rocket Queen", reference: "https://1win.com/", verifiedMechanics: "Rising multiplier crash game; exact multiplier law and payout limits unverified" },
  "rocket-x": { label: "Rocket X", reference: "https://1win.com/casino?provider=Pragmatic+Play", verifiedMechanics: "Operator describes an in-house high-altitude multiplier crash game; exact multiplier law, payout limits, and settlement remain unverified" },
  aviator: { label: "Aviator", reference: "https://www.spribe.co/games/aviator", verifiedMechanics: "SPRIBE increasing curve can crash; published RTP alone does not establish target survival probabilities" },
  "speed-cash": { label: "Speed & Cash", reference: "https://1win.com/", verifiedMechanics: "Two-car multiplier race; exact settlement, round grouping, and multiplier law unverified" },
};
export function crashAnalyzer(id: keyof typeof CRASH_PROFILES): GameAnalyzer {
  return input => {
    const profile = CRASH_PROFILES[id];
    const history = parseCrashHistory(input.history);
    const target = number(input.target, "Target multiplier", 1, 1e6);
    const metadata = { game: profile.label, ruleReference: profile.reference, verifiedMechanics: profile.verifiedMechanics };
    if (history.length === 0) return unavailable("Import completed rounds for historical analysis.", metadata, "No completed history supplied");
    const sorted = history.map(r => r.multiplier).sort((a, b) => a - b);
    const n = sorted.length;
    const hits = sorted.filter(m => m >= target).length;
    const strictlyAbove = sorted.filter(m => m > target).length;
    const fraction = hits / n;
    const details: Record<string, JsonValue> = { ...metadata, sampleSize: n, target, historicalAtOrAboveProbability: fraction, historicalStrictlyAboveProbability: strictlyAbove / n, historicalBelowProbability: 1 - fraction, historicalAtOrAboveCount: hits, wilson95: wilsonInterval(hits, n), mean: sorted.reduce((a, b) => a + b, 0) / n, median: n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, minimum: sorted[0], maximum: sorted[n - 1], firstCompletedAt: history[0].completedAt, lastCompletedAt: history[n - 1].completedAt, historicalGrossScenarioAtOrAbove: target * fraction, historicalGrossScenarioStrictlyAbove: target * strictlyAbove / n, provenance: "User-provided records, not provider-authenticated", independentValidation: false };
    return { ...configured(input, `${n} rounds · ${percent(fraction)} at or above ${target}×`, details, null,
      "Historical frequencies are descriptive, not next-round forecasts. Wilson intervals assume an independent representative sample. Payout scenarios assume a gross target payout without fees; equality settlement, sample completeness, and provider rules require evidence."), status: "experimental", source: `${profile.label} user-imported completed history; descriptive statistics` };
  };
}
