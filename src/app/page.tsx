"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppState } from "@/components/app-provider";
import { InlineSignals } from "@/components/inline-signals";
import { PenaltyWorkspace } from "@/components/penalty-workspace";
import { useBrowserGamePresence } from "@/components/use-browser-game-presence";
import { getGameConnectionStatus } from "@/lib/game-connection-status";
import { GAME_CATALOG, getGameDefinition } from "@/lib/game-registry";
import { SUPPORTED_BOMB_COUNTS, tileIndexToNumber, TOTAL_TILES } from "@/lib/mines";

export default function Home() {
  const {
    preferences, updatePreferences, connection, connectGame, demoConnection, connectDemo, disconnectDemo,
    startDemo, pauseDemo, resetDemo, tracking, history,
  } = useAppState();
  const browserGame = useBrowserGamePresence();
  const activeGame = getGameDefinition(preferences.activeGameId);
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

        <section className="simple-section" aria-labelledby="game-selector-heading">
          <h2 id="game-selector-heading">Games</h2>
          <div className="game-selector" role="list" aria-label="Game selector">
            {GAME_CATALOG.map((game) => <button key={game.id} type="button" role="listitem" className={`game-selector-item ${preferences.activeGameId === game.id ? "is-selected" : ""}`} aria-pressed={preferences.activeGameId === game.id} onClick={() => updatePreferences({ ...preferences, activeGameId: game.id })}>{game.name}<small>{game.availability === "implemented" ? "Available" : "Planned"}</small></button>)}
          </div>
          <p className="simple-help">Selected: <strong>{activeGame.name}</strong> · {activeGame.description}</p>
        </section>

        {activeGame.id === "mines" ? <>
        <section className="simple-section" aria-label="Connection controls">
          <div className="simple-actions">
            {!demoActive ? <button type="button" className="primary-button" onClick={connectDemo}>Connect Demo</button> : <button type="button" className="secondary-button" onClick={disconnectDemo}>Disconnect Demo</button>}
            {browserGame.status !== "game-detected"
              ? <button type="button" className="secondary-button" disabled={browserGame.status === "checking"} onClick={() => { void browserGame.check(); }}>Connect Game</button>
              : <button type="button" className="secondary-button" onClick={browserGame.disconnect}>Disconnect Game</button>}
          </div>
          {browserGame.status === "idle" && <p className="simple-help">Connect Game checks for the optional Chrome companion. It does not connect a live round-data feed.</p>}
          {browserGame.status === "checking" && <p className="simple-help">Checking the Chrome companion…</p>}
          {browserGame.status === "extension-unavailable" && <p className="simple-error" role="alert">Chrome companion not installed or this Mines Lab origin is not allowed.</p>}
          {browserGame.status === "permission-required" && <p className="simple-help">Permission required. Open the Mines Lab Companion extension and grant access to 1win tabs.</p>}
          {browserGame.status === "game-not-found" && <p className="simple-help">No supported 1win Mines page was detected.</p>}
          {browserGame.status === "game-detected" && <p className="simple-help">Game detected. No authentic round-data feed is connected.</p>}
          {browserGame.status === "disconnected" && <p className="simple-help">Game detection disconnected.</p>}
          {browserGame.status === "error" && <p className="simple-error" role="alert">The Chrome companion could not check for a game tab.</p>}
          {!connection.available && <p className="simple-help">Authentic live round data is unavailable.</p>}
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
        </> : activeGame.id === "penalty" ? <PenaltyWorkspace /> : <section className="simple-section" aria-label={`${activeGame.name} availability`}>
          <h2>{activeGame.name} analysis</h2>
          <p className="simple-result">This game is planned. No verified 1win identifier, game rules, authorized data source, completed-result feed, or validated prediction model is available.</p>
          <p className="simple-help">No connection or prediction controls are shown until a genuine supported capability exists.</p>
        </section>}
      </main>
    </div>
  );
}
