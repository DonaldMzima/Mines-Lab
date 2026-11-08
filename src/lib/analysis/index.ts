import { GAME_IDS, isGameId, type GameId } from "../game-registry";
import { bool, record, unavailable } from "./core";
import { analyzeMines } from "./mines";
import { analyzePenalty } from "./penalty";
import { analyzeBlackjack } from "./blackjack";
import { analyzeHilo } from "./hilo";
import { analyzeDice } from "./dice";
import { analyzePlinko } from "./plinko";
import { analyzeKeno } from "./keno";
import { analyzeTowers } from "./towers";
import { analyzeCoinflip } from "./coinflip";
import { analyzePoker } from "./poker";
import { analyzeLuckyJet } from "./lucky-jet";
import { analyzeRocketQueen } from "./rocket-queen";
import { analyzeRocketX } from "./rocket-x";
import { analyzeAviator } from "./aviator";
import { analyzeSpeedCash } from "./speed-cash";
import type { AnalysisInput, GameAnalyzer, GameField, GameSignal } from "./types";

export type { AnalysisInput, GameField, GameSignal, JsonValue } from "./types";
export const ANALYSIS_VERSION = "4.0.0";
export const GAME_INPUT_DEFAULTS: Record<GameId, AnalysisInput> = {
  mines: { mines: 3, picks: 3, rulesConfirmed: false },
  penalty: { mode: "series", step: 1 },
  blackjack: { cards: [], dealer: null, profile: "multi-deck-s17-das", canDouble: true, canSplit: true, afterSplit: false, splitAces: false, rulesConfirmed: false },
  hilo: { currentRank: null, rankCounts: Array.from({ length: 13 }, () => 4), ties: "lose", rulesConfirmed: false },
  dice: { min: 0, max: 99, threshold: 50, direction: "under", grossPayout: 1.9, rulesConfirmed: false },
  plinko: { rows: 8, rightProbability: 0.5, payouts: [5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5], rulesConfirmed: false },
  keno: { pool: 80, drawn: 20, selections: [1, 2, 3, 4, 5], payouts: {}, rulesConfirmed: false },
  towers: { rows: [{ tiles: 3, hazards: 1 }, { tiles: 3, hazards: 1 }, { tiles: 3, hazards: 1 }], steps: 1, grossPayout: null, rulesConfirmed: false },
  coinflip: { headsProbability: 0.5, grossPayout: 1.9, headsGrossPayout: null, tailsGrossPayout: null, rulesConfirmed: false },
  poker: { variant: "five-card", cards: [], discardIndexes: [], rulesConfirmed: false },
  "lucky-jet": { history: [], target: 2, rulesConfirmed: false },
  "rocket-queen": { history: [], target: 2, rulesConfirmed: false },
  "rocket-x": { history: [], target: 2, rulesConfirmed: false },
  aviator: { history: [], target: 2, rulesConfirmed: false },
  "speed-cash": { history: [], target: 2, rulesConfirmed: false },
};

