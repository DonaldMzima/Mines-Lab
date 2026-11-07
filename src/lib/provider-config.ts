import { GAME_ID } from "@/lib/mines";

export const MINES_INTEGRATION_KEY = "vgsonewin2_mines";

interface ProviderIdentity {
  provider: "1win";
  gameId: typeof GAME_ID;
  integrationKey: typeof MINES_INTEGRATION_KEY;
}

export interface ProviderDocumentation {
  overviewUrl: string;
  authenticationUrl: string;
  subscriptionsUrl: string;
  roundSchemaUrl: string;
  rateLimitsUrl: string;
  accessPermissionReference: string;
}

interface DocumentedProviderDetails extends ProviderIdentity {
  availability: "documented";
  authenticationMethod: "none" | "official-oauth" | "official-api-key";
  supportedMode: "demo" | "real" | "both";
  supportsLiveRounds: boolean;
  supportsCompletedRounds: boolean;
  documentation: ProviderDocumentation;
}

export type MinesProviderConfig =
  | (ProviderIdentity & {
      availability: "unconfigured";
      transport?: never;
      apiBaseUrl?: never;
      websocketUrl?: never;
      authenticationMethod?: never;
      supportedMode?: never;
      supportsLiveRounds?: never;
      supportsCompletedRounds?: never;
      documentation?: never;
    })
  | (DocumentedProviderDetails & { transport: "http"; apiBaseUrl: string; websocketUrl?: never })
  | (DocumentedProviderDetails & { transport: "websocket"; websocketUrl: string; apiBaseUrl?: never });

export const DEFAULT_MINES_PROVIDER_CONFIG: MinesProviderConfig = {
  provider: "1win",
  gameId: GAME_ID,
  integrationKey: MINES_INTEGRATION_KEY,
  availability: "unconfigured",
};

export const PROVIDER_CONNECTION_BLOCKERS = [
  "An official read-only endpoint and supported transport have not been established.",
  "An official authentication flow and permission for independent applications have not been established.",
  "Documented subscriptions and round-start, update, and completion schemas are missing.",
  "Stable round identifiers, terminal-state meanings, and replay behavior need provider confirmation.",
  "Rate limits and retry requirements are unknown.",
  "Supported demo and real-money modes have not been verified.",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) {
    throw new Error(`Provider ${name} must contain non-empty text of at most 2,000 characters.`);
  }
  return value.trim();
}

function publicUrl(value: unknown, name: string, protocol: "https:" | "wss:" = "https:"): string {
  const text = textField(value, name);
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(`Provider ${name} must be a valid URL.`); }
  if (url.protocol !== protocol || url.username || url.password || url.search || url.hash) {
    throw new Error(`Provider ${name} must use ${protocol} without credentials, query parameters, or fragments.`);
  }
  return url.href;
}

/** Validates configuration only; documented values still require provider authorization and a real adapter. */
export function parseMinesProviderConfig(value: unknown): MinesProviderConfig {
  if (!isRecord(value)) throw new Error("Provider configuration must be an object.");
  const allowed = new Set([
    "provider", "gameId", "integrationKey", "availability", "transport", "apiBaseUrl", "websocketUrl",
    "authenticationMethod", "supportedMode", "supportsLiveRounds", "supportsCompletedRounds", "documentation",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("Provider configuration contains unsupported fields. Credentials must not be supplied.");
  }
  if (value.provider !== "1win" || value.gameId !== GAME_ID || value.integrationKey !== MINES_INTEGRATION_KEY) {
    throw new Error("Unsupported provider, game identifier, or integration key.");
  }
  if (value.availability === "unconfigured") {
    if (Object.keys(value).some((key) => !["provider", "gameId", "integrationKey", "availability"].includes(key))) {
      throw new Error("Unknown provider requirements must remain absent while the provider is unconfigured.");
    }
    return { ...DEFAULT_MINES_PROVIDER_CONFIG };
  }
  if (value.availability !== "documented") throw new Error("Provider availability must be unconfigured or documented.");
  if (value.authenticationMethod !== "none" && value.authenticationMethod !== "official-oauth" && value.authenticationMethod !== "official-api-key") {
    throw new Error("A documented official authentication method is required.");
  }
  if (value.supportedMode !== "demo" && value.supportedMode !== "real" && value.supportedMode !== "both") {
    throw new Error("A documented supported game mode is required.");
  }
  if (typeof value.supportsLiveRounds !== "boolean" || typeof value.supportsCompletedRounds !== "boolean") {
    throw new Error("Documented live-round and completed-round capabilities are required.");
  }
  const docs = value.documentation;
  if (!isRecord(docs) || Object.keys(docs).some((key) => ![
    "overviewUrl", "authenticationUrl", "subscriptionsUrl", "roundSchemaUrl", "rateLimitsUrl", "accessPermissionReference",
  ].includes(key))) throw new Error("Documented provider references are required; credential fields are unsupported.");
  const details: DocumentedProviderDetails = {
    provider: "1win", gameId: GAME_ID, integrationKey: MINES_INTEGRATION_KEY, availability: "documented",
    authenticationMethod: value.authenticationMethod, supportedMode: value.supportedMode,
    supportsLiveRounds: value.supportsLiveRounds, supportsCompletedRounds: value.supportsCompletedRounds,
    documentation: {
      overviewUrl: publicUrl(docs.overviewUrl, "documentation overview"),
      authenticationUrl: publicUrl(docs.authenticationUrl, "authentication documentation"),
      subscriptionsUrl: publicUrl(docs.subscriptionsUrl, "subscription documentation"),
      roundSchemaUrl: publicUrl(docs.roundSchemaUrl, "round schema documentation"),
      rateLimitsUrl: publicUrl(docs.rateLimitsUrl, "rate-limit documentation"),
      accessPermissionReference: textField(docs.accessPermissionReference, "access-permission reference"),
    },
  };
  if (value.transport === "http" && value.websocketUrl === undefined) {
    return { ...details, transport: "http", apiBaseUrl: publicUrl(value.apiBaseUrl, "API base URL") };
  }
  if (value.transport === "websocket" && value.apiBaseUrl === undefined) {
    return { ...details, transport: "websocket", websocketUrl: publicUrl(value.websocketUrl, "WebSocket URL", "wss:") };
  }
  throw new Error("Configure exactly one documented HTTP or WebSocket transport.");
}

export function getProviderConnectionBlockers(config: MinesProviderConfig = DEFAULT_MINES_PROVIDER_CONFIG): string[] {
  if (config.availability === "unconfigured") return [...PROVIDER_CONNECTION_BLOCKERS];
  // Structural configuration readiness only; the caller must also supply an authorized adapter.
  parseMinesProviderConfig(config);
  if (!config.supportsLiveRounds && !config.supportsCompletedRounds) {
    return ["The documented source supports neither live-round events nor completed-round data."];
  }
  return [];
}
