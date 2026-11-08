import type { GameId } from "./game-registry";

export interface GameDataSourceStatus {
  gameId: GameId;
  status: "Not connected";
  live: false;
  manualImport: true;
  providerGameId: string | null;
  missing: readonly string[];
}

/** No source becomes connected merely because a browser tab or a token exists. */
export function getGameDataSourceStatus(gameId: GameId): GameDataSourceStatus {
  return {
    gameId, status: "Not connected", live: false, manualImport: true,
    providerGameId: gameId === "penalty" ? "v_1wingames:penalty" : gameId === "mines" ? "v_1wingames:mines" : null,
    missing: ["Authorized read-only export or feed", "Documented authentication and retention permission", "Versioned round/outcome schema with stable identifiers and timestamps"],
  };
}
