# Welcome tutorial and connection setup

Implemented 7 November 2026. No terminal commands, builds, installations, Git operations, test execution, browser walkthrough, or commits were performed for this request. Behavior below was implemented and statically reviewed; runtime and visual verification remain outstanding.

## Features implemented

The existing app now has a six-step welcome tutorial:

1. **Welcome to The Winning Edge:** a short explanation and Get Started.
2. **Configure your game:** working mine-count and suggested-tile controls, a numbered 5×5 board illustration, and an explanation of experimental suggestions. Settings update the existing app preferences; the illustration is not a generated signal or a result.
3. **Connect your game data:** actual source availability, imports as an alternative, a skippable live-setup step, and access to the connection guide.
4. **Verify your connection:** plain-language status meanings, a supported real Test Connection action, useful results/errors, and a disabled test with an explanation when no source/check exists.
5. **Understand automatic tracking:** event availability, completed-only limitations, exact-ID signal association, history updates, and retrospective confirmation.
6. **Start using The Winning Edge:** actual game settings, connection/source/tracking/storage summary, Open Dashboard and Open Signals. Tutorial completion never claims to activate or verify live access.

Back, Next, Close, Escape, and Skip are connected. The modal uses native `dialog.showModal()` for focus containment and background inertness, named headings, focus movement between steps, focus restoration, body-scroll locking, large text, responsive layouts, and wrap-safe content. One dialog switches between tutorial and guide, avoiding nested modal traps. The existing dashboard was not redesigned.

## Files created

- `src/lib/onboarding-storage.ts` — versioned onboarding-only persistence, validation, and backup recovery.
- `src/lib/connection-guidance.ts` — common source-readiness/check labels.
- `src/components/use-onboarding.ts` — first visit, progress, dismissal, completion, and restart.
- `src/components/help-dialog.tsx` — shared accessible native dialog.
- `src/components/help-provider.tsx` — shared opening actions, tutorial/guide handoff, route actions, and storage notices.
- `src/components/onboarding-steps.tsx` — the six focused tutorial steps.
- `src/components/connection-setup-guide.tsx` — dedicated four-stage connection workflow.
- `docs/ONBOARDING.md` — this report and manual verification guide.

## Files modified

- `src/app/layout.tsx` — persistent HelpProvider inside AppProvider.
- `src/components/app-shell.tsx` — Help & Tutorial navigation entry.
- `src/app/settings/page.tsx` — tutorial restart and setup-guide actions.
- `src/components/connection-panel.tsx` — setup-guide entry and last successful transport connection time.
- `src/components/app-provider.tsx` — exposes connection checks/results through the existing context.
- `src/components/use-provider-connection.ts` — real check orchestration, shared work, timeout/cancellation, evidence fields, last connected time, and supplied-adapter status.
- `src/lib/game-data-adapter.ts` — shared validated history request and initial-sync completion reporting.
- `src/app/globals.css` — scoped modal/tutorial/guide typography, focus, mobile wrapping, and storage notices.
- `README.md` — starting/reopening behavior and connection-check semantics.

No package/lock files or dependencies changed. No database was added.

## How onboarding starts and remembers progress

On first visit, the tutorial opens after client hydration. It uses only `mines-lab:onboarding:v1` with version 1, status `in-progress`, `completed`, or `dismissed`, and a validated step from 0 through 5. It is separate from game/settings/evaluation storage.

Moving through the tutorial saves the current step. Refreshing an unfinished tutorial resumes there. Skip, Close, and Escape save dismissal; Dashboard/Signals completion saves completion before routing. These actions stop automatic repetition when browser storage succeeds. Reopening the welcome tutorial deliberately restarts at Welcome and allows the full tutorial again.

Corrupt or future-version progress is not automatically overwritten. Welcome opens with an explanation; the next explicit tutorial action attempts to back up the original value under a unique onboarding recovery key before saving replacement progress. Backup failure preserves the original and keeps progress in memory. Storage warnings are shown in the tutorial and remain visible after a failed dismissal/completion write. Other stored categories are unaffected. If browser storage is blocked/full or cleared later, automatic repetition cannot be prevented; the UI warns rather than claiming successful persistence.

The connection guide is a separate session workflow. Its step is not persisted. Opening it from the tutorial preserves the tutorial step; closing/finishing the guide returns to that step. Choosing Import completed rounds dismisses any open tutorial and routes to History. Opening the guide directly does not reset a completed tutorial.

## How users reopen it

- Sidebar → **Help & Tutorial** restarts all six tutorial steps.
- Settings → **Restart welcome tutorial** does the same.
- Provider connection panel → **Connection Setup Guide** opens the dedicated guide.
- Settings → **Connection Setup Guide** opens it directly.

The collapsed mobile navigation has an accessible Help & Tutorial name and tooltip.

## How live setup and testing work

The four guide stages cover source access, current setup, a real access check, and tracking/storage next steps. The supported game is shown as 1win Mines by 1win Games. Known game/integration identifiers appear read-only in a disclosure; ordinary users are not asked to enter technical endpoints or credentials that the app cannot use.

Readiness distinguishes:

