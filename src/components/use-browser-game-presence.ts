"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const NAMESPACE = "mines-lab-companion";
const VERSION = 1;
const REQUEST_TYPE = "detect-game";
const RESPONSE_TYPE = "game-presence";
const REQUEST_TIMEOUT_MS = 2_500;
const RECHECK_INTERVAL_MS = 8_000;

export type BrowserGamePresenceStatus =
  | "idle"
  | "checking"
  | "extension-unavailable"
  | "permission-required"
  | "game-not-found"
  | "game-detected"
  | "disconnected"
  | "error";

interface CompanionResponse {
  namespace: typeof NAMESPACE;
  version: typeof VERSION;
  type: typeof RESPONSE_TYPE;
  requestId: string;
  status: Exclude<BrowserGamePresenceStatus, "idle" | "checking" | "extension-unavailable" | "disconnected">;
}

function requestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `companion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCompanionResponse(value: unknown): value is CompanionResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return response.namespace === NAMESPACE && response.version === VERSION && response.type === RESPONSE_TYPE &&
    typeof response.requestId === "string" &&
    (response.status === "permission-required" || response.status === "game-not-found" || response.status === "game-detected" || response.status === "error");
}

export function useBrowserGamePresence() {
  const [status, setStatus] = useState<BrowserGamePresenceStatus>("idle");
  const requestInFlight = useRef(false);

  const check = useCallback(async (): Promise<BrowserGamePresenceStatus> => {
    if (requestInFlight.current) return status;
    requestInFlight.current = true;
    setStatus("checking");
    const id = requestId();
    try {
      const response = await new Promise<CompanionResponse>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", listener);
          reject(new Error("The Mines Lab companion did not respond."));
        }, REQUEST_TIMEOUT_MS);
        const listener = (event: MessageEvent<unknown>) => {
          if (event.source !== window || event.origin !== window.location.origin || !isCompanionResponse(event.data) || event.data.requestId !== id) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", listener);
          resolve(event.data);
        };
        window.addEventListener("message", listener);
        window.postMessage({ namespace: NAMESPACE, version: VERSION, type: REQUEST_TYPE, requestId: id }, window.location.origin);
      });
      setStatus(response.status);
      return response.status;
    } catch {
      setStatus("extension-unavailable");
      return "extension-unavailable";
    } finally {
      requestInFlight.current = false;
    }
  }, [status]);

  const disconnect = useCallback(() => setStatus("disconnected"), []);

  useEffect(() => {
    if (status !== "game-detected") return;
    const interval = window.setInterval(() => { void check(); }, RECHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [check, status]);

  return { status, check, disconnect };
}
