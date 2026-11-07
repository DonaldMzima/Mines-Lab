import { parseGameRound } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";

export type FairnessVerificationResult =
  | { status: "unavailable"; reason: string }
  | { status: "verified"; reason: string }
  | { status: "mismatch"; reason: string }
  | { status: "error"; reason: string };

export interface FairnessVerificationInput {
  round: GameRound;
  // A legitimately disclosed post-round seed is supplied only for this operation, never persisted here.
  disclosedServerSeed: string;
}

export interface ProviderFairnessVerifier {
  provider: "1win";
  gameId: string;
  algorithm: string;
  documentationUrl: string;
  verify(input: FairnessVerificationInput): Promise<FairnessVerificationResult>;
}

export class FairnessVerifierRegistry {
  private readonly verifiers = new Map<string, ProviderFairnessVerifier>();

  register(verifier: ProviderFairnessVerifier): void {
    if (verifier.provider !== "1win" || !verifier.gameId.trim() || !verifier.algorithm.trim()) {
      throw new Error("A fairness verifier needs an exact provider, game, and algorithm identifier.");
    }
    const url = new URL(verifier.documentationUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("A fairness verifier needs a public HTTPS algorithm documentation URL.");
    }
    const key = JSON.stringify([verifier.provider, verifier.gameId, verifier.algorithm]);
    if (this.verifiers.has(key)) throw new Error("A verifier is already registered for this provider algorithm.");
    this.verifiers.set(key, verifier);
  }

  find(gameId: string, algorithm: string): ProviderFairnessVerifier | undefined {
    return this.verifiers.get(JSON.stringify(["1win", gameId, algorithm]));
  }
}

export function getFairnessVerificationStatus(
  round: GameRound,
  registry?: FairnessVerifierRegistry,
): FairnessVerificationResult {
  if (!round.fairness) return { status: "unavailable", reason: "No fairness metadata was supplied for this round." };
  const algorithm = round.fairness.algorithm;
  if (!algorithm) return { status: "unavailable", reason: "The round has no provider algorithm identifier." };
  if (!registry?.find(round.gameId, algorithm)) {
    return { status: "unavailable", reason: `No documented provider verifier is configured for ${algorithm}. A commitment hash does not disclose the server seed.` };
  }
  return { status: "unavailable", reason: "Verification requires the legitimately disclosed post-round server seed. No disclosed seed is stored in this workspace." };
}

export async function verifyRoundFairness(
  input: FairnessVerificationInput,
  registry: FairnessVerifierRegistry,
): Promise<FairnessVerificationResult> {
  try {
    const round = parseGameRound(input.round);
    const algorithm = round.fairness?.algorithm;
    const verifier = algorithm ? registry.find(round.gameId, algorithm) : undefined;
    if (!verifier) return getFairnessVerificationStatus(round, registry);
    if (typeof input.disclosedServerSeed !== "string" || !input.disclosedServerSeed.trim()) {
      return { status: "unavailable", reason: "A legitimately disclosed post-round server seed is required." };
    }
    const result = await verifier.verify({ round, disclosedServerSeed: input.disclosedServerSeed });
    if (!["unavailable", "verified", "mismatch", "error"].includes(result.status) || typeof result.reason !== "string" || !result.reason.trim()) {
      return { status: "error", reason: "The provider verifier returned an invalid result." };
    }
    return result;
  } catch {
    // Verifier failures must not expose seed input or other implementation details in UI errors.
    return { status: "error", reason: "Fairness verification could not be completed. Check the round data and provider verifier." };
  }
}
