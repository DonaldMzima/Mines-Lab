import type { ConnectionStatus } from "@/lib/game-data-adapter";

export type GameConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function getGameConnectionStatus(
  connection: { available: boolean; state: ConnectionStatus; dataVerified: boolean },
): GameConnectionStatus {
  if (!connection.available) return "disconnected";
  if (connection.state === "error") return "error";
  if (connection.state === "connecting" || connection.state === "reconnecting") return "connecting";
  if (connection.state === "connected") return connection.dataVerified ? "connected" : "connecting";
  return "disconnected";
}
