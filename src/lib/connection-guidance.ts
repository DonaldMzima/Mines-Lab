import type { ConnectionTestState, ProviderConnectionStatus } from "@/components/use-provider-connection";
import type { MinesProviderConfig } from "@/lib/provider-config";
import { getGameConnectionStatus } from "@/lib/game-connection-status";

export const LIVE_CONNECTION_NOT_CONFIGURED = "Live connection is not configured. You can continue using completed-round imports while an authorized integration is being established.";

export interface ConnectionGuidance {
  kind: "unavailable" | "not-configured" | "not-verified" | "verified";
  label: string;
  description: string;
  statusLabel: string;
}

export function getConnectionGuidance(
  config: MinesProviderConfig,
  connection: ProviderConnectionStatus,
  test?: ConnectionTestState,
): ConnectionGuidance {
  const gameStatus = getGameConnectionStatus(connection);
  const statusLabel = !connection.available
    ? "Not configured"
    : gameStatus === "connecting" ? "Checking game data"
      : gameStatus === "connected" ? "Connected"
        : gameStatus === "error" ? "Error" : "Disconnected";
  if (!connection.adapterImplemented) {
    return { kind: "unavailable", label: "Live connection unavailable", description: LIVE_CONNECTION_NOT_CONFIGURED, statusLabel };
  }
  if (config.availability === "unconfigured") {
    return {
      kind: "not-configured", label: "Connection setup incomplete", statusLabel,
      description: "A connector has been supplied, but its official connection details and access requirements have not been configured.",
    };
  }
  if (!connection.available) {
    return {
      kind: "not-configured", label: "Connection setup needs attention", statusLabel,
      description: "The source cannot be checked until the connection requirements below are resolved.",
    };
  }
  const result = test?.result;
  if (test?.status === "testing") {
    return {
      kind: "not-verified", label: "Checking read-only access", statusLabel,
      description: "The app is checking the supported source. Wait for the result to see which data access was established.",
    };
  }
  if (result && (test?.status === "error" || test?.status === "cancelled" || test?.status === "unavailable")) {
    return {
      kind: "not-verified", statusLabel,
      label: test.status === "error" ? "Source configured · check failed" : test.status === "cancelled" ? "Connection check cancelled" : "Source configured · check unavailable",
      description: result.message,
    };
  }
  if (test?.status === "success" && result?.status === "success" && result.transportConnected && (
    result.historyReadVerified || result.observedEvents.start || result.observedEvents.update || result.observedEvents.completed
  )) {
    return {
      kind: "verified", label: "Read-only access checked", statusLabel,
      description: connection.state === "connected"
        ? "The source passed a supported read-only check. The results below show which data was actually observed."
        : "A previous read-only check succeeded. The source is not currently connected; reconnect to receive new data.",
    };
  }
  return {
    kind: "not-verified", label: "Source configured · data access not checked", statusLabel,
    description: "The app has source details and a connector. A successful connection check is still needed; a connected transport alone does not establish round tracking.",
  };
}
