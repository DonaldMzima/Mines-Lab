# Mines Lab

A local game-analysis dashboard for 1win Mines. It calculates survival probabilities under a uniform-placement assumption, generates explicitly experimental random suggestions, and evaluates them against imported or manually entered completed-round results. Imports automatically evaluate a signal when its original round identifier matches. No live provider connection, independently verified source, or predictive advantage is claimed.

First-time visitors see a six-step welcome tutorial. It configures the existing game preferences, explains imports/live availability, and ends with Dashboard or Signals navigation. Progress is stored separately under `mines-lab:onboarding:v1`; unfinished tutorials resume, while completed or dismissed tutorials stay closed. Reopen from **Help & Tutorial** in the sidebar or Settings. **Connection Setup Guide** is available in the provider panel and Settings. See [onboarding behavior and manual verification](./docs/ONBOARDING.md).

## Workspaces

- `/` — Interactive analysis board and calculated survival probabilities.
- `/signals` — Generate a random suggestion, optionally record its round ID before the outcome, and compare results with the random baseline and descriptive uncertainty intervals.
- `/history` — Import completed-round JSON, review per-record errors, automatically evaluate matching round IDs, or explicitly confirm a later association. Clearing either history requires confirmation.
- `/settings` — Persist preferences, inspect per-category storage warnings, download originals, recover corrupt categories after backup, and export validated records.

Signal suggestions are experimental and do not identify mathematically safer tiles. The read-only [adapter interface and subscription helper](./src/lib/game-data-adapter.ts) validate and deduplicate supplied events, report errors, and clean up subscriptions. A [round lifecycle engine](./src/lib/round-tracker.ts) is wired into the shared import/history/evaluation path. No endpoint or network transport is configured. See the [data-access investigation](./docs/REAL_DATA_INVESTIGATION.md), [lifecycle integration contract](./docs/ROUND_TRACKING.md), and [implementation report and verification steps](./docs/IMPLEMENTATION_REPORT.md).

## Run locally

Use the repository's Yarn package manager:

```bash
yarn dev
```

## Round import format

Import one round object or an array as a `.json` file, at most 2 MiB and 5,000 records per import. Mine and selected positions are zero-based, from `0` to `24`. Each canonical record declares a completed round and includes an ID, game ID `v_1wingames:mines`, completion timestamp (use ISO 8601 with a timezone), supported bomb count (`2`, `3`, `5`, or `7`), exactly that many unique mine positions, and a result (`won`, `lost`, `cashed_out`, or `unknown`). Explicit incomplete flags are rejected. Valid batch rows can be saved even when other rows fail; every failure is reported.

```json
{
  "id": "round-001",
  "gameId": "v_1wingames:mines",
  "timestamp": "2026-01-15T12:00:00.000Z",
  "bombCount": 3,
  "minePositions": [0, 12, 24],
  "selectedPositions": [4, 8],
  "result": "cashed_out",
  "cashoutAmount": 0.65,
  "currency": "USD",
  "fairness": {
    "serverSeedHash": "public-hash",
    "algorithm": "provider-algorithm-id"
  }
}
```

Observed provider responses need an explicit envelope because the supplied examples do not establish a stable round ID, exhaustive state mapping, or completion timestamp:

```json
{
  "roundId": "round-002",
  "timestamp": "2026-01-15T12:01:00.000Z",
  "completed": true,
  "result": "lost",
  "response": {
    "ms_id": "message-002",
    "state": 0,
    "outcome": { "mines": [0, 12, 13] },
    "fair": {
      "seedId": "example-seed-id",
      "serverSeedHash": "public-hash",
      "clientSeed": "example-client-seed",
      "nonce": 1,
      "cursor": 0,
      "bytesUsed": 12,
      "algo": "hmac_sha256:1"
    }
  }
}
```

The envelope is a user assertion, not provider verification. Supply the actual round ID and completion/result context; do not substitute `ms_id`. For a cash-out result supply `result: "cashed_out"` and optionally `response.cashout_amount`. Raw state codes (safe integers or non-empty text codes) are preserved independently of the explicit result; no code establishes success or completion. Optional mine counts must agree with the revealed positions. An optional `mode` is `demo`, `real`, or `unknown`; no mode is inferred from balances. Amounts without both reported real mode and currency are never labeled real money. Fairness fields are preserved; account balances and unknown fields are not stored. Never import passwords, cookies, tokens, or account exports containing credentials.

Identical duplicates are skipped; conflicting IDs are rejected without overwriting saved records. If conflicting versions appear in one batch, all versions of that ID are excluded. Imported data conflicting with an earlier round-linked evaluation is also rejected. Browser history holds 500 rounds and 1,000 signals; additional records are reported or blocked at the limit, rather than silently evicting records. Export before clearing. Signal exports are an archive; signal/evaluation restoration is not implemented.

## Signal association and storage

