"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceHeader } from "./workspace-ui";
import { FootballWorkspace, browserIdentifier } from "./football-workspace";
import { timezoneDate, periodRange } from "@/lib/football/dates";
import { calculateTicketPayout } from "@/lib/football/ticket-math";
import { TICKET_MARKETS, type GeneratedFootballTickets, type GeneratedFootballTicket, type TicketMarketKey, type TicketStrategy } from "@/lib/football/ticket-generation-types";
import type { FootballCompetition, FootballTicket } from "@/lib/football/types";

async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The football request failed.");
  return data as T;
}
const time = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";

export function FootballTicketWorkspace() {
  const [browserId, setBrowserId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [competitions, setCompetitions] = useState<FootballCompetition[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [stake, setStake] = useState("20");
  const [strategy, setStrategy] = useState<TicketStrategy>("balanced");
  const [markets, setMarkets] = useState<TicketMarketKey[]>([]);
  const [matchesPerTicket, setMatchesPerTicket] = useState("4");
  const [ticketCount, setTicketCount] = useState("3");
  const [targetPayout, setTargetPayout] = useState("158");
  const [batch, setBatch] = useState<GeneratedFootballTicket[]>([]);
  const [proposal, setProposal] = useState<GeneratedFootballTicket | null>(null);
  const [legIds, setLegIds] = useState<number[]>([]);
  const [saved, setSaved] = useState<FootballTicket | null>(null);
  const [tickets, setTickets] = useState<FootballTicket[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [setup, setSetup] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selected = useMemo(() => selectedIds.filter(id => competitions.some(row => row.id === id && row.available !== false)), [selectedIds, competitions]);
  const legs = proposal?.selections.filter(row => legIds.includes(row.fixtureId)) ?? [];
  let payout: ReturnType<typeof calculateTicketPayout> | null = null;
  try { if (legs.length) payout = calculateTicketPayout(Number(stake), legs.map(row => row.decimalOdds)); } catch { /* Input message is shown on save/generate. */ }
  const clear = () => { setBatch([]); setProposal(null); setSaved(null); setNotice(""); };

  useEffect(() => {
    let active = true;
    const today = timezoneDate(new Date());
    setStart(today); setEnd(today);
    try {
      const id = browserIdentifier(); setBrowserId(id);
      const savedIds: unknown = JSON.parse(window.localStorage.getItem("mines-lab:football:league-selection:v1") ?? "[]");
      if (Array.isArray(savedIds) && savedIds.length <= 12 && savedIds.every(id => Number.isSafeInteger(id))) setSelectedIds(savedIds);
      json<{ tickets: FootballTicket[] }>(`/api/football/tickets?browserId=${encodeURIComponent(id)}`).then(value => { if (active) setTickets(value.tickets); }).catch(cause => { if (active) setError(cause.message); });
    } catch { setError("Browser storage is unavailable. Ticket generation and linked saving need a browser identity."); }
    json<{ competitions: FootballCompetition[]; message: string | null }>("/api/football/competitions").then(value => { if (active) { setCompetitions(value.competitions); setSetup(value.message ?? ""); } }).catch(cause => { if (active) setSetup(cause.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const revealAnalysis = () => {
      if (window.location.hash === "#match-analysis") setAdvancedOpen(true);
      if (window.location.hash === "#telegram-link") {
        const target = document.getElementById("telegram-link");
        if (target instanceof HTMLDetailsElement) target.open = true;
      }
    };
    revealAnalysis();
    window.addEventListener("hashchange", revealAnalysis);
    return () => window.removeEventListener("hashchange", revealAnalysis);
  }, []);

  async function generate() {
    clear(); setBusy("generate"); setError("");
    try {
      const result = await json<GeneratedFootballTickets>("/api/football/generate", { matchesPerTicket: Number(matchesPerTicket), ticketCount: Number(ticketCount), targetPayoutZar: Number(targetPayout), browserId, dates: { start, end }, competitionIds: selected, stakeZar: Number(stake), strategy, markets });
      setBatch(result.tickets); setProposal(result.tickets[0] ?? null); setLegIds(result.tickets[0]?.selections.map(row => row.fixtureId) ?? []); setNotice([result.message, ...result.warnings].join(" "));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ticket generation failed."); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!proposal?.proposalId) return;
    setBusy("save"); setError("");
    try {
      const result = await json<{ ticket: FootballTicket; duplicate: boolean }>("/api/football/tickets", { browserId, proposalId: proposal.proposalId, selectedFixtureIds: legIds, stakeZar: Number(stake) });
      setSaved(result.ticket); setTickets(rows => [result.ticket, ...rows.filter(row => row.id !== result.ticket.id)]); setNotice(result.duplicate ? "This ticket is already saved." : "Ticket saved. No bet was placed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ticket saving failed."); }
    finally { setBusy(""); }
  }
  async function send(ticketId: string) {
    setBusy("send"); setError("");
    try { await json("/api/football/tickets/send", { browserId, ticketId }); setNotice("Ticket sent to your linked private Telegram chat."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Telegram delivery failed."); }
    finally { setBusy(""); }
  }
  async function link() {
    setBusy("link"); setError("");
    try { const result = await json<{ code: string }>("/api/football/link", { browserId }); setLinkCode(result.code); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Link creation failed."); }
    finally { setBusy(""); }
  }

  return <div className="page-wrap football-workspace football-ticket-workspace">
    <WorkspaceHeader eyebrow="FOOTBALL LAB" title="Build your next ticket." description="Real fixtures. Available market prices. Clear limits. Plan your selections and keep your saved tickets together." actions={<a className="secondary-button" href="#saved-tickets">View saved tickets</a>} />
    {error && <div className="football-alert" role="alert">{error}</div>}
    {notice && <div className="football-notice" role="status">{notice}</div>}
    <section className="panel football-panel" aria-labelledby="generate-ticket-heading">
      <h2 id="generate-ticket-heading">Generate tickets</h2>
      <fieldset className="football-ticket-form" disabled={Boolean(busy)}>
      <div className="lab-form-section"><div className="lab-section-title"><span>01</span><div><h3>Choose your fixtures</h3><p>Set your calendar range and select the leagues to include.</p></div></div>
      <div className="football-controls football-ticket-inputs">
        <label>From<input type="date" value={start} onChange={event => { setStart(event.target.value); clear(); }} /></label>
        <label>Through<input type="date" value={end} min={start} onChange={event => { setEnd(event.target.value); clear(); }} /></label>
      </div>
      <div className="football-periods"><button type="button" className="text-button" onClick={() => { const today = timezoneDate(new Date()); setStart(today); setEnd(today); clear(); }}>Today</button><button type="button" className="text-button" onClick={() => { const range = periodRange("weekend"); setStart(range.start < timezoneDate(new Date()) ? timezoneDate(new Date()) : range.start); setEnd(range.end); clear(); }}>Weekend</button><span className="football-muted">Use the calendar for any available future dates, including next month.</span></div>
      <details className="football-league-picker" open><summary>Choose leagues <span>{selected.length} selected</span></summary>
        <label className="football-search">Search leagues<input value={search} onChange={event => setSearch(event.target.value)} placeholder="League or country" maxLength={80} /></label>
        <div className="football-league-actions"><button type="button" className="text-button" onClick={() => { setSelectedIds(competitions.filter(row => row.available !== false).map(row => row.id)); clear(); }}>Select All available</button><button type="button" className="text-button" onClick={() => { setSelectedIds([]); clear(); }}>Clear</button><button type="button" className="text-button" onClick={() => { try { window.localStorage.setItem("mines-lab:football:league-selection:v1", JSON.stringify(selected)); setNotice("Leagues saved in this browser."); } catch { setError("Could not save league choices."); } }}>Save leagues</button></div>
        {!competitions.length && <p className="football-muted">{setup ? "Current fixture coverage is not available. See setup details below." : "Loading leagues…"}</p>}
        <fieldset className="football-league-options"><legend className="sr-only">Ticket leagues</legend>{competitions.filter(row => `${row.name} ${row.country ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(row => <label className="football-league-option" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} disabled={row.available === false} onChange={event => { setSelectedIds(ids => event.target.checked ? [...new Set([...ids, row.id])] : ids.filter(id => id !== row.id)); clear(); }} /><span><strong>{row.name}</strong><small>{row.available === false ? row.unavailableReason : row.country}</small></span></label>)}</fieldset>
      </details>
      </div>
      <div className="lab-form-section"><div className="lab-section-title"><span>02</span><div><h3>Shape your tickets</h3><p>Choose a budget and preferences. Your target is never a guaranteed payout.</p></div></div><div className="football-controls football-ticket-inputs">
        <label>Stake (ZAR)<input type="number" min="1" max="100000" step="0.01" value={stake} onChange={event => { setStake(event.target.value); setSaved(null); }} /></label>
        <label>Matches per ticket<input type="number" min="1" max="10" value={matchesPerTicket} onChange={event => { setMatchesPerTicket(event.target.value); clear(); }} /></label>
        <label>Number of tickets<input type="number" min="1" max="5" value={ticketCount} onChange={event => { setTicketCount(event.target.value); clear(); }} /></label>
        <label>Target total payout (ZAR)<input type="number" min="1" max="10000000" value={targetPayout} onChange={event => { setTargetPayout(event.target.value); clear(); }} /></label>
        <label>Risk preference<select value={strategy} onChange={event => { setStrategy(event.target.value as TicketStrategy); clear(); }}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="high-risk">High Risk</option></select></label>
      </div>
      </div>
      <div className="lab-form-section lab-market-section"><div className="lab-section-title"><span>03</span><div><h3>Choose eligible markets</h3><p>Automatic evaluates implemented markets when genuine quotes are available.</p></div></div><label>Betting markets<select value={markets.length ? "custom" : "automatic"} onChange={event => { setMarkets(event.target.value === "automatic" ? [] : TICKET_MARKETS.map(market => market.key)); clear(); }}><option value="automatic">Automatic</option><option value="custom">Custom</option></select></label>
      <details className="football-details"><summary>Betting markets · {markets.length ? `${markets.length} selected` : "Automatic"}</summary><p>Automatic evaluates all implemented markets within the free credit budget. Custom restricts eligible markets; only complete fresh returned quotes qualify. Risk remains unassessed without an independent model.</p><button type="button" className="text-button" onClick={() => { setMarkets([]); clear(); }}>Use Automatic</button><div className="football-league-options">{TICKET_MARKETS.map(market => <label className="football-check" key={market.key}><input type="checkbox" checked={markets.includes(market.key)} onChange={event => { setMarkets(keys => event.target.checked ? [...keys, market.key] : keys.filter(key => key !== market.key)); clear(); }} />{market.label}</label>)}</div></details>
      </div>
      <p className="football-muted">{strategy === "high-risk" ? "Higher loss risk. Longer accumulators compound risk." : strategy === "conservative" ? "Higher market-implied probability filter; this does not measure safety." : "Balance market-implied probabilities, prices and uncertainty."}</p>
      <button type="button" className="primary-button football-generate-button" disabled={Boolean(busy) || !browserId || !selected.length || !start || !end || !Number.isFinite(Number(stake)) || Number(stake) < 1} onClick={() => void generate()}>{busy === "generate" ? "Finding supported selections…" : "Generate Tickets"}</button>
      </fieldset>
    </section>

    {batch.length > 0 && <section className="panel football-panel lab-ticket-batch"><h2>Generated tickets</h2><p>Target payout is a preference. Risk is unassessed; no winnings are guaranteed. No calibrated independent probability model is available.</p>{batch.map((ticket, index) => <article className="football-saved-ticket lab-ticket-card" key={ticket.proposalId}><div className="lab-ticket-card-heading"><strong>Ticket {index + 1}</strong><span className="lab-risk-badge">Risk unassessed</span></div><small>{ticket.selections.length} distinct matches · {ticket.settings.strategy} preference</small><ul className="lab-ticket-preview">{ticket.selections.map(row => <li key={row.fixtureId}><strong>{row.homeTeam} <span>vs</span> {row.awayTeam}</strong><span>{row.market} · {row.selection}</span><b>{row.decimalOdds.toFixed(3)}</b></li>)}</ul><dl className="lab-ticket-totals"><div><dt>Combined odds</dt><dd>{ticket.combinedOdds?.toFixed(3)}</dd></div><div><dt>Stake</dt><dd>R{ticket.settings.stakeZar.toFixed(2)}</dd></div><div><dt>Potential total return</dt><dd>R{ticket.potentialReturnZar?.toFixed(2)}</dd></div><div><dt>Potential net profit</dt><dd>R{ticket.potentialProfitZar?.toFixed(2)}</dd></div></dl><p>{ticket.targetAchieved ? "Target reached by quoted full-win payout" : "Target not reached; no weaker legs added"}</p><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { setProposal(ticket); setLegIds(ticket.selections.map(row => row.fixtureId)); setStake(String(ticket.settings.stakeZar)); setSaved(null); }}>View / edit / save ticket {index + 1}</button></article>)}</section>}
    {proposal && <section className="panel football-panel football-generated-ticket" aria-labelledby="generated-ticket-heading"><h2 id="generated-ticket-heading">{proposal.selections.length ? "Your proposed ticket" : "No suitable ticket"}</h2><p role="status">{proposal.message}</p>{proposal.warnings.map((warning, i) => <p className="football-notice" key={i}>{warning}</p>)}
      {proposal.selections.length > 0 && <><p>Ticket {proposal.ticketNumber ?? 1} · {proposal.riskLabel}</p><ol className="football-proposed-legs">{legs.map(row => <li key={row.fixtureId}><div><strong>{row.homeTeam} vs {row.awayTeam}</strong><small>{time(row.kickoff)} · {row.competition}</small><p>{row.market}: <strong>{row.selection}</strong> · <strong>{row.decimalOdds.toFixed(3)}</strong></p><small>{row.bookmaker} · The Odds API</small><small>Retrieved {time(row.oddsObservedAt!)} · bookmaker update {time(row.oddsUpdatedAt!)}</small><details><summary>Selection explanation &amp; risk</summary><p>{row.selectionReason}</p><p>{row.riskExplanation}</p><small>Original quote: {row.originalOdds?.value ?? row.decimalOdds} ({row.originalOdds?.format ?? "decimal"}) · {row.originalOdds?.source ?? row.oddsSource}</small><small>Raw quote-implied probability {(100 / row.decimalOdds).toFixed(1)}% · margin-adjusted market estimate {(row.estimatedProbability * 100).toFixed(1)}%{row.pushProbability ? ` · draw/push ${(row.pushProbability * 100).toFixed(1)}%` : ""}; not an independent success forecast or verified accuracy.</small></details></div><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { setLegIds(ids => ids.filter(id => id !== row.fixtureId)); setSaved(null); }}>Remove leg</button></li>)}</ol>
      {payout && <div className="football-ticket-estimate"><span>Combined odds <strong>{payout.combinedOdds.toFixed(3)}</strong></span><span>Stake R{payout.stakeZar.toFixed(2)}</span><span>Potential total return <strong>R{payout.potentialReturnZar.toFixed(2)}</strong></span><span>Potential net profit R{payout.potentialProfitZar.toFixed(2)}</span><span>Target R{Number(targetPayout).toFixed(2)}: {payout.potentialReturnZar >= Number(targetPayout) ? "reached by full-win payout" : "not reached"}</span><small>Full-win market-implied scenario: {(legs.reduce((p, row) => p * row.estimatedProbability, 1) * 100).toFixed(1)}%, assuming independence. This is not measured accuracy.</small></div>}
      <p className="football-muted">Every leg must win for the full displayed return. A draw/void in an applicable market changes the payout. Prices can change; no bet is placed.</p><div className="football-fixture-actions"><button type="button" className="primary-button" disabled={Boolean(busy) || !payout || !legs.length} onClick={() => void save()}>{busy === "save" ? "Saving…" : saved ? "Saved" : "Save Ticket"}</button><button type="button" className="secondary-button" disabled={Boolean(busy) || !saved} onClick={() => saved && void send(saved.id)}>Send to Telegram</button><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { setLegIds(proposal.selections.map(row => row.fixtureId)); setSaved(null); }}>Restore proposed legs</button></div><p className="football-muted">Edit the stake above or remove legs, then save. Quoted proposals expire after ten minutes.</p></>}
      <details className="football-details"><summary>Selection methodology</summary><p>{proposal.methodology}</p></details><button type="button" className="text-button" onClick={() => setAdvancedOpen(true)}>Use manual odds entry instead</button>
    </section>}

    <section id="saved-tickets" className="panel football-panel" aria-labelledby="ticket-history-heading"><h2 id="ticket-history-heading">Ticket History</h2>{!tickets.length && <p className="football-muted">Your saved tickets will appear here and in your linked Telegram chat.</p>}{tickets.slice(0, 20).map(ticket => <details className="football-saved-ticket" key={ticket.id}><summary>{time(ticket.createdAt)} · R{ticket.stakeZar.toFixed(2)} · odds {ticket.combinedOdds.toFixed(3)}</summary>{ticket.selections.map(row => <p key={row.fixtureId}>{row.homeTeam} vs {row.awayTeam} · {row.market}: {row.selection} @ {row.decimalOdds.toFixed(3)} · {row.oddsSource} · {row.bookmaker}</p>)}<p>Potential return R{ticket.potentialReturnZar.toFixed(2)} · net profit R{ticket.potentialProfitZar.toFixed(2)}</p><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void send(ticket.id)}>Send to Telegram</button></details>)}</section>
    <details id="telegram-link" className="panel football-panel lab-telegram-panel"><summary>Link @MinesLabSignalsBot</summary><p className="lab-integration-intro">Connect your saved tickets to your private Telegram chat.</p><ol className="lab-link-steps"><li>Create a one-time link using the button below.</li><li>Privately send <code>/link CODE</code> to <a href="https://t.me/MinesLabSignalsBot" target="_blank" rel="noreferrer">@MinesLabSignalsBot</a>. </li><li>Saved tickets are shared through the existing backend. Linking does not enable automatic betting.</li></ol><button type="button" className="secondary-button" disabled={!browserId || Boolean(busy)} onClick={() => void link()}>Create one-time link</button>{linkCode && <p className="football-link-code">/link {linkCode}<small>Single use · expires in ten minutes</small></p>}</details>
    <details className="panel football-panel"><summary>Setup &amp; limits</summary><p>Unavailable for automatic selection: correct score, half-time/full-time, winning margin, clean sheet, first/last team to score and combined markets. Complete outcome definitions and settlement parsing are not implemented. Detailed team-statistics models and measured success probabilities are unavailable; quoted market estimates are not evidence of value.</p>{setup && <p className="football-alert">{setup}</p>}<p>Free football-data.org fixtures and The Odds API prices require separate server-only keys. Availability, schedules and market coverage depend on the accounts. No historical match is substituted. Free quotas are enforced across instances.</p><p>Calendar requests allow up to 90 days, split into provider-supported windows. Large requests may require a retry after the minute quota resets. Odds often become available only near kickoff.</p></details>
    <details id="match-analysis" className="panel football-panel football-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>Advanced · manual planner, fixtures &amp; analysis</summary>{advancedOpen && <FootballWorkspace />}</details>
  </div>;
}
