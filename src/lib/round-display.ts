import type { GameRound } from "@/lib/mines";

export function formatRoundCashout(round: GameRound): string {
  if (round.cashoutAmount === undefined) return "—";
  const amount = new Intl.NumberFormat("en", { maximumFractionDigits: 20 }).format(round.cashoutAmount);
  if (round.mode === "real" && round.currency) return `${amount} ${round.currency} · reported real mode`;
  if (round.mode === "demo") return `${amount}${round.currency ? ` ${round.currency}` : " units"} · demo`;
  return `${amount} units · mode/currency unverified`;
}
