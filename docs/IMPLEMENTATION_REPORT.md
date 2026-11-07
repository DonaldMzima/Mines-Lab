# Mines Lab implementation report

Updated 7 November 2026 for the live-integration, round-tracking, and typography brief. This report describes implemented code and static review. It does not certify runtime behavior.

## 1. Completed features

The existing Next.js application, navigation, board, random generator, evaluation history, storage formats, and palette were preserved. No dependency, database, endpoint, account credential, betting command, or fabricated live result was added.

- Canonical completed-round records and explicit envelopes around the observed provider responses share validation, duplicate/conflict handling, and partial-batch error reporting. Response `id`/`ms_id` values are validated when supplied but never substituted for the explicit round ID. Mine positions, counts, optional amounts, fairness metadata, mode, and raw state are checked. Numeric/text state codes are retained without inferring their meanings. Explicit completion/result context is still required. Balances are validated then discarded.
- A dedicated lifecycle manager processes genuine externally supplied round IDs through explicit starts, updates, and terminal results. It handles multiple successive IDs, known selections, optional ordering/event identity, duplicates, inconsistent metadata, and immutable terminal outcomes. Completed-only sources and imported history never fabricate starts or active states.
- Both adapter completions and imports enter the history/evaluation pipeline. History and statistics refresh through context. Matching original signal round IDs are evaluated automatically; unmatched signals stay pending until explicit confirmation or manual evaluation. Original suggestions/timestamps and earlier evaluations are preserved. History-full warnings do not prevent evaluation of a valid received outcome.
- A connection hook accepts a future provider-approved adapter and validated documented config. It manages subscriptions, actual states, cleanup, configuration changes, duplicate connection attempts, errors, and local freshness checks. It performs no network polling and implements no speculative retry policy. The default application has no adapter or endpoint.
- Analysis and Settings show provider availability, actual connection state, observed round ID/status, known selections, receipt/event/import times, last completion, errors, mode, and connection blockers. Connect and auto-connect are visibly disabled while unavailable. Navigation status and Signals status use the same connection state.
- A fresh observed active provider round with a matching mine count can automatically supply the next signal's round ID. Completed, unknown, stale, and disconnected observations cannot do so. The application never labels generated suggestions verified safe.
- Independent category recovery remains intact. Non-sensitive connection preferences were added to settings with backward-compatible defaults: auto-connect off and a 120-second local freshness threshold. Source labels and reported mode survive local persistence; imported source claims are stripped at the external import boundary. No credentials or balances are saved.
- History exposes fairness fields and preserved provider state in a disclosure. An optional provider-specific post-round verifier interface/registry exists; no algorithm implementation or verifier is registered, no secret seed is stored, and the UI accurately says verification unavailable.
- Observed signal success, expected random baseline, evaluated/pending counts, and per-configuration descriptive uncertainty remain available. Analysis now includes observed success and expected baseline as measured statistics. No predictive capability is claimed.

## 2. Files changed in this follow-up

New:

- `src/lib/provider-config.ts` — documented/unconfigured configuration, known identity defaults, runtime checks, explicit blockers.
- `src/lib/round-tracker.ts` — normalized lifecycle events, observed round state, ordering and terminal ledger.
- `src/lib/fairness.ts` — optional documented post-round verification interface and registry.
- `src/lib/round-display.ts` — reported-mode/currency-aware cashout labels.
- `src/components/use-provider-connection.ts` — adapter lifecycle, actual connection status, freshness, cleanup.
- `src/components/connection-panel.tsx` — connection availability and observed-round details.
- `src/components/fairness-details.tsx` — metadata disclosure and verification status.
- `docs/ROUND_TRACKING.md` — internal lifecycle contract and integration boundary.

Modified:

- `src/lib/mines.ts` — identifier/state validation, optional mode, preserved raw codes, shared validators.
- `src/lib/game-data-adapter.ts` — optional lifecycle subscription, preserved terminal event ordering, connected-state requirement and bounded completed cache.
- `src/lib/storage.ts` — connection preferences and safe persisted provenance while retaining isolated recovery.
- `src/components/app-provider.tsx` — tracker rehydration, shared ingestion, automatic evaluations, optional adapter/config injection.
- `src/components/data-status.tsx` — dynamic shared connection/source status.
- `src/components/app-shell.tsx` — actual state in navigation header, accessible names on collapsed links.
- `src/app/page.tsx` — connection details and measured signal statistics.
- `src/app/signals/page.tsx` — optional automatic active-round identity and actual connection copy.
- `src/app/history/page.tsx` — fairness disclosure, source/mode labels, reported financial units.
- `src/app/settings/page.tsx` — connection panel and non-sensitive preferences, disabled unavailable controls.
- `src/app/globals.css` — shared typography scale, responsive spacing/wrapping, functional connection/fairness styling.
- `README.md`, `docs/REAL_DATA_INVESTIGATION.md`, `docs/IMPLEMENTATION_REPORT.md` — current formats, findings, limitations, and verification instructions.

