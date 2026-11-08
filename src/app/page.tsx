"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppState } from "@/components/app-provider";
import { InlineSignals } from "@/components/inline-signals";
import { getGameConnectionStatus } from "@/lib/game-connection-status";
import { SUPPORTED_BOMB_COUNTS, tileIndexToNumber, TOTAL_TILES } from "@/lib/mines";

export default function Home() {
  const {
    preferences, updatePreferences, connection, connectGame, demoConnection, connectDemo, disconnectDemo,
    startDemo, pauseDemo, resetDemo, tracking, history,
  } = useAppState();
  const liveStatus = getGameConnectionStatus(connection);
  const demoActive = demoConnection.status !== "disconnected";
  const round = tracking.currentRound;
  const latestCompleted = useMemo(() => {
    const rounds = [...history, ...tracking.completedRounds.values()];
    return rounds.reduce<(typeof rounds)[number] | null>(
      (latest, item) => !latest || Date.parse(item.timestamp) > Date.parse(latest.timestamp) ? item : latest,
      null,
    );
  }, [history, tracking.completedRounds]);
  const status = demoConnection.status === "paused"
    ? "Demo paused"
    : demoActive
      ? "Demo Connected"
      : liveStatus === "connected"
        ? "Live Connected"
        : liveStatus === "error"
          ? "Error"
          : "Offline";
  const roundStatus = round?.status === "active" ? "Active" : round?.status === "completed" ? "Finished" : "Waiting";
  const hasCompletedDemoRound = [...tracking.completedRounds.values()].some((item) => item.source === "demo");
  const canStart = demoConnection.status === "connected" && !demoConnection.activeRoundId;
  const canPause = demoConnection.status === "connected" && Boolean(demoConnection.activeRoundId);

  return (
    <div className="simple-mines-page">
      <main className="simple-mines-card" aria-labelledby="mines-lab-title">
        <header className="simple-mines-header">
          <h1 id="mines-lab-title">Mines Lab</h1>
          <span className={`simple-status ${status === "Error" ? "is-error" : demoActive ? "is-demo" : liveStatus === "connected" ? "is-live" : ""}`} role="status">{status}</span>
        </header>

        <section className="simple-section" aria-label="Connection controls">
          <div className="simple-actions">
            {!demoActive ? <button type="button" className="primary-button" onClick={connectDemo}>Connect Demo</button> : <button type="button" className="secondary-button" onClick={disconnectDemo}>Disconnect Demo</button>}
            <button type="button" className="secondary-button" disabled={!connection.available || liveStatus === "connecting" || liveStatus === "connected"} onClick={() => { void connectGame(); }}>Connect Live</button>
          </div>
          {!connection.available && <p className="simple-help">Live connection isn’t available yet.</p>}
          {demoConnection.lastError && <p className="simple-error" role="alert">{demoConnection.lastError}</p>}
        </section>

        <section className="simple-section simple-round" aria-labelledby="round-heading">
          <div className="simple-round-heading"><h2 id="round-heading">Round: {roundStatus}</h2><span>{round?.source === "demo" ? "Demo data" : round?.source === "provider" ? "Live data" : "No round data"}</span></div>
          <div className="simple-round-facts"><p><strong>Round ID</strong><span>{round?.id ?? "—"}</span></p><p><strong>Mines</strong><span>{round?.mineCount ?? preferences.mineCount}</span></p></div>
          <div className="simple-board" role="grid" aria-label="Mines board">
            {Array.from({ length: TOTAL_TILES }, (_, index) => {
              const mine = round?.status === "completed" && round.revealedMines?.includes(index);
              const selected = round?.selectedTiles.includes(index) ?? false;
              const safe = round?.status === "completed" && selected && !mine;
              const state = mine ? "is-mine" : safe ? "is-safe" : selected ? "is-selected" : "";
              const description = mine ? "confirmed mine" : safe ? "confirmed safe selection" : selected ? "selected" : "unknown";
              return <div key={index} className={`simple-tile ${state}`} role="gridcell" aria-label={`Tile ${tileIndexToNumber(index)}, ${description}`}>{mine ? "💣" : String(tileIndexToNumber(index)).padStart(2, "0")}</div>;
            })}
          </div>
        </section>

        <section className="simple-section" aria-label="Round result">
          <h2>Last completed result</h2>
          <p className="simple-result">{latestCompleted ? `${latestCompleted.id} · ${latestCompleted.minePositions.length} mines · ${latestCompleted.result === "unknown" ? "Round finished" : latestCompleted.result.replace("_", " ")}` : "—"}</p>
        </section>

        <section className="simple-section" aria-label="Demo controls">
          <div className="simple-actions">
            <button type="button" className="primary-button" disabled={!canStart && demoConnection.status !== "paused"} onClick={() => startDemo(preferences.mineCount)}>{demoConnection.status === "paused" ? "Resume" : hasCompletedDemoRound ? "Next Round" : "Start Demo"}</button>
            <button type="button" className="secondary-button" disabled={!canPause} onClick={pauseDemo}>Pause</button>
            <button type="button" className="secondary-button" disabled={!demoActive} onClick={resetDemo}>Reset</button>
          </div>
          <label className="simple-mine-count">Demo mine count<select value={preferences.mineCount} onChange={(event) => updatePreferences({ ...preferences, mineCount: Number(event.target.value), suggestedTileCount: Math.min(preferences.suggestedTileCount, TOTAL_TILES - Number(event.target.value)) })}>{SUPPORTED_BOMB_COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        </section>

        <details className="simple-advanced"><summary>Advanced</summary><div><InlineSignals /><p><Link href="/signals">Signal history</Link><Link href="/history">Round history</Link><Link href="/settings">Settings</Link></p></div></details>
      </main>
    </div>
  );
}
