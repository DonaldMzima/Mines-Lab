import { configured, ev, number, percent } from "./core";
import type { GameAnalyzer } from "./types";

export const analyzeCoinflip: GameAnalyzer = (input) => {
  const heads = number(input.headsProbability, "Heads probability", 0, 1);
  const headsPayout = input.headsGrossPayout ?? input.grossPayout;
  const tailsPayout = input.tailsGrossPayout ?? input.grossPayout;
  return configured(input, `Heads ${percent(heads)} · Tails ${percent(1 - heads)}`, { headsProbability: heads, tailsProbability: 1 - heads, headsExpectedReturn: ev(heads, headsPayout), tailsExpectedReturn: ev(1 - heads, tailsPayout), ruleReference: "https://1win.com/casino?provider=Pragmatic+Play" }, null,
    "Configured independent flip probabilities and side-specific gross payouts, falling back to the common payout when a side is blank. The operator describes two outcomes with payouts varying by side; exact probabilities and payout values still require game evidence. No next-side forecast is available.");
};