const confirmed: GameField = { key: "rulesConfirmed", label: "I have checked this configuration against the game's rules", type: "boolean", help: "Confirms your configuration, not provider verification or predictive accuracy." };
const crashFields: GameField[] = [
  { key: "target", label: "Historical threshold (×)", type: "number" },
  { key: "history", label: "Completed round records", type: "json", help: 'Array of {roundId, completedAt, multiplier, source:"manual"|"import"}. Never future rounds.' },
];
export const GAME_FIELDS: Record<GameId, GameField[]> = {
  mines: [{ key: "mines", label: "Mines", type: "number" }, { key: "picks", label: "Picks", type: "number" }],
  penalty: [{ key: "mode", label: "Mode", type: "select", options: ["turbo", "series"] }, { key: "step", label: "Step", type: "number" }],
  blackjack: [
    { key: "cards", label: "Your card ranks", type: "json", help: 'Example format: ["A","6"]. Enter the actual hand.' },
    { key: "dealer", label: "Dealer upcard", type: "text", help: "A, 2–10, J, Q, or K" },
    { key: "profile", label: "Rule profile", type: "select", options: ["multi-deck-s17-das"], help: "4–8 decks, S17, DAS, dealer peek, no surrender, double any first two, no hit split aces." },
    { key: "canDouble", label: "Double is currently allowed", type: "boolean" },
    { key: "canSplit", label: "Split is currently allowed", type: "boolean" },
    { key: "afterSplit", label: "This hand was split", type: "boolean" },
    { key: "splitAces", label: "This is a split-ace hand", type: "boolean" }, confirmed,
  ],
  hilo: [{ key: "currentRank", label: "Current rank (A=1, K=13)", type: "number" }, { key: "rankCounts", label: "Remaining counts, A through K", type: "json", help: "13 counts. Exclude all observed cards if drawing without replacement." }, { key: "ties", label: "Equal rank", type: "select", options: ["lose", "push", "win"] }, confirmed],
  dice: [{ key: "min", label: "Minimum integer", type: "number" }, { key: "max", label: "Maximum integer", type: "number" }, { key: "threshold", label: "Threshold", type: "number" }, { key: "direction", label: "Strict comparison", type: "select", options: ["under", "over"] }, { key: "grossPayout", label: "Gross win payout (×)", type: "number" }, confirmed],
  plinko: [{ key: "rows", label: "Rows", type: "number" }, { key: "rightProbability", label: "Right probability (0–1)", type: "number" }, { key: "payouts", label: "Gross payouts, left to right", type: "json", help: "One entry per bucket: rows + 1. Example defaults are not verified 1win payouts." }, confirmed],
  keno: [{ key: "pool", label: "Number pool", type: "number" }, { key: "drawn", label: "Numbers drawn", type: "number" }, { key: "selections", label: "Selected numbers", type: "json" }, { key: "payouts", label: "Gross payout by hit count", type: "json", help: 'Example format: {"0":0,"1":0,...}. Include every possible hit count for EV.' }, confirmed],
  towers: [{ key: "rows", label: "Row layouts", type: "json", help: 'Array of {tiles:3,hazards:1}. Confirm independent uniformly located hazards.' }, { key: "steps", label: "Rows to survive", type: "number" }, { key: "grossPayout", label: "Optional gross payout (×)", type: "number" }, confirmed],
  coinflip: [{ key: "headsProbability", label: "Heads probability (0–1)", type: "number" }, { key: "grossPayout", label: "Common gross win payout (×)", type: "number" }, { key: "headsGrossPayout", label: "Optional Heads gross payout (×)", type: "number", help: "Overrides the common payout for Heads. Blank uses the common payout." }, { key: "tailsGrossPayout", label: "Optional Tails gross payout (×)", type: "number", help: "Overrides the common payout for Tails. Blank uses the common payout." }, confirmed],
  poker: [{ key: "variant", label: "Variant", type: "select", options: ["five-card"] }, { key: "cards", label: "Five actual cards", type: "json", help: 'Example format: ["AS","KH","QD","JC","10S"]. No duplicates.' }, { key: "discardIndexes", label: "Replacement indexes (0–4)", type: "json", help: "Choose zero, one, or two card indexes to enumerate exact replacement probabilities." }, confirmed],
  "lucky-jet": crashFields, "rocket-queen": crashFields, "rocket-x": crashFields, aviator: crashFields, "speed-cash": crashFields,
};
const analyzers: Record<GameId, GameAnalyzer> = { mines: analyzeMines, penalty: analyzePenalty, blackjack: analyzeBlackjack, hilo: analyzeHilo, dice: analyzeDice, plinko: analyzePlinko, keno: analyzeKeno, towers: analyzeTowers, coinflip: analyzeCoinflip, poker: analyzePoker, "lucky-jet": analyzeLuckyJet, "rocket-queen": analyzeRocketQueen, "rocket-x": analyzeRocketX, aviator: analyzeAviator, "speed-cash": analyzeSpeedCash };

export function getDefaultInput(gameId: GameId): AnalysisInput {
  if (!isGameId(gameId)) throw new Error("Unsupported game.");
  return JSON.parse(JSON.stringify(GAME_INPUT_DEFAULTS[gameId])) as AnalysisInput;
}
function checkedInput(value: unknown): AnalysisInput {
  const input = record(value);
  bool(input.rulesConfirmed, "Rules confirmed");
  if (input.roundId !== undefined && (typeof input.roundId !== "string" || input.roundId.trim().length === 0 || input.roundId.length > 200)) throw new Error("Round ID must be text of 1–200 characters.");
  return typeof input.roundId === "string" ? { ...input, roundId: input.roundId.trim() } : input;
}
export function validateGameInput(gameId: GameId, value: unknown): string[] {
  try {
    if (!isGameId(gameId)) throw new Error("Unsupported game.");
    analyzers[gameId](checkedInput(value));
    return [];
  } catch (error) { return [error instanceof Error ? error.message : "Invalid game configuration."]; }
}
export function analyzeGame(gameId: GameId, value: unknown): GameSignal {
  if (!isGameId(gameId)) throw new Error("Unsupported game.");
  const generatedAt = new Date().toISOString();
  try {
    const input = checkedInput(value);
    const result = analyzers[gameId](input);
    return { ...result, gameId, generatedAt, ...(typeof input.roundId === "string" ? { roundId: input.roundId } : {}), details: { ...result.details, analysisVersion: ANALYSIS_VERSION } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid game configuration.";
    return { ...unavailable("Check the game settings.", { validationErrors: [message] }), gameId, generatedAt, explanation: message };
  }
}
export function isAnalysisSupported(gameId: unknown): gameId is GameId { return GAME_IDS.some(id => id === gameId); }
