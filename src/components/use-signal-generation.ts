"use client";

import { useCallback } from "react";
import { useAppState } from "@/components/app-provider";
import { generateSignal } from "@/lib/signals/generator";
import { GAME_ID } from "@/lib/mines";

export function useSignalGeneration() {
  const { preferences, connection, demoConnection, tracking, addSignal } = useAppState();
  const round = tracking.currentRound;
  const sourceIsFresh = round?.source === "demo"
    ? demoConnection.status === "connected"
    : round?.source === "provider" && connection.state === "connected" && connection.dataVerified && !connection.stale;
  const activeRoundId = round?.status === "active" && round.mineCount === preferences.mineCount && sourceIsFresh
    ? round.id : undefined;

  const generate = useCallback((explicitRoundId?: string) => {
    const freshRoundId = activeRoundId && round && Date.now() - Date.parse(round.updatedAt) < preferences.connection.staleAfterSeconds * 1000
      ? activeRoundId : undefined;
    const roundId = explicitRoundId?.trim() || freshRoundId;
    const signal = generateSignal({
      gameId: GAME_ID, mineCount: preferences.mineCount, suggestedTileCount: preferences.suggestedTileCount,
      ...(roundId ? { roundId } : {}),
    });
    addSignal(signal);
    return signal;
  }, [activeRoundId, round, preferences, addSignal]);

  return { generate, activeRoundId };
}
