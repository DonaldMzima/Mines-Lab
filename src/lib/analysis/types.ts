import type { GameId } from "../game-registry";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type AnalysisInput = Record<string, unknown>;
export interface GameSignal {
  gameId: GameId;
  gameMode?: string;
  roundId?: string;
  action: string | null;
  status: "validated" | "experimental" | "unavailable";
  source: string;
  generatedAt: string;
  summary: string;
  explanation?: string;
  details: Record<string, JsonValue>;
}
export type GameAnalyzer = (input: AnalysisInput) => Omit<GameSignal, "gameId" | "generatedAt" | "roundId">;
export interface GameField {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "json" | "boolean";
  options?: string[];
  help?: string;
}
