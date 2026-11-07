"use client";

import { useAppState } from "@/components/app-provider";
import { getGameConnectionStatus } from "@/lib/game-connection-status";

export function DataStatus() {
  const { history, lastImport, tracking, connection } = useAppState();
  const latest = history.reduce<string | null>((timestamp, round) =>
    timestamp === null || Date.parse(round.timestamp) > Date.parse(timestamp) ? round.timestamp : timestamp, null);
  const completedAt = tracking.lastCompletedAt ?? latest;
  const gameStatus = getGameConnectionStatus(connection);
  return (
    <div className="source-status data-status">
      <span className={`status-dot connection-${gameStatus}`} />
      <span><strong>{connection.available ? `1win · ${gameStatus}${connection.stale ? " · stale data" : ""}` : "Unavailable · offline"}</strong>
        <small>{connection.available ? "Read-only provider adapter" : "User-provided data · no authorized live source"}</small>
        <small>Last completed round: {completedAt ? new Date(completedAt).toLocaleString() : "none"}</small>
        {connection.lastError && <small>Last error: {connection.lastError}</small>}
        {lastImport && <small>Last import: {lastImport.added} added · {lastImport.rejected} rejected · {lastImport.evaluated} evaluated</small>}
      </span>
    </div>
  );
}