`layout.tsx`, package files, lockfile, and dependencies were not changed in this follow-up. No commits were created.

## 3. API findings

No official endpoint, authentication contract, supported subscription, round-start/update/completion schema, rate-limit specification, or independent-application permission for 1win Mines was established in the public official sources reviewed. The known identity defaults are `1win`, `v_1wingames:mines`, and the observed integration key `vgsonewin2_mines`; these are not connection credentials or authorization.

[1win Partners](https://1win-partners.com/) is an affiliate program; affiliate statistics do not establish access to a player's Mines round results. The [official casino page](https://1win.com/casino) supplies product context rather than a usable read-only integration specification. Direct page retrieval was unreadable in the research environment, so indexed information is treated with that limitation. Fresh searches did not establish another official integration contract. This does not prove that a private approved partner offering does not exist.

Transport, endpoints, authentication method, supported mode, and capability flags remain absent in the default config. A documented config must supply actual official references and a matching authorized adapter before the UI enables connection. Structural validation of supplied config is not itself proof of authorization.

No provider login, session token/cookie reuse, private endpoint probing, CORS bypass, gameplay request, or betting action was used. See [the investigation](./REAL_DATA_INVESTIGATION.md) for source scope and exact missing requirements.

## 4. Live connection status

**Unavailable and disconnected. Live synchronization is not complete.**

There is no concrete HTTP/WebSocket provider connector because the actual endpoint, permission/authentication, events, identifiers, state semantics, supported modes, replay, limits, and retry requirements remain unverified. A generic WebSocket class would not resolve these requirements and was not added as a pretend connection.

The smallest external milestone is written provider approval plus official read-only documentation and sanitized lifecycle/completion fixtures. The existing adapter boundary can then be implemented without replacing the history/evaluation pipeline.

## 5. Round tracking

The normalized engine accepts `round-start`, `round-update`, and `round-completed`. Its visible statuses are pending, active, completed, and unknown. Explicit start establishes active/start time. Update without start remains pending/unknown rather than claiming a detected start. Complete mine positions exist only on completed records.

Known selections accumulate, earlier observations cannot be regressed by older updates, and terminal results cannot be reopened or overwritten. Event ID/sequence conflicts are reported. Raw provider state is retained independently of outcome. A newer current observation is not replaced by an older snapshot. Detail caches are bounded; completed-ID tombstones remain for the tracking session. Completed history rehydrates through completion events without inventing a start.

The application connects this engine to imports and future adapter callbacks. Active events are transient, so reload recovery requires an actual authorized snapshot/replay. No authentic provider lifecycle event has been received or runtime-tested. See [the internal contract](./ROUND_TRACKING.md).

## 6. Signals and fairness

Evaluation is automatic for exact precommitted identity with matching game/mine count and completion after generation. Fresh observed active provider identity can be captured at generation. Otherwise the existing explicit association workflow reuses imported mines after confirmation, or manual mine entry remains available. Pending signals are excluded from observed rates. Later/manual links are retrospective; local precommit records cannot prove unseen outcomes or an unbiased experiment.

**No genuine predictive capability has been demonstrated.** The supplied examples reveal full mines only after completion. Server-seed hashes do not disclose secret seeds: [NIST hash-function guidance](https://csrc.nist.gov/projects/hash-functions) describes preimage resistance, and [RFC 2104](https://www.rfc-editor.org/info/rfc2104/) specifies secret-key HMAC. The label `hmac_sha256:1` and public counters do not document the provider's complete board-generation algorithm.

Fairness metadata can be inspected, but actual verification still requires documented serialization/algorithm/test vectors and legitimately disclosed seed material. No algorithm or winning positions were invented. The optional verifier API is preparation for documented post-round verification, not a working fairness proof or prediction model.

## 7. Typography and controls

Shared CSS tokens now target:

- Page headings 28–32px; section headings 22px; card headings 18px.
- Body, form inputs, and navigation 16px; form/button labels 15–16px.
- Table/secondary content 14px; metadata at least 13px; board tile numbers 18px.
- Readable line heights, controls at least 44px high where applicable, wrap-safe IDs/hashes/errors, and horizontal table scrolling.

Analysis, Signals, History, Settings, sidebar, controls, statistics, probabilities, imports, status, empty states, errors, and mobile rules use the scale. Existing colors, sidebar/card hierarchy, and board layout were retained. Native confirmation dialogs remain browser-controlled. Disabled connection/auto-connect controls are styled as disabled with explanations; working controls retain event handlers. Mobile collapsed navigation has explicit accessible names.

This is a code-level typography update. No screenshot/browser verification was performed, so rendered clipping, narrow-screen behavior, focus, and zoom still need manual checks.

## 8. Remaining issues and verification boundary

- No authorized network source, active provider session, provider-authenticated data, actual fairness verifier, predictive model, or provider multiplier model.
- Provider state/result and user completion assertions remain context supplied by the importer or future documented adapter, not inferred from a numeric state.
- Imported modes/currencies are reported values and are not independently verified. Balances are not displayed/persisted.
- Manual results without round identity cannot detect external-round reuse under another unlinked signal. Browser data is editable and not tamper-resistant.
- Browser storage still has quota/security/deletion risks, no cross-key transaction, no multi-tab merge, and no device synchronization. Use one writing tab. Failed writes remain visible; originals and recovery backups are preserved within those constraints.
- Limits remain 2 MiB/file, 5,000 import records, 500 stored rounds, and 1,000 signals/evaluations. Tracker details/signatures are separately bounded; session terminal-ID tombstones are transient and grow with observed completed IDs. Reload only recovers retained history/evaluation identities.
- Signal/evaluation archive restoration remains unimplemented. Valid round exports can be imported. Last-import and active connection state are session-only. Clearing stored history does not erase transient knowledge that a round completed in the current session.
- No terminal commands, build, lint, test execution, installations, dev-server startup, Git operation, or commit ran during this follow-up, as the brief requires explicit requests. Local Next.js guidance was read with direct file tools. Independent static reviews covered engine ordering, ingestion/evaluation limits, connection lifecycles, source/financial claims, fairness, CSS, and visible handlers. No runtime success is claimed.

## 9. Manual verification

Run these yourself against a local app using the repository's Yarn workflow; this agent did not execute commands. Use a disposable browser profile or download actual records before destructive/corruption checks. Verification fixtures must remain labeled user-provided, never authentic/live results.

1. Open Analysis, Signals, History, and Settings using navigation. Confirm the default state is unavailable/disconnected, Connect and auto-connect are disabled, and missing endpoint/auth/schema/mode/rate/permission information is explained.
2. Check all pages at desktop width and narrow mobile width, then 200% browser zoom. Inspect headings, board numbers, labels, buttons, tables, disclosures, errors, long IDs/hashes, and disabled controls for clipping/overlap. Tables should scroll rather than shrink text. Check keyboard focus and mobile navigation names.
3. On Analysis, select/unselect tiles and change mine count. Confirm probability updates, pick limits, Reset selection, and New analysis. Zero picks should show 100% model survival; no hidden tile is described as verified safe.
4. On Signals, generate a 3-mine signal with a unique ID such as `verification-001`. Note its original time/tiles. Mark/unmark tiles and reset marks; the saved suggestion must not change.
5. After generation, make a completed-round fixture in the README envelope format with that ID, 3 valid mine positions, explicit completion/result, and a real completion timestamp later than generation. Import it. Expect one history row and automatic evaluation without re-entering mines. Check safe/mine overlap and measured statistics.
6. Import two further completed fixtures with distinct genuine/test IDs and later completion times. Confirm the tracker displays the latest completed observation, source remains user-provided, no start time/active round is fabricated, and no manual app reset is needed. Refresh: retained history and evaluations should reload with completed-only status.
7. Reimport identical data: expect duplicates and no extra evaluation. Change mines for an existing ID or supply two conflicting versions in one batch: expect rejection with original results unchanged after refresh. Mix valid records with duplicate/fractional/out-of-range positions, inconsistent mine count, invalid financial fields, invalid `ms_id`/`id`, missing context, and incomplete flags. Valid unrelated rows should survive with explicit rejection counts.
8. Supply an unfamiliar valid raw state code with explicit completed/result context; it should be retained without inventing state meaning. Expand fairness/provider metadata. Confirm algorithm/hash/client seed/counters/raw state display, no balance is shown, and verification remains unavailable. Unknown mode/currency cashouts must remain unverified units; reported demo amounts must be labeled demo.
9. Generate an unlinked signal, import its actual later completed round, select it, and cancel confirmation once. Confirm nothing changes; then confirm the association. It should reuse imported mines and show a later-association label. The same identified round cannot evaluate another signal. Manual mine entry should still validate visible tile numbers 1–25 and preserve earlier evaluations.
10. Change mine/default pick count, theme, compact board, and freshness preference; refresh and verify persistence. Reset defaults. Existing older settings should gain safe connection defaults without losing other preferences. Auto-connect must remain unusable while source availability is blocked.
11. Download originals in Settings. In a disposable profile's browser storage inspector, corrupt only `mines-lab:settings`, then reload. History import/saving must continue independently; settings should warn, preserve the original, and use defaults. Back up/recover it and verify a separate recovery key before saving resumes. Separately check mixed valid/invalid signal rows: valid records should survive while the original remains protected, and evaluation should pause until recovery.
12. Verify exports and clear-history confirmations with disposable data. Cancel each clear once. Clearing rounds should leave saved signal evaluations intact; clearing signals explicitly clears their evaluations. At history capacity, new outcomes should be reported as not stored, while valid exact-ID evaluations can still be recorded. Quota/permission failures must show memory-only warnings.

After official access exists, additional checks are required with a documented authorized adapter: two or more real start→update→completed cycles, completed-only snapshots, duplicate/out-of-order events, sequences, disconnect during pending connect, late deliveries after cleanup, documented recovery, config changes, stale/replayed data, mode behavior, and exactly-once signal evaluation. Those live checks are currently blocked by missing provider documentation/access and have not been performed.
