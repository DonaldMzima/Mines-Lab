import { choice, configured, numbers, percent, unavailable } from "./core";
import type { GameAnalyzer } from "./types";

export const POKER_CATEGORIES = ["High card", "One pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"] as const;
interface Card { rank: number; suit: string; code: string }
function parseCard(value: unknown): Card {
  if (typeof value !== "string" || !/^(?:[2-9TJQKA]|10)[SHDC]$/i.test(value)) throw new Error("Cards must use standard rank+suit, for example AS, 10H, or TD.");
  const code = value.toUpperCase().replace("10", "T");
  return { rank: "23456789TJQKA".indexOf(code[0]) + 2, suit: code[1], code };
}
export function rankPokerHand(codes: unknown[]): { category: number; name: string; tiebreak: number[] } {
  if (codes.length !== 5) throw new Error("Five cards are required.");
  const cards = codes.map(parseCard);
  if (new Set(cards.map(c => c.code)).size !== cards.length) throw new Error("Duplicate cards are not allowed.");
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  ranks.forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const straightHigh = counts.size === 5 ? ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join(",") === "14,5,4,3,2" ? 5 : 0 : 0;
  let category: number;
  let tiebreak: number[];
  if (flush && straightHigh) { category = 8; tiebreak = [straightHigh]; }
  else if (groups[0][1] === 4) { category = 7; tiebreak = groups.map(g => g[0]); }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { category = 6; tiebreak = groups.map(g => g[0]); }
  else if (flush) { category = 5; tiebreak = ranks; }
  else if (straightHigh) { category = 4; tiebreak = [straightHigh]; }
  else if (groups[0][1] === 3) { category = 3; tiebreak = groups.map(g => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { category = 2; tiebreak = groups.map(g => g[0]); }
  else if (groups[0][1] === 2) { category = 1; tiebreak = groups.map(g => g[0]); }
  else { category = 0; tiebreak = ranks; }
  return { category, name: category === 8 && straightHigh === 14 ? "Royal flush" : POKER_CATEGORIES[category], tiebreak };
}
export const analyzePoker: GameAnalyzer = (input) => {
  choice(input.variant, "Poker variant", ["five-card"]);
  if (!Array.isArray(input.cards) || input.cards.length > 5) throw new Error("Cards must contain zero or five standard cards.");
  const discards = numbers(input.discardIndexes ?? [], "Discard indexes", 2, 0, 4, true);
  if (new Set(discards).size !== discards.length) throw new Error("Discard indexes must be unique.");
  if (input.cards.length === 0) return unavailable("Enter five cards to rank the hand or analyze up to two replacements.");
  const cards = input.cards.map(parseCard);
  const ranking = rankPokerHand(input.cards);
  const counts = POKER_CATEGORIES.map(() => 0);
  const deck = [..."SHDC"].flatMap(s => [..."23456789TJQKA"].map(r => `${r}${s}`)).filter(c => !cards.some(card => card.code === c));
  const held = cards.filter((_, i) => !discards.includes(i)).map(c => c.code);
  let outcomes = 0;
  const visit = (selected: string[], start: number) => {
    if (selected.length === discards.length) { counts[rankPokerHand([...held, ...selected]).category]++; outcomes++; return; }
    for (let i = start; i < deck.length; i++) visit([...selected, deck[i]], i + 1);
  };
  visit([], 0);
  const distribution = counts.map((count, category) => ({ category: POKER_CATEGORIES[category], count, probability: count / outcomes }));
  const strongerCategoryProbability = counts.reduce((s, count, category) => s + (category > ranking.category ? count : 0), 0) / outcomes;
  return configured(input, discards.length ? `${percent(strongerCategoryProbability)} chance of a higher category` : ranking.name.toUpperCase(), { hand: ranking.name, category: ranking.category, tiebreak: ranking.tiebreak, distribution, enumeratedOutcomes: outcomes, discardIndexes: discards, strongerCategoryProbability,
    ruleReference: "https://www.pokerstars.com/poker/games/rules/" }, null,
    "Standard 52-card five-card high poker only. Exact category probabilities for the chosen zero, one, or two replacements; all five original cards excluded from the draw. Hand strength is not betting advice, and higher category ignores improvements within the same category.");
};
