"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_ID, TOTAL_TILES } from "@/lib/mines";
import type { MinesRoundEvent } from "@/lib/round-tracker";

export interface DemoConnectionState {
  status: "disconnected" | "connected" | "paused";
  activeRoundId: string | null;
  lastError: string | null;
}

interface DemoSession {
  id: string;
  mineCount: number;
  mines: number[];
  safeSelections: number[];
  nextStep: number;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffledTiles(): number[] {
  const tiles = Array.from({ length: TOTAL_TILES }, (_, index) => index);
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [tiles[index], tiles[swap]] = [tiles[swap], tiles[index]];
  }
  return tiles;
}

/** A local demo source. It never reads or writes 1win data and never performs gameplay actions. */
export function useDemoMines(onRoundEvent: (event: MinesRoundEvent) => void) {
  const [connection, setConnection] = useState<DemoConnectionState>({ status: "disconnected", activeRoundId: null, lastError: null });
  const callback = useRef(onRoundEvent);
  const session = useRef<DemoSession | null>(null);
  const timer = useRef<number | null>(null);
  const advanceRef = useRef<() => void>(() => {});

  useEffect(() => { callback.current = onRoundEvent; }, [onRoundEvent]);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const disconnect = useCallback(() => {
    clearTimer();
    session.current = null;
    setConnection({ status: "disconnected", activeRoundId: null, lastError: null });
  }, [clearTimer]);

  const advance = useCallback(() => {
    const current = session.current;
    if (!current) return;
    try {
      if (current.nextStep < current.safeSelections.length) {
        const selectedTiles = current.safeSelections.slice(0, current.nextStep + 1);
        callback.current({
          type: "round-update", roundId: current.id, gameId: GAME_ID,
          occurredAt: new Date().toISOString(), selectedTiles,
        });
        current.nextStep += 1;
        timer.current = window.setTimeout(() => advanceRef.current(), 700);
        return;
      }
      const completedAt = new Date().toISOString();
      callback.current({
        type: "round-completed", occurredAt: completedAt,
        round: {
          id: current.id, gameId: GAME_ID, timestamp: completedAt,
          bombCount: current.mineCount, minePositions: current.mines,
          selectedPositions: current.safeSelections, result: "unknown", source: "demo",
        },
      });
      session.current = null;
      timer.current = null;
      setConnection((prior) => ({ ...prior, status: "connected", activeRoundId: null }));
    } catch (error) {
      clearTimer();
      session.current = null;
      setConnection((prior) => ({ ...prior, status: "connected", activeRoundId: null, lastError: error instanceof Error ? error.message : "Demo round could not continue." }));
    }
  }, [clearTimer]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);

  const start = useCallback((mineCount: number) => {
    if (connection.status === "disconnected") {
      setConnection((prior) => ({ ...prior, lastError: "Connect Demo before starting a round." }));
      return;
    }
    if (connection.status === "paused") {
      setConnection((prior) => ({ ...prior, status: "connected", lastError: null }));
      timer.current = window.setTimeout(() => advanceRef.current(), 0);
      return;
    }
    if (session.current) return;
    const shuffled = shuffledTiles();
    const mines = shuffled.slice(0, mineCount).sort((first, second) => first - second);
    const safeSelections = shuffled.filter((tile) => !mines.includes(tile)).slice(0, 3);
    const next: DemoSession = { id: createId(), mineCount, mines, safeSelections, nextStep: 0 };
    session.current = next;
    try {
      callback.current({ type: "round-start", roundId: next.id, gameId: GAME_ID, occurredAt: new Date().toISOString(), mineCount: next.mineCount, selectedTiles: [] });
      setConnection({ status: "connected", activeRoundId: next.id, lastError: null });
      timer.current = window.setTimeout(() => advanceRef.current(), 700);
    } catch (error) {
      session.current = null;
      setConnection((prior) => ({ ...prior, lastError: error instanceof Error ? error.message : "Demo round could not start." }));
    }
  }, [advance, connection.status]);

  const pause = useCallback(() => {
    if (!session.current || connection.status !== "connected") return;
    clearTimer();
    setConnection((prior) => ({ ...prior, status: "paused" }));
  }, [clearTimer, connection.status]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { demoConnection: connection, connectDemo: () => setConnection({ status: "connected", activeRoundId: null, lastError: null }), disconnectDemo: disconnect, startDemo: start, pauseDemo: pause, resetDemo: disconnect };
}