- **Unavailable:** no concrete adapter is supplied. This is the current default.
- **Setup incomplete:** an adapter is supplied but required documented configuration is missing/invalid.
- **Configured, not checked:** a documented config and adapter exist, but transport alone is not proof of data access.
- **Read-only access checked:** a real supported data request passed, with its exact evidence shown. This label does not assert that every live event type was verified.

No gambling password, cookie, session token, private browser credential, or secret endpoint value is requested or stored. Unknown transport/auth/mode/capabilities remain unconfigured. A configured source is still a developer-supplied authorized adapter, not a generic WebSocket created by this guide.

When a genuine documented source supports completed-round history, Test Connection connects through the existing manager if needed and makes or reuses its real `getCompletedRounds()` request. The response must be an array and pass runtime normalization/application validation. Existing pending initial sync and test work are shared; there is no network polling or duplicate subscription for each click. A user-triggered test waits at most 15 seconds; late results cannot convert a timed-out/cancelled test into success. Disconnect/config changes/unmount cancel the check. The adapter remains responsible for cancelling its actual pending network work when disconnected.

A valid empty array checks read-only history access but observes no completed outcomes. A nonempty valid array reports the completed records read; it does not itself prove live event delivery. Explicit lifecycle start/update/completion events observed in the connection session are listed separately. History snapshots never count as observed lifecycle events. Last successful connection time means transport success only and is labeled accordingly; it is session-only and not a stored verification certificate.

Checks are disabled for unavailable sources and for adapters without the supported read-only history check. Active-only adapters do not gain a fabricated success path. Errors, timeouts, cancellations, and unsupported checks are shown directly. Closing the guide does not automatically disconnect a source the user chose to connect; Disconnect remains available in the guide/provider panel. Test results are session state and are reset when the configured source changes.

## Current missing provider requirements

**Live connection is not configured. You can continue using completed-round imports while an authorized integration is being established.**

The earlier official-source investigation did not establish the endpoint, independent-application permission, official authentication, subscription/event schemas, stable identity/replay semantics, supported game modes, rate limits, or provider-specific retry rules. No concrete provider connector is configured. The guide explains these missing requirements; it does not invent them. See [the investigation](./REAL_DATA_INVESTIGATION.md).

The known values `v_1wingames:mines` and `vgsonewin2_mines` identify the observed game/integration only. They do not authorize access, connect an account, or reveal hidden mine positions. Experimental signals remain random suggestions without a demonstrated predictive advantage.

## Manual verification

Use a running local app or start it yourself with the repository's Yarn workflow. These checks were not executed by the agent. Use a disposable browser profile for storage manipulation; clear only the onboarding key when testing onboarding.

1. **First visit:** In a fresh profile, open any app route. Confirm Welcome appears once after loading, with Step 1 of 6, Get Started, Close, and Skip tutorial.
2. **Navigation:** Use Get Started, Next, and Back through all six steps. Check readable text, sensible progress, no horizontal overflow, and a short summary at the end. The board illustration must not be labeled live, safe, or an actual recommendation.
3. **Game controls:** On Configure your game, change mine count and suggested-tile count. Complete the tutorial and confirm those values match the existing dashboard/Signals settings and survive refresh when settings storage works.
4. **Progress resume:** Advance to a middle tutorial step and refresh without closing it. Expect the same step. Then press Escape or Close, refresh, and confirm the tutorial stays closed. Reopen from Help & Tutorial; it should start at Welcome. Repeat with Skip tutorial.
5. **Completion routes:** Finish once using Open Dashboard and once using Open Signals after reopening. Verify the destination and that refresh does not automatically reopen the completed tutorial. No completion summary may claim live integration was activated.
6. **Entry points and handoff:** Open the setup guide from the tutorial, navigate its stages, then choose Done/Close. Expect the original tutorial step. Open it directly from the provider panel and Settings. Choosing Import completed rounds should close the guide, dismiss the tutorial if open, and open History.
7. **Unavailable source:** With the current default, verify unavailable/not-configured explanations, known read-only identifiers, no invented URL/credential input, and disabled Test Connection with a useful explanation. Continue past setup without an API. Imports and experimental Signals must remain available.
8. **Keyboard/mobile:** Tab and Shift+Tab should stay inside the modal. Each new step should focus its heading; Escape should close the appropriate view and restore focus when the opener still exists. Check the close button, background inertness, long disclosures, narrow phone widths, 200% zoom, and modal scrolling. Background scrolling should resume after closing.
9. **Invalid progress:** Back up the current value, then use the browser storage inspector to replace only `mines-lab:onboarding:v1` with malformed JSON, an unsupported version, or an invalid step. Refresh. Welcome and a warning should appear; game history/settings must be unchanged and the original progress preserved. An explicit tutorial action should attempt a separate recovery backup before saving valid progress.
10. **Storage failure:** In a disposable profile, block browser storage or exhaust quota, then close or complete the tutorial. Confirm a visible nonmodal warning explains that progress may return after refresh. Dismissing that warning should work. No other category should be cleared.

After an actual approved adapter is supplied, additionally verify genuine successful/failed/empty history reads, delayed response timeout, repeated clicks sharing a request, disconnect/config/unmount cancellation, late responses after cancellation, last transport-success time, and observed lifecycle events separately from snapshots. These provider-dependent checks cannot currently run against the default unavailable source. No mock source or mock success was added to satisfy them.
