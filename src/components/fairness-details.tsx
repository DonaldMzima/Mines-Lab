"use client";

import type { GameRound } from "@/lib/mines";
import { getFairnessVerificationStatus } from "@/lib/fairness";

export function FairnessDetails({ round }: { round: GameRound }) {
  const fairness = round.fairness;
  const verification = getFairnessVerificationStatus(round);
  const fields = [
    ["Algorithm", fairness?.algorithm],
    ["Seed reference", fairness?.seedId],
    ["Server seed hash", fairness?.serverSeedHash],
    ["Client seed", fairness?.clientSeed],
    ["Nonce", fairness?.nonce],
    ["Cursor", fairness?.cursor],
    ["Bytes used", fairness?.bytesUsed],
    ["Provider state code", round.providerState],
  ] as const;

  return (
    <details className="fairness-details">
      <summary>Fairness and provider metadata</summary>
      <dl className="fairness-metadata">
        {fields.filter(([, value]) => value !== undefined).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      {round.providerState !== undefined && <p>State code retained as supplied; its meaning is not inferred.</p>}
      <p><strong>Verification unavailable.</strong> {verification.reason}</p>
      <p>Metadata from an imported round is not proof of authenticity or knowledge of future mine positions.</p>
    </details>
  );
}
