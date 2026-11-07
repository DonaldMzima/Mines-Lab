"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useAppState } from "@/components/app-provider";
import type { SignalResult } from "@/lib/signals/types";

export function RoundLinkForm({ signal }: { signal: SignalResult }) {
  const { history, signals, evaluations, linkRound } = useAppState();
  const [roundId, setRoundId] = useState("");
  const [error, setError] = useState("");
  const evaluatedRoundIds = new Set(evaluations.flatMap((evaluation) => evaluation.roundId ? [evaluation.roundId] : []));
  const reservedRoundIds = new Set(signals.flatMap((item) => item.id !== signal.id && item.roundId ? [item.roundId] : []));
  const candidates = history.filter((round) =>
    round.gameId === signal.gameId && round.bombCount === signal.mineCount &&
    Date.parse(round.timestamp) > Date.parse(signal.createdAt) &&
    (!signal.roundId || signal.roundId === round.id) &&
    !evaluatedRoundIds.has(round.id) && !reservedRoundIds.has(round.id));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roundId) return;
    if (!window.confirm(`Confirm that imported round "${roundId}" belongs to signal "${signal.id}". This later association is retrospective and does not verify the source data.`)) return;
    try {
      linkRound(signal.id, roundId);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link this round.");
    }
  }

  return (
    <div className="round-link-form">
      {candidates.length ? <form onSubmit={submit}>
        <label htmlFor={`round-link-${signal.id}`}>Use an imported completed round</label>
        <select id={`round-link-${signal.id}`} className="settings-select" value={roundId} onChange={(event) => setRoundId(event.target.value)}>
          <option value="">Choose the matching round…</option>
          {candidates.map((round) => <option key={round.id} value={round.id}>{round.id} · {new Date(round.timestamp).toLocaleString()}</option>)}
        </select>
        <button className="secondary-button" type="submit" disabled={!roundId}>Confirm association and evaluate</button>
      </form> : <p className="small-disclaimer">Import the matching round in History to reuse its mine positions. {signal.roundId ? `Automatic matching requires round "${signal.roundId}", the same mine count, and a completion timestamp after this signal.` : "No matching round is available. Matching requires the same mine count and completion after this signal; you must confirm its identity."}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
