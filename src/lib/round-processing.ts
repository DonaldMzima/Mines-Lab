import { roundsEquivalent } from "@/lib/mines";
import type { GameRound } from "@/lib/mines";
import { evaluateSignal } from "@/lib/signals/evaluator";
import type { SignalEvaluation, SignalResult } from "@/lib/signals/types";

export function evaluateImportedRound(
  signal: SignalResult,
  round: GameRound,
  association: "precommitted" | "confirmed",
): SignalEvaluation {
  if (signal.gameId !== round.gameId || signal.mineCount !== round.bombCount) {
    throw new Error("The signal and round must have the same game and mine count.");
  }
  if (signal.roundId && signal.roundId !== round.id) {
    throw new Error("This signal was recorded for a different round identifier.");
  }
  if (association === "precommitted" && signal.roundId !== round.id) {
    throw new Error("Automatic evaluation requires a round identifier recorded with the original signal.");
  }
  if (Date.parse(signal.createdAt) >= Date.parse(round.timestamp)) {
    throw new Error("The round completion timestamp must be after signal generation. Check the supplied timestamps.");
  }
  return { ...evaluateSignal(signal, round.minePositions), roundId: round.id, association };
}

export function reconcileRoundEvaluations(
  history: GameRound[],
  signals: SignalResult[],
  evaluations: SignalEvaluation[],
): { evaluations: SignalEvaluation[]; evaluated: number; issues: string[] } {
  const next = [...evaluations];
  const evaluatedSignals = new Set(evaluations.map((item) => item.signalId));
  const evaluatedRounds = new Set(evaluations.flatMap((item) => item.roundId ? [item.roundId] : []));
  const issues: string[] = [];
  for (const round of history) {
    if (evaluatedRounds.has(round.id)) {
      const prior = evaluations.find((item) => item.roundId === round.id);
      if (prior && [...prior.actualMinePositions].sort((a, b) => a - b).join(",") !== [...round.minePositions].sort((a, b) => a - b).join(",")) {
        issues.push(`Round "${round.id}" conflicts with an earlier evaluation. The original evaluation was preserved; check the source data.`);
      }
      continue;
    }
    const candidates = signals.filter((signal) => signal.roundId === round.id);
    if (candidates.length > 1) {
      issues.push(`Round "${round.id}" matches multiple signals; automatic evaluation was skipped.`);
      continue;
    }
    const signal = candidates[0];
    if (!signal || evaluatedSignals.has(signal.id)) continue;
    try {
      next.unshift(evaluateImportedRound(signal, round, "precommitted"));
      evaluatedSignals.add(signal.id);
      evaluatedRounds.add(round.id);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `Round "${round.id}" could not be evaluated.`);
    }
  }
  return { evaluations: next, evaluated: next.length - evaluations.length, issues };
}

export function mergeCompletedRounds(
  history: GameRound[],
  incoming: GameRound[],
  limit: number,
): { history: GameRound[]; added: number; duplicates: number; notStored: number; conflicts: string[] } {
  const known = new Map(history.map((round) => [round.id, round]));
  const added: GameRound[] = [];
  const conflicts: string[] = [];
  let duplicates = 0;
  let notStored = 0;
  for (const round of incoming) {
    const prior = known.get(round.id);
    if (prior) {
      if (roundsEquivalent(prior, round)) duplicates += 1;
      else conflicts.push(`Round "${round.id}" already has a different saved result; it was not overwritten.`);
      continue;
    }
    known.set(round.id, round);
    if (history.length + added.length >= limit) notStored += 1;
    else added.push(round);
  }
  return {
    history: [...added, ...history].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    added: added.length,
    duplicates,
    notStored,
    conflicts,
  };
}
