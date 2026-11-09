"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FootballCompetition, FootballFixture, FootballFixtureDetail, FootballPeriod, FootballStatisticsResult, FootballTicket } from "@/lib/football/types";

interface FootballHistoryRecord {
  forecast: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

interface FootballEvaluation {
  evaluatedFixtures: number;
  topOutcomeAccuracy: number | null;
  multiclassBrierScore: number | null;
  uniformBaselineBrierScore: number | null;
  bookmakerBrierScore: number | null;
  bookmakerEvaluatedFixtures: number;
  hypotheticalTopOutcomeBets: number;
  hypotheticalOneUnitNetReturn: number | null;
  calibrationBins: { lower: number; upper: number; count: number; meanConfidence: number | null; empiricalAccuracy: number | null }[];
  disclaimer: string;
}

interface DraftSelection {
  fixtureId: number;
  market: string;
  selection: string;
  oddsSource: "manual";
  decimalOdds: number;
  bookmaker: string;
  providerOddId: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `Request failed (HTTP ${response.status}).`);
  return payload as T;
}

function formatKickoff(value: string, timezone: string): string {
  const formatted = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  return timezone === "Africa/Johannesburg" ? `${formatted} SAST` : `${formatted} ${timezone}`;
}

const periodLabels: Record<FootballPeriod, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  weekend: "This weekend",
  next7: "Next 7 days",
};

