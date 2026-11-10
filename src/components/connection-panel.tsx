"use client";

import { useAppState } from "@/components/app-provider";
import { tileIndexToNumber } from "@/lib/mines";
import { useHelp } from "@/components/help-provider";
import { getGameConnectionStatus } from "@/lib/game-connection-status";

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "No data received";
}

export function ConnectionPanel() {
  const { openConnectionGuide } = useHelp();
  const { connection, providerConfig, tracking, connectProvider, disconnectProvider, preferences, lastImport } = useAppState();
  const round = tracking.currentRound;
  const busy = ["connecting", "connected", "reconnecting"].includes(connection.state);
  const gameStatus = getGameConnectionStatus(connection);
  return (
    <section id="game-connection" className="panel connection-panel history-section" aria-labelledby="provider-connection-heading">
      <div className="panel-heading"><div><div className="panel-kicker">READ-ONLY GAME DATA</div><h2 id="provider-connection-heading">Provider connection</h2></div><span className={`outlined-tag connection-${gameStatus}`}>{connection.available ? gameStatus : "unavailable · offline"}</span></div>
      <dl className="connection-details">
        <div><dt>Provider</dt><dd>1win Games · 1win Mines</dd></div>
        <div><dt>Supported mode</dt><dd>{providerConfig.supportedMode ?? "Unverified / unconfigured"}</dd></div>
        <div><dt>Transport</dt><dd>{providerConfig.transport ?? "Unconfigured"}</dd></div>
        <div><dt>Transport status (not data proof)</dt><dd>{connection.state}</dd></div>
        <div><dt>Game identifier</dt><dd>{providerConfig.gameId}</dd></div>
        <div><dt>Last observed round ID</dt><dd>{round?.id ?? "No round observed"}</dd></div>
        <div><dt>Last observed round status</dt><dd>{round ? `${round.status} · ${round.source === "provider" ? "provider adapter" : "user-provided record"}` : "Unknown; no start or result observed"}</dd></div>
        <div><dt>Known selections</dt><dd>{round?.selectedTiles.length ? round.selectedTiles.map(tileIndexToNumber).join(", ") : "No moves supplied"}</dd></div>
        <div><dt>Last provider data received</dt><dd>{date(connection.lastReceivedAt)}</dd></div>
        <div><dt>Last provider event time</dt><dd>{date(connection.lastEventAt)}</dd></div>
        <div><dt>Last local JSON import</dt><dd>{date(lastImport?.receivedAt)}</dd></div>
        <div><dt>Last completed round</dt><dd>{date(tracking.lastCompletedAt)}</dd></div>
        <div><dt>Last data / connection error</dt><dd>{connection.lastError ?? "None reported"}</dd></div>
        <div><dt>Last successful transport connection</dt><dd>{connection.lastConnectedAt ? date(connection.lastConnectedAt) : "Not connected in this session"}</dd></div>
      </dl>
      {connection.stale && <p className="notice" role="status">No recent game data within your {preferences.connection.staleAfterSeconds}-second freshness threshold. Transport status is {connection.state}; current-round information may be outdated.</p>}
      {!connection.available && <div id="connection-unavailable-reason"><p>No authorized live connector is available. Local JSON imports continue to work.</p><ul>{connection.unavailableReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
      {connection.available && <p>Only documented provider events can establish active rounds. A completed-only source does not establish when a round started. Disconnected information describes the last observation.</p>}
      <div className="connection-actions">
        <button className="secondary-button" disabled={!connection.available || busy} aria-describedby={!connection.available ? "connection-unavailable-reason" : undefined} onClick={connectProvider}>{!connection.available ? "Connection unavailable" : connection.state === "error" ? "Retry connection" : "Connect read-only source"}</button>
        <button className="secondary-button" disabled={!busy} onClick={disconnectProvider}>Disconnect</button>
        <button type="button" className="secondary-button" onClick={openConnectionGuide}>Connection Setup Guide</button>
      </div>
    </section>
  );
}
