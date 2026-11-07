# Round lifecycle integration contract

This is an internal provider-independent contract, not an official 1win protocol. There is no configured live source. Do not send these structures to an invented provider endpoint.

## Authorized adapter boundary

`GameDataAdapter` retains completed-round snapshots and subscriptions. Optional `onRoundEvent(listener)` accepts normalized lifecycle events after a real adapter maps an officially documented source. The adapter must be read-only, cancel pending work on disconnect, make connect/disconnect idempotent, and resolve `connect()` only after a real connected state is established. Any provider-specific retry/backoff must obey documented limits; the application does not guess those limits.

Create an adapter inside a Client Component and supply it with a matching validated documented `MinesProviderConfig` to `AppProvider`. Replace or reconfigure the adapter consistently when configuration changes. No adapter object can be serialized through a Next.js Server Component boundary. The existing layout supplies neither an adapter nor endpoint, so live access remains unavailable.

The default config preserves only observed identity values. The documented branch requires one transport/endpoint, an official authentication method, known mode/capabilities, and references for authorization, events, schema, and limits. Those references are configuration validation, not a technical proof that authorization exists. No secret/token fields are accepted or persisted by this configuration.

## Normalized events

Every non-terminal event includes `roundId`, `gameId`, and a valid `occurredAt`. Use timezone-qualified ISO timestamps to avoid clock ambiguity. Optional `eventId` must be stable within the subscription stream; optional `sequence` must be a non-negative safe integer ordered within the round. Source adapters must document their event identity/sequence semantics rather than deriving them from an arbitrary counter.

- `round-start` establishes active status and `startedAt` for an explicit genuine round ID.
- `round-update` carries the full or additional known `selectedTiles` and optional mine count, fairness metadata, mode, currency, raw provider state, and non-terminal status. Selections accumulate without rewriting earlier observations. An update alone cannot establish that a start was detected. Explicit pending remains pending; otherwise no observed start means unknown status.
- `round-completed` contains `round`, a validated canonical `GameRound`. Its `timestamp` is completion time. An optional event `occurredAt` must agree with that time. Only this event or a canonical completed-round input establishes completion; a state code is never sufficient.

Completed `GameRound` data uses zero-based positions, an exact ID, target game ID, completion timestamp, supported `bombCount`, complete unique `minePositions`, optional `selectedPositions`, and explicit `result`. Optional mode is `demo`, `real`, or `unknown`. Amounts retain reported units only; balances are validated when supplied in the observed response envelope and discarded. No account balance or credential is persisted.

`LiveMinesRound` holds observed status, outcome, known selections, optional revealed completed mines, observed start/completion/update timestamps, source, optional mode/currency/cashout, fairness metadata, and raw provider state. It never fills hidden mines for an active round.

## Processing and ordering

The engine parses external values again at its boundary. IDs are never invented. Duplicate events do not create another history/evaluation row. Conflicting event IDs, sequences, mine counts, commitments, completed outcomes, or attempts to reopen a completed round are rejected or reported. Older updates cannot regress newer observations. Raw fairness cursor/byte counters are preserved without inventing algorithm meanings.

A valid terminal result merges previously observed selections and fairness fields, then passes through the existing completed-round ingestion path. Original saved results and evaluations cannot be replaced by conflicting later outcomes. Signal association requires exact precommitted identity and compatible game/count/timestamps; explicit later associations remain retrospective. A fresh observed active provider round can supply the generation form's ID automatically. No new signal can be generated for a completed ID retained by the session ledger.

Initial history/snapshots can contain completed rounds only. Rehydration never creates start timestamps. A historical snapshot cannot replace a more recent current observation. Each new genuine ID can progress independently; no manual application reset or synthetic round counter is used.

Detailed tracker state is capped at 1,000 rounds; old completed details can be retired before unfinished rounds. Event signatures are capped at 2,000, while completed-ID tombstones remain for the session to prevent reopening retired IDs. Replays outside retained detail are ignored with an explanation. Completed history remains limited to 500 persisted records and signals to 1,000. Valid received outcomes may still evaluate linked signals when history capacity prevents saving another round. Active state is transient; a reload requires an authorized replay/snapshot to recover it.

## Status and freshness

The connection hook exposes disconnected, connecting, connected, reconnecting, and error. Availability additionally requires documented config and an injected authorized adapter. Missing documentation does not produce a pretend connection attempt.

Receipt time and event time are distinct. Freshness uses the older of the latest receipt/event times, so retransmitting old data does not make its event time fresh. A local timer checks age only while connected/reconnecting; it sends no network requests. Staleness warns that observations may be outdated and does not assert that a quiet transport has failed. Auto-connect is a non-sensitive preference, disabled for an unavailable source. Error retry is explicit; no speculative polling or retry loop exists.

## Verification boundary

The engine and integration were statically reviewed, not executed. Live start/update/completion behavior cannot be verified against 1win until official access and fixtures exist. No mock events are presented in the UI as live results. See the implementation report for current local manual checks and future authorized-adapter checks.