function browserIdentifier(): string {
  const key = "mines-lab:football:browser-id:v1";
  const existing = window.localStorage.getItem(key);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export function FootballWorkspace() {
  const [browserId, setBrowserId] = useState("");
  const [competitions, setCompetitions] = useState<FootballCompetition[]>([]);
  const [competitionsLoaded, setCompetitionsLoaded] = useState(false);
  const [competitionId, setCompetitionId] = useState("");
  const [period, setPeriod] = useState<FootballPeriod>("next7");
  const [teamFilter, setTeamFilter] = useState("");
  const [timezone, setTimezone] = useState("Africa/Johannesburg");
  const [timezoneInput, setTimezoneInput] = useState("Africa/Johannesburg");
  const [fixtures, setFixtures] = useState<FootballFixture[]>([]);
  const [fixturesTruncated, setFixturesTruncated] = useState(false);
  const [selected, setSelected] = useState<FootballFixtureDetail | null>(null);
  const [statistics, setStatistics] = useState<FootballStatisticsResult | null>(null);
  const [tickets, setTickets] = useState<FootballTicket[]>([]);
  const [draft, setDraft] = useState<DraftSelection[]>([]);
  const [stake, setStake] = useState("10");
  const [marketKey, setMarketKey] = useState("");
  const [outcome, setOutcome] = useState("");
  const [manualOdds, setManualOdds] = useState("");
  const [manualBookmaker, setManualBookmaker] = useState("Manual");
  const [linkCode, setLinkCode] = useState("");
  const [evaluation, setEvaluation] = useState<FootballEvaluation | null>(null);
  const [evaluationMessage, setEvaluationMessage] = useState("");
  const [forecastHistory, setForecastHistory] = useState<FootballHistoryRecord[]>([]);
  const [loading, setLoading] = useState("competitions");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  const currentMarket = selected?.markets.find((market) => market.key === marketKey) ?? selected?.markets[0];
  const currentOutcome = currentMarket?.outcomes.find((item) => item.label === outcome) ?? currentMarket?.outcomes[0];
  const filteredFixtures = useMemo(() => {
    const query = teamFilter.trim().toLocaleLowerCase();
    return query ? fixtures.filter((fixture) => fixture.homeTeam.toLocaleLowerCase().includes(query) || fixture.awayTeam.toLocaleLowerCase().includes(query)) : fixtures;
  }, [fixtures, teamFilter]);
  const combinedOdds = draft.reduce((total, item) => total * item.decimalOdds, 1);
  const stakeValue = Number(stake);
  const potentialReturn = Number.isFinite(stakeValue) && stakeValue > 0 ? Math.round(stakeValue * combinedOdds * 100) / 100 : 0;

  const refreshTickets = useCallback(async (id: string) => {
    const result = await requestJson<{ tickets: FootballTicket[] }>(`/api/football/tickets?browserId=${encodeURIComponent(id)}`);
    setTickets(result.tickets);
  }, []);

  useEffect(() => {
    try {
      setBrowserId(browserIdentifier());
      setStorageReady(true);
    } catch {
      setError("Browser storage is unavailable. Shared tickets and Telegram linking cannot be used in this browser.");
      setLoading("");
    }
    let active = true;
    requestJson<{ competitions: FootballCompetition[]; truncated: boolean }>("/api/football/competitions")
      .then((result) => { if (active) { setCompetitions(result.competitions); setCompetitionsLoaded(true); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Competitions could not be loaded."); })
      .finally(() => { if (active) setLoading((value) => value === "competitions" ? "" : value); });
    requestJson<{ records: FootballHistoryRecord[]; evaluation: FootballEvaluation | null; evaluationMessage: string | null }>("/api/football/history")
      .then((result) => { if (active) { setEvaluation(result.evaluation); setEvaluationMessage(result.evaluationMessage ?? ""); setForecastHistory(result.records); } })
      .catch((cause: unknown) => { if (active) setError((value) => value || (cause instanceof Error ? cause.message : "Forecast history could not be loaded.")); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!browserId || !storageReady) return;
    refreshTickets(browserId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Tickets could not be loaded."));
  }, [browserId, refreshTickets, storageReady]);

  useEffect(() => {
    if (!competitionId) {
      setFixtures([]);
      setFixturesTruncated(false);
      return;
    }
    let active = true;
    setLoading("fixtures");
    setError("");
    setSelected(null);
    const query = new URLSearchParams({ period, competitionId });
    requestJson<{ fixtures: FootballFixture[]; truncated: boolean }>(`/api/football/fixtures?${query}`)
      .then((result) => { if (active) { setFixtures(result.fixtures); setFixturesTruncated(result.truncated); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Fixtures could not be loaded."); })
      .finally(() => { if (active) setLoading((value) => value === "fixtures" ? "" : value); });
    return () => { active = false; };
  }, [competitionId, period]);

  useEffect(() => {
    if (!currentMarket) return;
    if (marketKey !== currentMarket.key) setMarketKey(currentMarket.key);
    if (currentOutcome && outcome !== currentOutcome.label) setOutcome(currentOutcome.label);
  }, [currentMarket, currentOutcome, marketKey, outcome]);

  async function getSignal(fixtureId: number) {
    setError("");
    setNotice("");
    setLoading(`fixture:${fixtureId}`);
    try {
      const detail = await requestJson<FootballFixtureDetail>(`/api/football/fixtures/${fixtureId}`);
      setSelected(detail);
      setStatistics(null);
      setMarketKey(detail.markets[0]?.key ?? "");
      setOutcome(detail.markets[0]?.outcomes[0]?.label ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The fixture prediction could not be loaded.");
    } finally {
      setLoading("");
    }
  }

  async function loadStatistics(fixtureId: number) {
    setError("");
    setLoading("statistics");
    try {
      const result = await requestJson<FootballStatisticsResult>(`/api/football/fixtures/${fixtureId}/statistics`);
      setStatistics(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Match statistics could not be loaded.");
    } finally {
      setLoading("");
    }
  }

  function addSelection() {
    if (!selected || !currentMarket || !currentOutcome) return;
    const decimalOdds = Number(manualOdds);
    if (!decimalOdds || !Number.isFinite(decimalOdds) || decimalOdds < 1.01 || decimalOdds > 1000) {
      setError("Enter manual decimal odds from 1.01 to 1000.");
      return;
    }
    setDraft((items) => [
      ...items.filter((item) => item.fixtureId !== selected.fixture.id),
      {
        fixtureId: selected.fixture.id,
        market: currentMarket.name,
        selection: currentOutcome.label,
        oddsSource: "manual",
        decimalOdds,
        bookmaker: manualBookmaker,
        providerOddId: null,
      },
    ]);
    setError("");
    setNotice(`${selected.fixture.homeTeam} vs ${selected.fixture.awayTeam} added to ticket.`);
  }

  async function saveTicket() {
    if (!browserId || draft.length === 0) return;
    setLoading("ticket");
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ ticket: FootballTicket; duplicate: boolean; disclaimer: string }>("/api/football/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          browserId,
          stakeZar: Number(stake),
          selections: draft.map((item) => ({
            fixtureId: item.fixtureId,
            market: item.market,
            selection: item.selection,
            oddsSource: item.oddsSource,
            decimalOdds: item.decimalOdds,
            bookmaker: item.bookmaker,
          })),
        }),
      });
      await refreshTickets(browserId);
      setNotice(result.duplicate ? "This ticket was already saved." : result.disclaimer);
      setDraft([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ticket could not be saved.");
    } finally {
      setLoading("");
    }
  }

  async function createLinkCode() {
    if (!browserId) return;
    setLoading("link");
    setError("");
    try {
      const result = await requestJson<{ code: string }>("/api/football/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ browserId }),
      });
      setLinkCode(result.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A Telegram link code could not be created.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="page-wrap football-workspace">
      <header className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> FOOTBALL LAB</div><h1>Football <span>Predictions</span></h1><p>Fixtures, available API-Football predictions, results and statistics. No bets are placed.</p></div>
        <div className="source-status"><span className="status-dot" /><div><strong>Source: API-Football</strong><small>Coverage depends on the selected league and free-plan availability. Request use is capped locally.</small></div></div>
      </header>

      {error && <div className="football-alert" role="alert">{error}</div>}
      {notice && <div className="football-notice" role="status">{notice}</div>}

      <section className="panel football-panel" aria-label="Fixture selection">
        <div className="football-controls">
          <label>Competition
            <select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} disabled={competitions.length === 0}>
              <option value="">Choose subscribed competition</option>
              {competitions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.country ? ` · ${item.country}` : ""}</option>)}
            </select>
          </label>
          <label>Fixtures
            <select value={period} onChange={(event) => setPeriod(event.target.value as FootballPeriod)}>
              <option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">This week</option><option value="weekend">This weekend</option><option value="next7">Next 7 days</option>
            </select>
          </label>
          <label>Kickoff timezone (IANA)
            <input value={timezoneInput} onChange={(event) => {
              const value = event.target.value.trim();
              setTimezoneInput(event.target.value);
              try {
                new Intl.DateTimeFormat("en-ZA", { timeZone: value }).format(new Date());
                setTimezone(value);
                setError("");
              } catch (cause) {
                if (!(cause instanceof RangeError)) throw cause;
                setError("Enter a valid IANA timezone, for example Africa/Johannesburg or UTC.");
              }
            }} aria-label="Kickoff timezone, IANA name" />
          </label>
        </div>
        {competitionId && <label className="football-search">Search teams<input value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} maxLength={80} placeholder="Search either team" /></label>}
        {loading === "competitions" && <p className="football-muted">Loading subscribed competitions…</p>}
        {!competitionId && <p className="football-muted">Select a current league returned by API-Football to load fixtures and results.</p>}
        {!competitionId && competitionsLoaded && competitions.length === 0 && <p className="football-muted">No current leagues are available from this account or plan.</p>}
        {competitionId && loading === "fixtures" && <p className="football-muted">Loading {periodLabels[period]}…</p>}
        {competitionId && loading !== "fixtures" && fixtures.length === 0 && <p className="football-muted">No fixtures were returned for this competition and period.</p>}
        {fixtures.length > 0 && filteredFixtures.length === 0 && <p className="football-muted">No teams match this search.</p>}
        {fixturesTruncated && <p className="football-muted">More provider pages are available. Narrow the period or select a league to reduce API requests.</p>}
        {filteredFixtures.length > 0 && <ul className="football-fixture-list">
          {filteredFixtures.map((fixture) => <li key={fixture.id} className="football-fixture">
            <div><strong>{fixture.homeTeam} {fixture.isCompleted ? `${fixture.homeScore ?? "?"}–${fixture.awayScore ?? "?"}` : <span>vs</span>} {fixture.awayTeam}</strong><small>{fixture.competition.name} · {formatKickoff(fixture.kickoff, timezone)} · {fixture.state}</small></div>
            <button type="button" className="secondary-button" disabled={loading.startsWith("fixture:")} onClick={() => void getSignal(fixture.id)}>{loading === `fixture:${fixture.id}` ? "Loading…" : "Get Signal"}</button>
          </li>)}
        </ul>}
      </section>

      {selected && <section className="panel football-panel" aria-labelledby="football-signal-heading">
        <div className="panel-heading"><div><div className="panel-kicker">PROVIDER PROBABILITY / RESULT</div><h2 id="football-signal-heading">{selected.fixture.homeTeam} vs {selected.fixture.awayTeam}</h2><p>{selected.fixture.competition.name} · {formatKickoff(selected.fixture.kickoff, timezone)}</p></div><span className="football-badge">{selected.model.status === "provider-model" ? "API-Football prediction" : "Unavailable"}</span></div>
        {selected.fixture.isCompleted && selected.fixture.homeScore !== null && selected.fixture.awayScore !== null && <p className="football-primary"><strong>Final result:</strong> {selected.fixture.homeScore}–{selected.fixture.awayScore}</p>}
        {selected.model.status === "provider-model" && (() => {
          const primary = selected.primaryOutcome;
          return primary ? <p className="football-primary"><strong>Most likely provider outcome:</strong> {primary.outcome} · {primary.market} · {primary.probability.toFixed(1)}%</p> : null;
        })()}
        {selected.model.status === "unavailable" && <p className="football-muted">{selected.model.summary}</p>}
        {selected.model.status === "provider-model" && <p className="football-muted">Probability output, not a guarantee or instruction to bet. {selected.model.summary}</p>}
        {selected.markets.length > 0 && <div className="football-market-grid">
          {selected.markets.map((market) => <article key={market.key} className="football-market"><h3>{market.name}</h3>{market.outcomes.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.probability.toFixed(1)}%</strong></p>)}</article>)}
        </div>}
        <details className="football-details"><summary>Details</summary><p>Source: {selected.model.name}. Version: {selected.model.version}. Generated: {selected.model.generatedAt ? formatKickoff(selected.model.generatedAt, timezone) : "Not available"}.</p><p>{selected.model.summary} Probabilities and odds are not guarantees. Historical result tracking includes only saved pre-match full-time predictions with a confirmed final score.</p></details>
        <div className="football-market-controls">
          <label>Market<select value={currentMarket?.key ?? ""} onChange={(event) => { setMarketKey(event.target.value); setOutcome(""); }} disabled={selected.markets.length === 0}>
            {selected.markets.map((market) => <option key={market.key} value={market.key}>{market.name}</option>)}
          </select></label>
          <label>Outcome<select value={currentOutcome?.label ?? ""} onChange={(event) => setOutcome(event.target.value)} disabled={!currentMarket}>
            {currentMarket?.outcomes.map((item) => <option key={item.label} value={item.label}>{item.label} · {item.probability.toFixed(1)}%</option>)}
          </select></label>
          <label>Manual decimal odds<input inputMode="decimal" value={manualOdds} onChange={(event) => setManualOdds(event.target.value)} placeholder="e.g. 1.85" /></label>
          <label>Bookmaker / label<input value={manualBookmaker} onChange={(event) => setManualBookmaker(event.target.value)} maxLength={80} /></label>
        </div>
        <button type="button" className="primary-button" disabled={selected.model.status !== "provider-model" || !currentOutcome} onClick={addSelection}>Add to ticket</button>
        <p className="football-muted">Bookmaker odds are not fetched. Ticket odds must be entered manually and are labeled as manual.</p>
        <button type="button" className="secondary-button" disabled={loading === "statistics"} onClick={() => void loadStatistics(selected.fixture.id)}>{loading === "statistics" ? "Loading statistics…" : "Load match statistics"}</button>
        {statistics && <div className="football-market-grid" aria-live="polite">
          {!statistics.available && <p className="football-muted">{statistics.message}</p>}
          {statistics.teams.map((team) => <article key={team.teamId} className="football-market"><h3>{team.teamName}</h3>{team.statistics.map((item) => <p key={item.type}><span>{item.type}</span><strong>{item.value ?? "Not reported"}</strong></p>)}</article>)}
        </div>}
      </section>}

      <section className="panel football-panel" aria-labelledby="football-ticket-heading">
        <div className="panel-heading"><div><div className="panel-kicker">NO BET IS PLACED</div><h2 id="football-ticket-heading">Ticket planner</h2></div></div>
        {draft.length === 0 ? <p className="football-muted">Get a provider prediction and add one or more upcoming fixtures.</p> : <>
          <ul className="football-ticket-list">{draft.map((item) => <li key={item.fixtureId}><span>{item.market}: {item.selection} · {item.oddsSource === "manual" ? "Manual" : item.bookmaker} @ {item.decimalOdds.toFixed(2)}</span><button type="button" onClick={() => setDraft((entries) => entries.filter((entry) => entry.fixtureId !== item.fixtureId))}>Remove</button></li>)}</ul>
          <div className="football-controls">
            <label>Stake (ZAR)<input type="number" min="1" max="100000" step="0.01" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
            <div className="football-ticket-estimate"><span>Combined odds</span><strong>{combinedOdds.toFixed(2)}</strong><span>Potential return: R{potentialReturn.toFixed(2)}</span><span>Potential net profit: R{(potentialReturn - (Number.isFinite(stakeValue) ? stakeValue : 0)).toFixed(2)}</span></div>
          </div>
          <small>Accumulator estimate: every selection must win for the full potential return. This is not guaranteed and no bet is placed.</small>
          <button type="button" className="primary-button" disabled={loading === "ticket" || !Number.isFinite(stakeValue) || stakeValue < 1 || stakeValue > 100000} onClick={() => void saveTicket()}>{loading === "ticket" ? "Saving…" : "Save ticket"}</button>
        </>}
        {tickets.length > 0 && <div className="football-saved-tickets"><h3>Saved tickets</h3>{tickets.slice(0, 10).map((ticket) => <details key={ticket.id}><summary>{new Date(ticket.createdAt).toLocaleString()} · R{ticket.stakeZar.toFixed(2)} · odds {ticket.combinedOdds.toFixed(2)}</summary><ul>{ticket.selections.map((item) => <li key={item.fixtureId}>{item.homeTeam} vs {item.awayTeam}: {item.market} — {item.selection} @ {item.decimalOdds.toFixed(2)} ({item.oddsSource === "manual" ? `Manual: ${item.bookmaker}` : `Legacy provider odd: ${item.bookmaker}`})</li>)}</ul><p>Potential return R{ticket.potentialReturnZar.toFixed(2)} · not guaranteed; not placed.</p></details>)}</div>}
      </section>

      <section className="panel football-panel" aria-labelledby="football-history-heading">
        <div className="panel-heading"><div><div className="panel-kicker">OBSERVED RESULTS ONLY</div><h2 id="football-history-heading">Prediction evaluation</h2></div></div>
        {!evaluation && <p className="football-muted">{evaluationMessage || "Prediction evaluation is unavailable."}</p>}
        <p>Settled pre-match full-time results: <strong>{evaluation?.evaluatedFixtures ?? 0}</strong></p>
        <p>Top-outcome accuracy: <strong>{evaluation?.topOutcomeAccuracy === null || evaluation?.topOutcomeAccuracy === undefined ? "Not available" : `${(evaluation.topOutcomeAccuracy * 100).toFixed(1)}%`}</strong></p>
        <p>Multiclass Brier score: <strong>{evaluation?.multiclassBrierScore === null || evaluation?.multiclassBrierScore === undefined ? "Not available" : evaluation.multiclassBrierScore.toFixed(4)}</strong></p>
        <p>Uniform baseline Brier score: <strong>{evaluation?.uniformBaselineBrierScore === null || evaluation?.uniformBaselineBrierScore === undefined ? "Not available" : evaluation.uniformBaselineBrierScore.toFixed(4)}</strong></p>
        <p>Bookmaker baseline: <strong>{evaluation?.bookmakerBrierScore === null || evaluation?.bookmakerBrierScore === undefined ? "Not available" : `${evaluation.bookmakerBrierScore.toFixed(4)} · ${evaluation.bookmakerEvaluatedFixtures} fixtures`}</strong></p>
        <p>Flat one-unit top-outcome simulation: <strong>{evaluation?.hypotheticalOneUnitNetReturn === null || evaluation?.hypotheticalOneUnitNetReturn === undefined ? "Not available" : `${evaluation.hypotheticalOneUnitNetReturn >= 0 ? "+" : ""}${evaluation.hypotheticalOneUnitNetReturn.toFixed(2)} units · ${evaluation.hypotheticalTopOutcomeBets} bets`}</strong></p>
        <small>{evaluation?.disclaimer ?? "Only saved pre-match predictions with confirmed results are evaluated. No historical accuracy claim is made."}</small>
        <div className="football-saved-tickets"><h3>Saved forecast history</h3>{forecastHistory.length === 0 ? <p className="football-muted">No saved pre-kickoff forecasts yet.</p> : forecastHistory.slice(0, 20).map((item, index) => {
          const forecast = item.forecast;
          const outcome = isRecord(forecast.primaryOutcome) && typeof forecast.primaryOutcome.outcome === "string" ? forecast.primaryOutcome.outcome : "No supported result";
          const score = item.result && typeof item.result.home === "number" && typeof item.result.away === "number" ? `${item.result.home}–${item.result.away}` : "Pending final result";
          return <p key={`${String(forecast.fixtureId ?? index)}-${index}`}>{String(forecast.homeTeam ?? "Home")} vs {String(forecast.awayTeam ?? "Away")} · {formatKickoff(String(forecast.kickoff ?? ""), timezone)} · {outcome} · {score}</p>;
        })}</div>
      </section>

      <section className="panel football-panel" aria-labelledby="football-link-heading">
        <div className="panel-heading"><div><div className="panel-kicker">OPTIONAL ONE-TIME LINK</div><h2 id="football-link-heading">Use your tickets in Telegram</h2></div></div>
        <p className="football-muted">Create a 10-minute code here, then privately message <a href="https://t.me/MinesLabSignalsBot" target="_blank" rel="noreferrer">@MinesLabSignalsBot</a> with <code>/link CODE</code>. The bot reads the same saved tickets from Upstash.</p>
        <button type="button" className="secondary-button" disabled={!browserId || loading === "link"} onClick={() => void createLinkCode()}>{loading === "link" ? "Creating…" : "Create link code"}</button>
        {linkCode && <p className="football-link-code" role="status">/link {linkCode} <small>Expires in 10 minutes; single use.</small></p>}
        {!storageReady && <small>Shared browser identity is unavailable.</small>}
      </section>
    </div>
  );
}
