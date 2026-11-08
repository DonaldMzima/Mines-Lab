import { isGameId, type GameId } from "./game-registry";
import { analyzeGame, validateGameInput, type GameSignal } from "./analysis";
import { completedTimestamp } from "./analysis/core";

export interface AnalysisRecord {
  id: string;
  signal: GameSignal;
  input: Record<string, unknown>;
  recordedAt: string;
}

/** Canonical user-entered records, never an undocumented provider payload. */
export interface CompletedGameResult {
  gameId: GameId;
  roundId: string;
  completedAt: string;
  source: "manual";
  data: Record<string, unknown>;
}

export interface GameEvaluation {
  recordId: string;
  gameId: GameId;
  roundId: string;
  success: boolean;
  predictedProbability: number;
  brierScore: number;
  evaluatedAt: string;
  provenance: "manual";
  independent: false;
}

export function parseAnalysisRecord(value: unknown): AnalysisRecord {
  const raw = object(value);
  const signal = object(raw.signal);
  if (!isGameId(signal.gameId) || typeof signal.status !== "string" || !["validated", "experimental", "unavailable"].includes(signal.status) || !(signal.action === null || typeof signal.action === "string" && signal.action.length <= 200)) throw new Error("Invalid saved signal contract.");
  text(signal.summary, "signal summary"); text(signal.source, "signal source");
  timestamp(signal.generatedAt, "generatedAt");
  if (signal.gameMode !== undefined) text(signal.gameMode, "gameMode");
  if (signal.explanation !== undefined && (typeof signal.explanation !== "string" || signal.explanation.length > 10_000)) throw new Error("Invalid saved signal explanation.");
  if (signal.roundId !== undefined) text(signal.roundId, "roundId");
  object(signal.details);
  if (JSON.stringify(raw).length > 100_000) throw new Error("Saved analysis record is too large.");
  const recordedAt = timestamp(raw.recordedAt, "recordedAt");
  if (Date.parse(signal.generatedAt as string) > Date.parse(recordedAt)) throw new Error("Signal generation must precede its stored timestamp.");
  const input = object(raw.input);
  if (validateGameInput(signal.gameId, input).length) throw new Error("Saved analysis inputs are invalid. The original record was preserved.");
  return { id: text(raw.id, "id"), signal: signal as unknown as GameSignal, input, recordedAt };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error(`${field} must contain 1–200 characters.`);
  return value.trim();
}
function integer(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  return value;
}
function flag(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
  return value;
}
function timestamp(value: unknown, field: string): string {
  return completedTimestamp(value, field);
}
function uniqueNumbers(value: unknown, min: number, max: number, limit: number, field: string, minimumLength = 1): number[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > limit) throw new Error(`${field} requires ${minimumLength}–${limit} numbers.`);
  const values = value.map(v => integer(v, min, max, field));
  if (new Set(values).size !== values.length) throw new Error(`${field} must be unique.`);
  return values.sort((a, b) => a - b);
}

export function parseCompletedGameResult(value: unknown): CompletedGameResult {
  const raw = object(value);
  if (!isGameId(raw.gameId)) throw new Error("Unknown gameId.");
  if (raw.source !== "manual") throw new Error("Only source: manual is accepted. Provider provenance requires an authorized adapter.");
  const roundId = text(raw.roundId, "roundId");
  const completedAt = timestamp(raw.completedAt, "completedAt");
  const data = object(raw.data);
  let parsed: Record<string, unknown>;
  switch (raw.gameId) {
    case "mines": parsed = { minePositions: uniqueNumbers(data.minePositions, 0, 24, 24, "minePositions") }; break;
    case "penalty": {
      if (data.mode !== "turbo" && data.mode !== "series") throw new Error("Penalty mode must be turbo or series.");
      parsed = { mode: data.mode, step: integer(data.step, 1, data.mode === "turbo" ? 1 : 5, "step"), scored: flag(data.scored, "scored") }; break;
    }
    case "blackjack":
      if (typeof data.outcome !== "string" || !["win", "loss", "push"].includes(data.outcome)) throw new Error("Blackjack outcome must be win, loss, or push.");
      parsed = { outcome: data.outcome }; break;
    case "hilo": parsed = { rank: integer(data.rank, 1, 13, "rank (A=1, K=13)") }; break;
    case "dice": parsed = { value: integer(data.value, -1e6, 2e6, "value") }; break;
    case "coinflip":
      if (data.side !== "heads" && data.side !== "tails") throw new Error("Coinflip side must be heads or tails.");
      parsed = { side: data.side }; break;
    case "plinko": parsed = { slot: integer(data.slot, 0, 64, "slot") }; break;
    case "keno": parsed = { drawnNumbers: uniqueNumbers(data.drawnNumbers, 1, 100, 100, "drawnNumbers", 0) }; break;
    case "towers": parsed = { survived: flag(data.survived, "survived"), steps: integer(data.steps, 1, 32, "steps") }; break;
    case "poker": {
      if (!Array.isArray(data.cards) || data.cards.length !== 5 || !data.cards.every(c => typeof c === "string" && /^(?:[2-9TJQKA]|10)[cdhs]$/i.test(c))) throw new Error("Supported five-card Poker requires exactly five cards such as As, Td, 7c.");
      const cards = data.cards.map((c: string) => c.toUpperCase().replace(/^10/, "T"));
      if (new Set(cards).size !== cards.length) throw new Error("Poker cards must be unique.");
      parsed = { cards }; break;
    }
    default:
      if (typeof data.multiplier !== "number" || !Number.isFinite(data.multiplier) || data.multiplier < 1 || data.multiplier > 1e9) throw new Error("Completed multiplier must be between 1 and 1,000,000,000.");
      parsed = { multiplier: data.multiplier };
  }
  return { gameId: raw.gameId, roundId, completedAt, source: "manual", data: parsed };
}

