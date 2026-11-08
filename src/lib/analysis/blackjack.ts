import { bool, choice, configured, unavailable } from "./core";
import type { GameAnalyzer } from "./types";

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
function rank(value: unknown): number {
  const card = choice(value, "Card rank", ranks);
  return card === "A" ? 11 : ["J", "Q", "K"].includes(card) ? 10 : Number(card);
}
export const analyzeBlackjack: GameAnalyzer = (input) => {
  choice(input.profile, "Profile", ["multi-deck-s17-das"]);
  if (!Array.isArray(input.cards) || input.cards.length > 21) throw new Error("Cards must be an array of at most 21 rank strings.");
  bool(input.canDouble, "Can double"); bool(input.canSplit, "Can split"); bool(input.afterSplit, "After split");
  const splitAces = bool(input.splitAces, "Split aces");
  const cards = input.cards.map(rank);
  const dealer = input.dealer === null || input.dealer === "" ? null : rank(input.dealer);
  if (cards.length === 1) throw new Error("At least two player cards are required.");
  if (cards.length === 0 || dealer === null) return unavailable("Enter your cards and the dealer upcard.");
  let total = cards.reduce((a, b) => a + b, 0);
  let aces = cards.filter(c => c === 11).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = aces > 0;
  if (splitAces) {
    if (input.afterSplit !== true || !cards.includes(11)) throw new Error("A split-ace hand must be marked afterSplit and contain an ace.");
    if (cards.length !== 2) throw new Error("This profile gives split aces exactly one additional card.");
    return configured(input, "Split-ace hand complete", { total, soft, handComplete: true }, null,
      "This profile does not allow hitting split aces. Resplit-ace decisions need a separately verified table rule.");
  }
  if (input.afterSplit === true && cards.includes(11) && input.splitAces === undefined) return unavailable("Confirm whether this is a split-ace hand before requesting an action.");
  if (total >= 21) return configured(input, total > 21 ? "BUST" : "21 — hand complete", { total, soft, handComplete: true });
  const double = input.canDouble === true && cards.length === 2;
  const pair = cards.length === 2 && cards[0] === cards[1] ? cards[0] : null;
  let action = "HIT";
  if (soft) {
    if (total >= 19) action = "STAND";
    else if (total === 18) action = dealer >= 9 ? "HIT" : "STAND";
    if (double && (([13, 14].includes(total) && dealer >= 5 && dealer <= 6) || ([15, 16].includes(total) && dealer >= 4 && dealer <= 6) || ([17, 18].includes(total) && dealer >= 3 && dealer <= 6))) action = "DOUBLE";
  } else {
    if (total >= 17 || (total >= 13 && dealer <= 6) || (total === 12 && dealer >= 4 && dealer <= 6)) action = "STAND";
    if (double && ((total === 9 && dealer >= 3 && dealer <= 6) || (total === 10 && dealer <= 9) || (total === 11 && dealer <= 10))) action = "DOUBLE";
  }
  if (input.canSplit === true && pair !== null && (
    pair === 11 || pair === 8 ||
    ([2, 3, 7].includes(pair) && dealer <= 7) ||
    (pair === 4 && [5, 6].includes(dealer)) ||
    (pair === 6 && dealer <= 6) ||
    (pair === 9 && (dealer <= 6 || [8, 9].includes(dealer)))
  )) action = "SPLIT";
  return configured(input, `${soft ? "Soft" : "Hard"} ${total} vs ${dealer === 11 ? "A" : dealer}`, { total, soft, profile: "4–8 decks; dealer stands soft 17; double any first two; DAS; dealer peek; no surrender; no hit split aces", recommendedAction: input.rulesConfirmed === true ? action : null,
    ruleReference: "https://www.blackjackapprenticeship.com/wp-content/uploads/2024/09/S17-Basic-Strategy.pdf" }, action,
    "Basic strategy for this exact profile. Confirm the rules and valid actions against the actual table. Split-ace hands are excluded: they are normally complete after one card.");
};
