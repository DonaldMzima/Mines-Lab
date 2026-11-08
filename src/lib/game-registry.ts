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
  provider: "1win";
  availability: GameAvailability;
  capabilities: GameCapabilities;
  description: string;
}

const planned = (id: Exclude<GameId, "mines" | "penalty">, name: string, category: GameDefinition["category"]): GameDefinition => ({
  id, name, category, provider: "1win", availability: "planned",
  capabilities: { probabilityAnalysis: false, completedResults: false, liveData: false, predictions: false },
  description: "No verified game rules, provider identifier, or authorized data source has been established.",
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
    capabilities: { probabilityAnalysis: true, completedResults: false, liveData: false, predictions: false },
    description: "Verified Turbo/Series theoretical scoring probabilities and displayed Series multipliers; no direction prediction or live data.",
  },
  planned("blackjack", "Blackjack", "cards"),
  planned("hilo", "Hilo", "cards"),
  planned("dice", "Dice", "instant"),
  planned("plinko", "Plinko", "instant"),
  planned("keno", "Keno", "instant"),
  planned("towers", "Towers", "instant"),
  planned("coinflip", "Coinflip", "instant"),
  planned("poker", "Poker", "cards"),
  planned("lucky-jet", "Lucky Jet", "crash"),
  planned("rocket-queen", "Rocket Queen", "crash"),
  planned("rocket-x", "Rocket X", "crash"),
  planned("aviator", "Aviator", "crash"),
  planned("speed-cash", "Speed & Cash", "instant"),
];

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_IDS.some((id) => id === value);
}

export function getGameDefinition(id: GameId): GameDefinition {
  const game = GAME_CATALOG.find((item) => item.id === id);
  if (!game) throw new Error(`Unknown game "${id}".`);
  return game;
}