/** Returns a probability-event comparison, never a strategy win-rate claim. */
export function evaluateGameRecord(record: AnalysisRecord, result: CompletedGameResult): GameEvaluation | null {
  const { signal, input } = record;
  if (signal.gameId !== result.gameId) throw new Error("Result and signal games differ.");
  if (!signal.roundId) return null;
  if (signal.roundId !== result.roundId) throw new Error("Result and signal round IDs differ.");
  if (!Number.isFinite(Date.parse(record.recordedAt)) || !Number.isFinite(Date.parse(signal.generatedAt)) || Date.parse(record.recordedAt) >= Date.parse(result.completedAt) || Date.parse(signal.generatedAt) >= Date.parse(result.completedAt)) throw new Error("Record the signal before the completed result.");
  let success: boolean;
  let probability: unknown;
  const checked = analyzeGame(signal.gameId, input);
  if (checked.details.validationErrors || checked.action !== signal.action) throw new Error("Saved analysis does not match the recorded inputs under the current engine. Evaluation was skipped.");
  const details = checked.details;
  switch (signal.gameId) {
    case "penalty":
      if (result.data.mode !== input.mode || result.data.step !== input.step) throw new Error("Penalty mode and step do not match.");
      success = result.data.scored === true; probability = details.scoringProbability; break;
    case "hilo": {
      if (signal.action !== "HIGHER" && signal.action !== "LOWER") return null;
      const next = result.data.rank as number;
      const rank = input.currentRank as number;
      const counts = input.rankCounts;
      if (!Array.isArray(counts) || typeof counts[next - 1] !== "number" || counts[next - 1] <= 0) throw new Error("Completed Hilo rank was absent from the recorded remaining deck.");
      success = signal.action === "HIGHER" ? next > rank : next < rank;
      if (next === rank) success = input.ties === "win";
      probability = signal.action === "HIGHER" ? details.higherWinProbability : details.lowerWinProbability; break;
    }
    case "dice": {
      const value = result.data.value as number;
      if (value < (input.min as number) || value > (input.max as number)) throw new Error("Completed die is outside the recorded range.");
      success = input.direction === "under" ? value < (input.threshold as number) : value > (input.threshold as number);
      probability = details.probability; break;
    }
    case "keno": {
      const drawn = result.data.drawnNumbers as number[];
      if (drawn.length !== input.drawn || drawn.some(n => n > (input.pool as number))) throw new Error("Keno result does not match the recorded pool and draw count.");
      const selected = input.selections as number[];
      success = selected.every(n => drawn.includes(n));
      const distribution = details.distribution;
      if (!Array.isArray(distribution)) return null;
      const entry = distribution.find(row => row !== null && typeof row === "object" && !Array.isArray(row) && row.hits === selected.length);
      probability = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.probability : null; break;
    }
    case "towers":
      if (result.data.steps !== input.steps) throw new Error("Towers step count does not match the recorded forecast.");
      success = result.data.survived === true; probability = details.survivalProbability; break;
    default: return null;
  }
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  return { recordId: record.id, gameId: signal.gameId, roundId: result.roundId, success, predictedProbability: probability, brierScore: (probability - Number(success)) ** 2, evaluatedAt: new Date().toISOString(), provenance: "manual", independent: false };
}

export function summarizeEvaluations(evaluations: GameEvaluation[]) {
  const n = evaluations.length;
  if (n === 0) return null;
  if (new Set(evaluations.map(e => e.recordId)).size !== n || new Set(evaluations.map(e => `${e.gameId}:${e.roundId}`)).size !== n || new Set(evaluations.map(e => e.gameId)).size !== 1) throw new Error("Summarize distinct rounds from one game at a time.");
  const successes = evaluations.filter(e => e.success).length;
  const p = successes / n;
  const z = 1.959963984540054;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { samples: n, successes, failures: n - successes, observedRate: p, meanBaseline: evaluations.reduce((s, e) => s + e.predictedProbability, 0) / n, meanBrierScore: evaluations.reduce((s, e) => s + e.brierScore, 0) / n, wilson95: [Math.max(0, center - radius), Math.min(1, center + radius)] as [number, number] };
}
