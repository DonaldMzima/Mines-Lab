export type SignalSource = "experimental" | "verified";

export interface SignalRequest {
  gameId: string;
  mineCount: number;
  suggestedTileCount: number;
  roundId?: string;
}

export interface SignalResult {
  id: string;
  createdAt: string;
  gameId: string;
  mineCount: number;
  suggestedTiles: number[];
  method: string;
  source: SignalSource;
  confidence: number | null;
  roundId?: string;
}

export interface SignalEvaluation {
  signalId: string;
  actualMinePositions: number[];
  correctSelections: number;
  incorrectSelections: number;
  survivedAllSelections: boolean;
  evaluatedAt: string;
  roundId?: string;
  association?: "precommitted" | "confirmed";
}

export interface SignalGroupStats {
  mineCount: number;
  suggestedTileCount: number;
  generated: number;
  evaluated: number;
  successful: number;
  expectedSuccessRate: number;
  observedSuccessRate: number | null;
  successInterval: [number, number] | null;
}

export interface SignalStatistics {
  totalGenerated: number;
  totalEvaluated: number;
  successful: number;
  failed: number;
  observedSuccessRate: number | null;
  expectedSuccessRate: number | null;
  unevaluated: number;
  precommittedEvaluated: number;
  groups: SignalGroupStats[];
}
