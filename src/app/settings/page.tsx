"use client";

import { useState } from "react";
import { useAppState } from "@/components/app-provider";
import { SUPPORTED_BOMB_COUNTS, TOTAL_TILES } from "@/lib/mines";
import { DEFAULT_PREFERENCES, readRawStorage } from "@/lib/storage";
import type { StorageCategory } from "@/lib/storage";
import { ConnectionPanel } from "@/components/connection-panel";
import { useHelp } from "@/components/help-provider";

function downloadJson(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsPage() {
  const { openTutorial, openConnectionGuide } = useHelp();
  const { preferences, updatePreferences, storageStatus, recoverStorage, history, signals, evaluations, connection } = useAppState();
  const [saved, setSaved] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");

  function exportCategory(category: StorageCategory) {
    try {
      const raw = readRawStorage(category);
      if (raw === null) { setStorageMessage(`No original ${category} data is stored.`); return; }
      downloadJson(`mines-lab-${category}-original.json`, raw);
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Could not export original data.");
    }
  }

  function recover(category: StorageCategory) {
    if (!window.confirm(`Back up the original ${category} value, then save the currently recovered ${category} data? Invalid entries will remain in the backup. Other categories are unaffected.`)) return;
    try {
      recoverStorage(category);
      setStorageMessage("Recovery attempted. Review each category's storage status below.");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Recovery failed. The original data was preserved.");
    }
  }

  function update(value: typeof preferences) {
    updatePreferences(value);
    setSaved(true);
  }

  function reset() {
    update({ ...DEFAULT_PREFERENCES });
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> PREFERENCES</div><h1>Workspace <span>settings.</span></h1><p>These preferences are saved only in this browser. No account data or credentials are stored.</p></div>
        <div className="source-status"><span className="status-dot" /><span><strong>Local storage</strong><small>Private to this browser</small></span></div>
      </div>
      {saved && <div className="notice" role="status"><span>{storageStatus.preferences.writable && !storageStatus.preferences.error ? "Settings updated. Automatic browser saving is enabled." : "Settings updated in memory. Browser saving is unavailable; review storage recovery below."}</span><button aria-label="Dismiss message" onClick={() => setSaved(false)}>×</button></div>}
      <section className="panel settings-panel history-section"><div className="settings-section-head"><div className="panel-kicker">GETTING STARTED</div><h2>Help &amp; Tutorial</h2><p>Revisit the six-step introduction or check what is needed for a live data connection.</p></div><div className="storage-actions"><button type="button" className="secondary-button" onClick={openTutorial}>Restart welcome tutorial</button><button type="button" className="secondary-button" onClick={openConnectionGuide}>Connection Setup Guide</button></div></section>
      <section className="panel settings-panel">
        <div className="settings-section-head"><div className="panel-kicker">ANALYSIS DEFAULTS</div><h2>Game configuration</h2><p>Defaults used by the analysis and signal workspaces. They can still be changed per session.</p></div>
        <div className="settings-row">
          <div><strong>Default mine count</strong><span>Select the starting board configuration.</span></div>
          <div className="bomb-options settings-bombs" role="group" aria-label="Default mine count">
            {SUPPORTED_BOMB_COUNTS.map((count) => <button key={count} className={`bomb-option ${preferences.mineCount === count ? "chosen" : ""}`} aria-pressed={preferences.mineCount === count} onClick={() => update({ ...preferences, mineCount: count, suggestedTileCount: Math.min(preferences.suggestedTileCount, TOTAL_TILES - count) })}><span className="bomb-glyph">✳</span>{count}<small>MINES</small></button>)}
          </div>
        </div>
        <div className="settings-row">
          <div><strong>Default suggested tile count</strong><span>Recommendation count for new experimental signals.</span></div>
          <select className="settings-select settings-count" aria-label="Default suggested tile count" value={preferences.suggestedTileCount} onChange={(event) => update({ ...preferences, suggestedTileCount: Number(event.target.value) })}>
            {Array.from({ length: TOTAL_TILES - preferences.mineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} tile{count === 1 ? "" : "s"}</option>)}
          </select>
        </div>
        <div className="settings-section-head settings-appearance"><div className="panel-kicker">APPEARANCE</div><h2>Display preferences</h2></div>
        <div className="settings-row">
          <div><strong>Color theme</strong><span>Choose a dark or light workspace.</span></div>
          <div className="segmented-control" role="group" aria-label="Color theme">
            <button aria-pressed={preferences.theme === "dark"} className={preferences.theme === "dark" ? "selected" : ""} onClick={() => update({ ...preferences, theme: "dark" })}>Dark</button>
            <button aria-pressed={preferences.theme === "light"} className={preferences.theme === "light" ? "selected" : ""} onClick={() => update({ ...preferences, theme: "light" })}>Light</button>
          </div>
        </div>
        <div className="settings-row">
          <div><strong>Compact analysis board</strong><span>Reduce board spacing on the analysis page.</span></div>
          <button type="button" className={`toggle-switch ${preferences.compactBoard ? "on" : ""}`} role="switch" aria-checked={preferences.compactBoard} aria-label="Compact analysis board" onClick={() => update({ ...preferences, compactBoard: !preferences.compactBoard })}><span /></button>
        </div>
        <div className="settings-footer"><p>Preferences are saved automatically in localStorage. They are not synced across devices.</p><button className="secondary-button" onClick={reset}>Reset settings to defaults</button></div>
      </section>
      <ConnectionPanel />
      <section className="panel settings-panel history-section">
        <div className="settings-section-head"><div className="panel-kicker">CONNECTION PREFERENCES</div><h2>Read-only source behavior</h2><p>These browser preferences contain no endpoint credentials. They cannot authorize or enable an unavailable provider.</p></div>
        <div className="settings-row"><div><strong>Connect when the workspace opens</strong><span>{connection.available ? "Use the configured authorized adapter when this workspace opens." : "Unavailable until provider documentation, authorized access, and an adapter are supplied."}</span></div><button type="button" className={`toggle-switch ${preferences.connection.autoConnect ? "on" : ""}`} role="switch" aria-checked={preferences.connection.autoConnect} disabled={!connection.available} aria-label="Connect when the workspace opens" onClick={() => update({ ...preferences, connection: { ...preferences.connection, autoConnect: !preferences.connection.autoConnect } })}><span /></button></div>
        <div className="settings-row"><div><strong>Stale-data warning</strong><span>Your local freshness threshold; this is not a provider rate limit or a network polling interval.</span></div><select className="settings-select settings-count" aria-label="Stale-data warning threshold" value={preferences.connection.staleAfterSeconds} onChange={(event) => update({ ...preferences, connection: { ...preferences.connection, staleAfterSeconds: Number(event.target.value) } })}>{[...new Set([30, 60, 120, 300, 600, 3600, preferences.connection.staleAfterSeconds])].sort((a, b) => a - b).map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></div>
      </section>
      <section className="panel settings-panel history-section">
        <div className="settings-section-head"><div className="panel-kicker">LOCAL DATA</div><h2>Storage status and recovery</h2><p>Each category saves independently. Corrupt originals are kept until you choose backup and recovery. Backups stay in this browser; download originals before recovery if storage is full.</p></div>
        {storageMessage && <p className="notice" role="status">{storageMessage}</p>}
        {(Object.keys(storageStatus) as StorageCategory[]).map((category) => {
          const status = storageStatus[category];
          const problem = !status.writable || Boolean(status.error);
          return <div className="settings-row" key={category}>
            <div><strong>{category[0].toUpperCase() + category.slice(1)}</strong><span>{problem ? "Changes may be in memory only" : "Automatic browser saving enabled"}</span>{status.warnings.map((warning, index) => <span key={index} className="form-error">{warning}</span>)}{status.error && <span className="form-error">{status.error}</span>}</div>
            <div className="storage-actions"><button className="secondary-button" onClick={() => exportCategory(category)}>Download original</button>{problem && <button className="secondary-button" onClick={() => recover(category)}>Back up and recover</button>}</div>
          </div>;
        })}
        <div className="settings-footer"><p>Export current validated records before reaching the 500-round or 1,000-signal limits. Signal exports are an archive; restoring them is not implemented.</p><div className="storage-actions"><button className="secondary-button" onClick={() => downloadJson("mines-lab-rounds.json", JSON.stringify(history, null, 2))}>Export rounds</button><button className="secondary-button" onClick={() => downloadJson("mines-lab-signals.json", JSON.stringify({ version: 1, signals, evaluations }, null, 2))}>Export signals and evaluations</button></div></div>
      </section>
    </>
  );
}