Record an exact round ID while generating a signal if legitimately known before its result. When an import has that ID, matching game/mine count, and a completion timestamp after generation, evaluation happens automatically. No association is inferred from timing alone. Without a precommitted ID, select an imported round and explicitly confirm its identity; it is labeled a later association. Manual mine entry remains available. Each signal and each identified round can be evaluated once; suggestions, generation time, and previous evaluations are preserved.

These local records are editable browser data, not proof of a prospective experiment. Observed rates exclude pending signals. The random baseline averages the individual probabilities of the evaluated signals. Wilson 95% intervals are shown within each mine/pick configuration and assume independent rounds; selective reporting and unverified inputs limit interpretation.

Storage categories load, validate, and save independently using existing version-1 envelopes. Valid rows survive invalid neighbors. Corrupt originals remain untouched and saving that category is paused until Settings → Back up and recover. Recovery verifies a separate local backup before writing recovered data. If quota or browser permissions prevent backup, recovery stops with the original preserved. Download original data first if needed. Evaluations pause when signal/evaluation storage requires recovery so quarantined historical records cannot be silently replaced. Other categories continue operating. Connection preferences contain only auto-connect (off by default) and a local freshness threshold; older settings gain these defaults. Use one tab for writes; cross-tab merging and device synchronization are not implemented.

Fairness verification, authorized live data connections, provider multipliers, and predictive models remain unimplemented. No authorized round-history endpoint or feed was established in public official documentation; see the investigation for sources and scope.

## Connection availability and round lifecycle

The default [provider configuration](./src/lib/provider-config.ts) includes only `1win`, `v_1wingames:mines`, and `vgsonewin2_mines`. Transport, endpoints, authentication, supported modes, and event capabilities remain absent until documented. Analysis and Settings show the actual unavailable/disconnected state, missing requirements, observed round ID/status, latest completed result, provider receipt/event timestamps, errors, and reported mode. Connect and auto-connect controls are disabled while unavailable.

An authorized adapter can later be instantiated within a Client Component and supplied together with matching documented configuration to `AppProvider`. Configuration alone does not create a connection or grant authorization. Active rounds require explicit `round-start` events. Updates without a start remain pending/unknown; completed-only sources do not fabricate starts. The tracker guards identifiers, duplicates, ordering, known selections, and terminal immutability. Completed results enter the existing history/evaluation pipeline; received outcomes can still evaluate associated signals when the 500-round storage limit prevents a new history row.

The connection hook subscribes once per session, cleans up on disconnect/unmount/configuration changes, and checks local freshness without network polling. Retry controls are manual; provider-specific reconnection/rate rules require documentation. Repeated old events do not refresh their event timestamp. A fresh observed active round with the matching mine count can supply the next signal's ID automatically; completed, stale, disconnected, or unknown rounds cannot.

The setup guide's **Test Connection** uses the same authorized adapter and runtime-validated read-only history request, reusing pending work rather than opening duplicate subscriptions. It is disabled for the current unavailable source and for sources without a supported history check. Transport success, validated history access, completed-history counts, and actual lifecycle-event observations are reported separately. An empty valid history response checks access only; it does not verify live round synchronization. Checks have a 15-second application wait limit and cancellation guards. No test has been run against a provider in this workspace.

History disclosures display preserved fairness metadata and raw provider state. The optional verifier interface has no provider implementation registered; verification remains unavailable. Typography uses shared 13px metadata, 14px secondary/table, 15px controls, 16px body/inputs/navigation, 18px tiles/card headings, 22px section headings, and 28–32px page headings, with responsive wrapping.

## Manual workflow check

1. Open `/signals`, select a mine count and suggestion count, then generate a signal. Confirm distinct numbered tiles are highlighted as experimental suggestions.
2. For automatic evaluation, generate a signal with a unique round ID before its outcome, then import that completed round with the same game/mine count and a genuine completion timestamp after generation. Confirm one evaluation appears without mine re-entry; retry the file and confirm no second evaluation appears.
3. For manual evaluation, enter exactly the configured number of revealed mine tile numbers (1–25). Confirm safe picks, mine hits, and complete success update. Refresh to confirm persistence.
4. Generate a signal without a round ID. Import its matching later completed round, select it in the signal's imported-round chooser, and confirm the association. Check the retrospective label and that the round cannot be assigned twice.
5. Compare observed success, expected random baseline, pending signals, and per-configuration intervals. These are descriptive statistics, not proof of prediction.
6. Import batches with invalid records and duplicate/conflicting IDs. Confirm valid unrelated rows survive and failures are reported. Clear actions must require confirmation.
7. Open `/settings`, change defaults, theme, and compact-board preferences, refresh, then reset defaults. Verify each storage category reports its actual status. Recovery scenarios are detailed in the implementation report.

Runtime verification status and command restrictions are recorded in the implementation report. No runtime success should be inferred from static review.
