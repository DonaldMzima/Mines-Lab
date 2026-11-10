"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAppState } from "@/components/app-provider";
import { getConnectionGuidance, LIVE_CONNECTION_NOT_CONFIGURED } from "@/lib/connection-guidance";

interface ConnectionSetupGuideProps {
  onDone: () => void;
  onImport?: () => void;
}

const stages = ["Choose a source", "Review setup", "Check access", "Start tracking"];

function date(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "No successful connection yet";
}

export function ConnectionSetupGuide({ onDone, onImport }: ConnectionSetupGuideProps) {
  const {
    providerConfig, connection, connectionTest, testProviderConnection, disconnectProvider,
    preferences, storageStatus,
  } = useAppState();
  const [step, setStep] = useState(0);
  const [testError, setTestError] = useState("");
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const guidance = getConnectionGuidance(providerConfig, connection, connectionTest);
  const result = connectionTest.result;
  const testing = connectionTest.status === "testing";
  const canTest = connection.available && providerConfig.supportsCompletedRounds === true;
  const connected = connection.state === "connected";
  const canDisconnect = ["connecting", "connected", "reconnecting"].includes(connection.state) || testing;
  const historySaving = storageStatus.history.writable && !storageStatus.history.error;
  const documented = providerConfig.availability === "documented";

  async function checkConnection() {
    setTestError("");
    try { await testProviderConnection(); }
    catch { setTestError("The connection check could not finish. Review the connection error and try again."); }
  }

  const importAction = onImport
    ? <button type="button" className="secondary-button" onClick={onImport}>Import completed rounds</button>
    : <Link className="secondary-button" href="/history" onClick={onDone}>Import completed rounds</Link>;

  return (
    <div className="guide-content">
      <ol className="guide-progress" aria-label="Connection setup progress">
        {stages.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "is-current" : index < step ? "is-complete" : ""}><span aria-hidden="true">{index + 1}</span>{label}</li>)}
      </ol>

      <section className="guide-step" aria-labelledby="connection-guide-title">
        <p className="guide-status">Step {step + 1} of {stages.length}</p>
        {step === 0 && <>
          <h2 id="connection-guide-title" ref={heading} tabIndex={-1} data-autofocus>Connect your game data</h2>
          <p>The Winning Edge can analyze completed Mines rounds and compare your saved tile suggestions with their results.</p>
          <div className="guide-callout"><strong>{guidance.label}</strong><p>{guidance.description}</p></div>
          <p>The supported game is <strong>1win Mines by 1win Games</strong>. Live access needs the provider’s permission and a supported connector in this app.</p>
          <p>Never enter a gambling password, browser cookie, or session token. This guide does not need those details.</p>
          <p>You can use completed-round JSON imports now. Continue to review the connection requirements, or skip setup and return whenever you are ready.</p>
        </>}

        {step === 1 && <>
          <h2 id="connection-guide-title" ref={heading} tabIndex={-1} data-autofocus>Review the available setup</h2>
          <p>The app shows only connection methods it supports. There are no account details or API addresses to enter here.</p>
          <dl className="guide-details">
            <div><dt>Source</dt><dd>1win Games · Mines</dd></div>
            <div><dt>Connector supplied</dt><dd>{connection.adapterImplemented ? documented ? "Yes · configured by the application" : "Yes · configuration required" : "No authorized connector is available"}</dd></div>
            <div><dt>Connection details</dt><dd>{documented ? "Configured by the application" : "Waiting for official requirements"}</dd></div>
            <div><dt>Supported mode</dt><dd>{providerConfig.supportedMode === "both" ? "Demo and real modes" : providerConfig.supportedMode === "real" ? "Real mode" : providerConfig.supportedMode === "demo" ? "Demo mode" : "Not confirmed"}</dd></div>
          </dl>
          {!connection.available && <div className="guide-callout"><strong>What is needed before connecting</strong><p>The provider and the app’s developer need to finish these steps. You do not need to supply private account details.</p><ul><li>Permission for The Winning Edge to read completed game results.</li><li>An official connection address, sign-in method, and description of the available game updates.</li><li>A working read-only connector with confirmed game modes and request limits.</li></ul><details><summary>Exact missing requirements</summary><ul>{connection.unavailableReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details></div>}
          {connection.available && <p>Source details are ready for a check. This does not yet show that round data can be read or that automatic tracking works.</p>}
          <details className="guide-details"><summary>Game identifiers and connection method</summary><dl>
            <div><dt>Game ID</dt><dd>{providerConfig.gameId}</dd></div>
            <div><dt>Integration key</dt><dd>{providerConfig.integrationKey}</dd></div>
            <div><dt>Connection method</dt><dd>{providerConfig.transport === "websocket" ? "WebSocket" : providerConfig.transport === "http" ? "HTTP" : "Not configured"}</dd></div>
            <div><dt>Official sign-in method</dt><dd>{providerConfig.authenticationMethod === "none" ? "No sign-in required by this source" : providerConfig.authenticationMethod === "official-oauth" ? "Provider-approved sign-in" : providerConfig.authenticationMethod === "official-api-key" ? "Official API access, handled by the connector" : "Not established"}</dd></div>
          </dl><p>These identifiers name the game. They do not establish a working connection.</p></details>
        </>}

        {step === 2 && <>
          <h2 id="connection-guide-title" ref={heading} tabIndex={-1} data-autofocus>Check that data can be read</h2>
          <p>A real check asks the configured source for supported read-only data. Opening a connection alone does not prove that rounds can synchronize.</p>
          <div className="guide-callout"><strong>{guidance.statusLabel}</strong><p>{connection.available ? guidance.description : LIVE_CONNECTION_NOT_CONFIGURED}</p></div>
          <div className="guide-actions">
            <button type="button" className="primary-button" disabled={!canTest || testing} aria-describedby={!canTest ? `${id}-test-unavailable` : undefined} onClick={checkConnection}>{testing ? "Checking source…" : "Test Connection"}</button>
            {canDisconnect && <button type="button" className="secondary-button" onClick={disconnectProvider}>Disconnect</button>}
          </div>
          {!canTest && <p id={`${id}-test-unavailable`}>{connection.available ? "This source does not provide the supported read-only history check. A transport connection alone cannot verify round data." : "Testing is unavailable until official source details and an approved connector are configured. No simulated check is run."}</p>}
          <div className="guide-check-result" role="status" aria-live="polite">
            {testing ? <p>Checking the supported source. Any results below belong to the previous completed check.</p> : result ? <p><strong>{connectionTest.status === "success" ? "Read-only check completed" : connectionTest.status === "cancelled" ? "Check cancelled" : connectionTest.status === "unavailable" ? "Check unavailable" : "Check failed"}.</strong> {result.message}</p> : <p>No connection check has been completed.</p>}
          </div>
          {result && <dl className="guide-capabilities">
            <div><dt>Source checked</dt><dd>{result.source}</dd></div>
            <div><dt>Checked at</dt><dd>{date(result.checkedAt)}</dd></div>
            <div><dt>Read-only history access</dt><dd>{result.historyReadVerified ? "Checked successfully" : "Not verified"}</dd></div>
            <div><dt>Completed rounds read</dt><dd>{result.completedRoundCount}</dd></div>
            <div><dt>Lifecycle events observed in this connection session</dt><dd>{[result.observedEvents.start && "start", result.observedEvents.update && "update", result.observedEvents.completed && "completion"].filter(Boolean).join(", ") || "None observed"}</dd></div>
          </dl>}
          <p>Last successful connection: <strong>{date(connection.lastConnectedAt)}</strong>. This records transport access, not proof that every type of round event is available.</p>
          {result?.status === "success" && result.historyReadVerified && result.completedRoundCount === 0 && <p>The history response was empty. Read-only access was checked, but no completed-round outcome was observed.</p>}
          {(testError || connection.lastError) && <p className="form-error" role="alert">{testError || connection.lastError}</p>}
          <details className="guide-status-list"><summary>What the status names mean</summary><dl>
            <div><dt>Connected</dt><dd>The source’s transport is open. Check the received data and capabilities to confirm what is working.</dd></div>
            <div><dt>Connecting / Reconnecting</dt><dd>The connector is opening or restoring its connection.</dd></div>
            <div><dt>Disconnected</dt><dd>No active connection. Existing local records are still available.</dd></div>
            <div><dt>Error</dt><dd>A connection or data request failed. Read the error before trying again.</dd></div>
            <div><dt>Not configured</dt><dd>The official source details or a supported connector are missing.</dd></div>
          </dl></details>
        </>}

        {step === 3 && <>
          <h2 id="connection-guide-title" ref={heading} tabIndex={-1} data-autofocus>Know what will track automatically</h2>
          <dl className="guide-summary">
            <div><dt>Your board</dt><dd>5 × 5 tiles · {preferences.mineCount} mines selected</dd></div>
            <div><dt>Connection</dt><dd>{guidance.statusLabel} · {guidance.label}</dd></div>
            <div><dt>Data source</dt><dd>{connected ? "Configured 1win Mines connector" : "Completed-round imports available"}</dd></div>
            <div><dt>Automatic tracking</dt><dd>{!connection.available ? "Unavailable · use imports" : !connected ? "Not active · source is disconnected" : providerConfig.supportsLiveRounds ? "Supported round events can update observed round details" : providerConfig.supportsCompletedRounds ? "Completed rounds only; starts and moves are not tracked" : "No round capability established"}</dd></div>
            <div><dt>Round history storage</dt><dd>{historySaving ? "Automatic browser saving enabled" : "Needs attention in Settings; changes may remain in memory"}</dd></div>
          </dl>
          <p>When a source supports them, a round start shows its ID, supported updates add known moves, and a completion saves the result. A source that supplies only completed rounds cannot show active-round progress.</p>
          <p>Matching completed results evaluate signals with an exact round ID recorded beforehand. Other associations need your confirmation. The app preserves the original suggestions.</p>
          <p>Experimental suggestions are random selections. They are not guaranteed safe and have no demonstrated predictive advantage.</p>
          <p>To stop a connection, choose <strong>Disconnect</strong> in the provider panel or in the check step. Your saved history stays in this browser.</p>
          {importAction}
        </>}
      </section>

      <div className="guide-actions">
        <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>
        {step < stages.length - 1 ? (
          <>
            <button type="button" className="text-button" onClick={onDone}>Skip setup</button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setStep((value) => Math.min(stages.length - 1, value + 1))}
            >
              Next
            </button>
          </>
        ) : (
          <button type="button" className="primary-button" onClick={onDone}>Done</button>
        )}
      </div>
    </div>
  );
}
