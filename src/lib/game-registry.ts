export const GAME_IDS = [
  "mines", "penalty", "blackjack", "hilo", "dice", "plinko", "keno", "towers",
  "coinflip", "poker", "lucky-jet", "rocket-queen", "rocket-x", "aviator", "speed-cash",
] as const;

export type GameId = (typeof GAME_IDS)[number];
export type GameAvailability = "implemented" | "planned";

export interface GameCapabilities {
  probabilityAnalysis: boolean;
  completedResults: boolean;
  liveData: boolean;
  predictions: boolean;
}

export interface GameDefinition {
  id: GameId;
  name: string;
  category: "table" | "instant" | "crash" | "cards";
  provider: "1win" | "SPRIBE" | "unverified";
  availability: GameAvailability;
  capabilities: GameCapabilities;
  description: string;
}

const configured = (id: Exclude<GameId, "mines" | "penalty">, name: string, category: GameDefinition["category"], description: string): GameDefinition => ({
  id, name, category, provider: id === "aviator" ? "SPRIBE" : ["lucky-jet", "rocket-queen", "rocket-x", "speed-cash", "coinflip"].includes(id) ? "1win" : "unverified", availability: "implemented",
  capabilities: { probabilityAnalysis: true, completedResults: true, liveData: false, predictions: false },
  description,
});

/**
 * Provider-specific identifiers are deliberately absent until official 1win
 * documentation and permission establish them. Capabilities describe existing
 * Mines Lab functionality, not potential future integrations.
 */
export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: "mines", name: "Mines", category: "instant", provider: "1win", availability: "implemented",
    capabilities: { probabilityAnalysis: true, completedResults: true, liveData: false, predictions: false },
    description: "Local probability analysis, experimental suggestions, and validated local completed-round records.",
  },
  {
    id: "penalty", name: "Penalty", category: "instant", provider: "1win", availability: "implemented",
    capabilities: { probabilityAnalysis: true, completedResults: true, liveData: false, predictions: false },
    description: "Supplied Turbo/Series scoring probabilities. Direction signal unavailable.",
  },
  configured("blackjack", "Blackjack", "cards", "Hand evaluation and strategy for the supported configured rules."),
  configured("hilo", "Hilo", "cards", "Higher/lower comparison from the supplied card distribution."),
  configured("dice", "Dice", "instant", "Exact integer-threshold probability for your configured range."),
  configured("plinko", "Plinko", "instant", "Configured board distribution and gross-payout analysis."),
  configured("keno", "Keno", "instant", "Combinatorial match probabilities for your configured pool."),
  configured("towers", "Towers", "instant", "Survival analysis for your configured row layouts."),
  configured("coinflip", "Coinflip", "instant", "Probability and gross-payout analysis; no winning-side forecast."),
  configured("poker", "Poker", "cards", "Standard high-hand ranking and supported exact card analysis."),
  configured("lucky-jet", "Lucky Jet", "crash", "Statistics from imported completed multipliers."),
  configured("rocket-queen", "Rocket Queen", "crash", "Statistics from imported completed multipliers."),
  configured("rocket-x", "Rocket X", "crash", "Statistics from user-supplied completed multipliers."),
  configured("aviator", "Aviator", "crash", "Statistics from imported completed multipliers."),
  configured("speed-cash", "Speed & Cash", "crash", "Statistics from imported completed race multipliers."),
];

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_IDS.some((id) => id === value);
}

export function getGameDefinition(id: GameId): GameDefinition {
  const game = GAME_CATALOG.find((item) => item.id === id);
  if (!game) throw new Error(`Unknown game "${id}".`);
  return game;
}
