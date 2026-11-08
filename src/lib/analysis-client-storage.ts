import type { GameId } from "./game-registry";
import { validateGameInput } from "./analysis";
import { parseAnalysisRecord, parseCompletedGameResult, type AnalysisRecord, type CompletedGameResult } from "./analysis-records";

export interface SavedGameAnalysis {
  config: Record<string, unknown>;
  records: AnalysisRecord[];
  results: CompletedGameResult[];
}
const key = (id: GameId) => `mines-lab.analysis.v4.${id}`;

export function readGameAnalysis(gameId: GameId, fallback: Record<string, unknown>): SavedGameAnalysis {
  const saved = window.localStorage.getItem(key(gameId));
  if (!saved) return { config: fallback, records: [], results: [] };
  if (saved.length > 4_000_000) throw new Error("Saved game data exceeds the supported size. Export it before recovery.");
  const raw = JSON.parse(saved);
  if (raw?.version !== 1 || !raw.config || typeof raw.config !== "object" || Array.isArray(raw.config) || !Array.isArray(raw.records) || !Array.isArray(raw.results) || raw.records.length > 200 || raw.results.length > 200) throw new Error("Saved game data is invalid. The original data has been preserved.");
  const config = { ...fallback, ...raw.config };
  if (validateGameInput(gameId, config).length) throw new Error("Saved game settings are invalid. The original data has been preserved.");
  const records = raw.records.map(parseAnalysisRecord);
  const results = raw.results.map(parseCompletedGameResult);
  const linkedRounds = records.flatMap((r: AnalysisRecord) => r.signal.roundId ? [r.signal.roundId] : []);
  if (records.some((r: AnalysisRecord) => r.signal.gameId !== gameId) || results.some((r: CompletedGameResult) => r.gameId !== gameId) || new Set(records.map((r: AnalysisRecord) => r.id)).size !== records.length || new Set(linkedRounds).size !== linkedRounds.length || new Set(results.map((r: CompletedGameResult) => r.roundId)).size !== results.length) throw new Error("Saved data contains mixed games or duplicate identities. The original data has been preserved.");
  records.sort((a: AnalysisRecord, b: AnalysisRecord) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  results.sort((a: CompletedGameResult, b: CompletedGameResult) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  return { config, records, results };
}

export function writeGameAnalysis(gameId: GameId, state: SavedGameAnalysis) {
  window.localStorage.setItem(key(gameId), JSON.stringify({ version: 1, ...state }));
}

export function exportGameAnalysis(gameId: GameId) {
  const saved = window.localStorage.getItem(key(gameId)) ?? "{}";
  const url = URL.createObjectURL(new Blob([saved], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `mines-lab-${gameId}-analysis.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
