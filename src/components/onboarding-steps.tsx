"use client";

import { useAppState } from "@/components/app-provider";
import { getConnectionGuidance } from "@/lib/connection-guidance";
import { SUPPORTED_BOMB_COUNTS, TOTAL_TILES } from "@/lib/mines";

export const ONBOARDING_TITLES = [
  "Welcome to Mines Lab",
  "Configure your game",
  "Connect your game data",
  "Verify your connection",
  "Understand automatic tracking",
  "Start using Mines Lab",
] as const;

export function OnboardingStep({ step, onOpenGuide }: { step: number; onOpenGuide: () => void }) {
  const { preferences, updatePreferences, connection, providerConfig, connectionTest, testProviderConnection, storageStatus } = useAppState();
  const guidance = getConnectionGuidance(providerConfig, connection, connectionTest);
  const canTest = connection.available && providerConfig.supportsCompletedRounds === true;
  const testing = connectionTest.status === "testing";
  const historySaving = storageStatus.history.writable && !storageStatus.history.error;

  if (step === 0) return <>
    <p className="onboarding-lead">Mines Lab helps you analyze Mines game results, understand probabilities, and track the performance of tile recommendations.</p>
    <div className="onboarding-features"><div><span aria-hidden="true">▦</span><strong>Understand the odds</strong><p>Explore how the number of mines and picks affects probability.</p></div><div><span aria-hidden="true">◷</span><strong>Learn from results</strong><p>Keep completed rounds and compare recommendations with what happened.</p></div></div>
    <p className="onboarding-callout">You can start with completed-round imports. {connection.available ? "A configured read-only source is also available; this tutorial explains how to check its data access." : "A live connection is optional and currently unavailable without an authorized source."}</p>
  </>;

  if (step === 1) return <>
    <p>Choose the number of mines in your game. These settings are used by the dashboard and the next experimental suggestion.</p>
    <div className="onboarding-config">
      <div className="onboarding-fields">
        <span className="field-label" id="tutorial-mine-count">Number of mines</span>
        <div className="bomb-options" role="group" aria-labelledby="tutorial-mine-count">{SUPPORTED_BOMB_COUNTS.map((count) => <button type="button" key={count} className={`bomb-option ${preferences.mineCount === count ? "chosen" : ""}`} aria-pressed={preferences.mineCount === count} onClick={() => updatePreferences({ ...preferences, mineCount: count, suggestedTileCount: Math.min(preferences.suggestedTileCount, TOTAL_TILES - count) })}>{count}<small>MINES</small></button>)}</div>
        <label className="field-label" htmlFor="tutorial-pick-count">Suggested tiles</label>
        <select id="tutorial-pick-count" className="settings-select" value={preferences.suggestedTileCount} onChange={(event) => updatePreferences({ ...preferences, suggestedTileCount: Number(event.target.value) })}>{Array.from({ length: TOTAL_TILES - preferences.mineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} tile{count === 1 ? "" : "s"}</option>)}</select>
      </div>
      <figure className="onboarding-board-example"><div className="onboarding-mini-board" aria-label="Illustration of a five by five board with tiles numbered 1 to 25">{Array.from({ length: TOTAL_TILES }, (_, index) => <span key={index} className={`onboarding-example-tile ${[1, 8, 17].includes(index) ? "example-highlight" : ""}`}>{String(index + 1).padStart(2, "0")}</span>)}</div><figcaption>Tiles are numbered 1–25. The highlighted tiles are an illustration; every position is still unknown.</figcaption></figure>
    </div>
    <p>On the dashboard, click tiles to explore the odds. In Signals, Generate Signal creates an experimental random suggestion. Highlighting never means a tile is guaranteed safe.</p>
    {(!storageStatus.preferences.writable || storageStatus.preferences.error) && <p className="onboarding-callout" role="status">These settings are currently kept in memory only. Review storage recovery in Settings to save them after refresh.</p>}
  </>;

  if (step === 2) return <>
    <p>Use a read-only source approved by the game provider, or import completed rounds from a JSON file in History.</p>
    <div className="onboarding-callout"><strong>{guidance.label}</strong><p>{!connection.available ? "Live connection is not configured. You can continue using completed-round imports while an authorized integration is being established." : guidance.description}</p></div>
    <dl className="onboarding-summary"><div><dt>Provider</dt><dd>1win Games · Mines</dd></div><div><dt>Data you can use now</dt><dd>{connection.available ? "Configured read-only source and completed-round imports" : "Completed-round imports"}</dd></div></dl>
    <button type="button" className="secondary-button" onClick={onOpenGuide}>Open Connection Setup Guide</button>
    <p>The guide shows the actual requirements. You do not need a gambling password, cookie, or private session token.</p>
  </>;

  if (step === 3) return <>
    <p>Check the source before relying on automatic updates. A connected transport alone does not prove that game results are arriving.</p>
    <dl className="onboarding-status-list"><div><dt>Connected</dt><dd>A connection is open. A data check confirms what can actually be read.</dd></div><div><dt>Connecting / Reconnecting</dt><dd>The source is opening or restoring a connection.</dd></div><div><dt>Disconnected</dt><dd>Automatic data is not being received.</dd></div><div><dt>Error</dt><dd>A connection or data request failed. Read the message before retrying.</dd></div><div><dt>Not configured / Unavailable</dt><dd>Setup information or a supported provider connection is missing.</dd></div></dl>
    <div className="onboarding-test"><strong>Current status: {guidance.statusLabel}</strong><button type="button" className="secondary-button" disabled={!canTest || testing} aria-describedby="tutorial-test-help" onClick={() => { void testProviderConnection(); }}>{testing ? "Checking source…" : "Test Connection"}</button><p id="tutorial-test-help">{canTest ? "This makes a real read-only request through the configured source. It does not place a bet." : "No supported connection check is available with the current setup. Continue with imports, or review the setup guide."}</p></div>
    {connectionTest.result && <div className={`onboarding-callout ${connectionTest.result.status === "error" ? "is-error" : ""}`} role={connectionTest.result.status === "error" ? "alert" : "status"}><strong>{connectionTest.result.status === "success" ? "Read-only access checked" : "Connection check"}</strong><p>{connectionTest.result.message}</p></div>}
  </>;

  if (step === 4) return <>
    <p>With a supported live source, Mines Lab follows the events the provider makes available.</p>
    <ol className="onboarding-tracking-flow"><li><strong>Round detected</strong><span>A genuine round ID appears when a start event is available.</span></li><li><strong>Updates received</strong><span>Supported selections and progress are recorded.</span></li><li><strong>Result confirmed</strong><span>The completed result is validated and added to local history.</span></li><li><strong>Signal evaluated</strong><span>A suggestion linked to that exact round is compared with the revealed mines.</span></li></ol>
    <p className="onboarding-callout">Some sources provide completed rounds only. In that case, results can be saved automatically, but an active round and its moves cannot be tracked.</p>
    <p>Without a live source, import completed results in History. Matching round IDs update existing signal evaluations automatically. If a relationship is unknown, confirm it yourself; the app does not guess.</p>
  </>;

  return <>
    <p>Your tutorial is ready to finish. The summary below reflects this browser&apos;s current setup.</p>
    <dl className="onboarding-summary"><div><dt>Game configured</dt><dd>{preferences.mineCount} mines · {preferences.suggestedTileCount} suggested tile{preferences.suggestedTileCount === 1 ? "" : "s"}</dd></div><div><dt>Connection status</dt><dd>{guidance.statusLabel}</dd></div><div><dt>Data source</dt><dd>{connection.state === "connected" ? "Configured read-only provider source" : "Completed-round imports available"}</dd></div><div><dt>Tracking availability</dt><dd>{connection.available ? providerConfig.supportsLiveRounds ? "Provider supports lifecycle events; only received events establish progress" : "Completed results only; no active-round tracking" : "Live tracking unavailable · imports supported"}</dd></div><div><dt>History storage</dt><dd>{historySaving ? "Saving enabled in this browser" : "Memory only · check storage recovery in Settings"}</dd></div></dl>
    <p className="onboarding-callout">Experimental tile suggestions are not guaranteed safe selections. Completing this tutorial does not activate or verify a live connection.</p>
    <p>Reopen Help &amp; Tutorial whenever you need a reminder.</p>
  </>;
}
