"use client";

import { useEffect, useMemo, useState } from "react";
import { FootballWorkspace, browserIdentifier } from "./football-workspace";
import { timezoneDate, periodRange } from "@/lib/football/dates";
import { calculateTicketPayout } from "@/lib/football/ticket-math";
import { TICKET_MARKETS, type GeneratedFootballTicket, type TicketMarketKey, type TicketStrategy } from "@/lib/football/ticket-generation-types";
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
  const [stake, setStake] = useState("10");
  const [strategy, setStrategy] = useState<TicketStrategy>("conservative");
  const [markets, setMarkets] = useState<TicketMarketKey[]>([]);
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
  const clear = () => { setProposal(null); setSaved(null); setNotice(""); };

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

  async function generate() {
    clear(); setBusy("generate"); setError("");
    try {
      const result = await json<GeneratedFootballTicket>("/api/football/generate", { browserId, dates: { start, end }, competitionIds: selected, stakeZar: Number(stake), strategy, markets });
      setProposal(result); setLegIds(result.selections.map(row => row.fixtureId));
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
    <header className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> FOOTBALL LAB</div><h1>Your next <span>ticket.</span></h1><p>Choose dates, leagues and a budget. Generate only supported selections with actual quoted prices.</p></div></header>
    {error && <div className="football-alert" role="alert">{error}</div>}
    {notice && <div className="football-notice" role="status">{notice}</div>}
    <section className="panel football-panel" aria-labelledby="generate-ticket-heading">
      <h2 id="generate-ticket-heading">Generate a ticket</h2>
      <fieldset className="football-ticket-form" disabled={Boolean(busy)}>
      <div className="football-controls football-ticket-inputs">
        <label>From<input type="date" value={start} onChange={event => { setStart(event.target.value); clear(); }} /></label>
        <label>Through<input type="date" value={end} min={start} onChange={event => { setEnd(event.target.value); clear(); }} /></label>
        <label>Stake (ZAR)<input type="number" min="1" max="100000" step="0.01" value={stake} onChange={event => { setStake(event.target.value); setSaved(null); }} /></label>
        <label>Strategy<select value={strategy} onChange={event => { setStrategy(event.target.value as TicketStrategy); clear(); }}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="high-risk">High Risk</option></select></label>
      </div>
      <div className="football-periods"><button type="button" className="text-button" onClick={() => { const today = timezoneDate(new Date()); setStart(today); setEnd(today); clear(); }}>Today</button><button type="button" className="text-button" onClick={() => { const range = periodRange("weekend"); setStart(range.start < timezoneDate(new Date()) ? timezoneDate(new Date()) : range.start); setEnd(range.end); clear(); }}>Weekend</button><span className="football-muted">Use the calendar for any available future dates, including next month.</span></div>
      <details className="football-league-picker" open><summary>Choose leagues <span>{selected.length} selected</span></summary>
        <label className="football-search">Search leagues<input value={search} onChange={event => setSearch(event.target.value)} placeholder="League or country" maxLength={80} /></label>
        <div className="football-league-actions"><button type="button" className="text-button" onClick={() => { setSelectedIds(competitions.filter(row => row.available !== false).map(row => row.id)); clear(); }}>Select All available</button><button type="button" className="text-button" onClick={() => { setSelectedIds([]); clear(); }}>Clear</button><button type="button" className="text-button" onClick={() => { try { window.localStorage.setItem("mines-lab:football:league-selection:v1", JSON.stringify(selected)); setNotice("Leagues saved in this browser."); } catch { setError("Could not save league choices."); } }}>Save leagues</button></div>
        {!competitions.length && <p className="football-muted">{setup ? "Current fixture coverage is not available. See setup details below." : "Loading leagues…"}</p>}
        <fieldset className="football-league-options"><legend className="sr-only">Ticket leagues</legend>{competitions.filter(row => `${row.name} ${row.country ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(row => <label className="football-league-option" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} disabled={row.available === false} onChange={event => { setSelectedIds(ids => event.target.checked ? [...new Set([...ids, row.id])] : ids.filter(id => id !== row.id)); clear(); }} /><span><strong>{row.name}</strong><small>{row.available === false ? row.unavailableReason : row.country}</small></span></label>)}</fieldset>
      </details>
      <details className="football-details"><summary>Betting markets · {markets.length ? `${markets.length} selected` : "Automatic"}</summary><p>Automatic evaluates available match-result and goal-total prices. Other markets are queried only when selected and genuinely returned by the bookmaker.</p><button type="button" className="text-button" onClick={() => { setMarkets([]); clear(); }}>Use Automatic</button><div className="football-league-options">{TICKET_MARKETS.map(market => <label className="football-check" key={market.key}><input type="checkbox" checked={markets.includes(market.key)} onChange={event => { setMarkets(keys => event.target.checked ? [...keys, market.key] : keys.filter(key => key !== market.key)); clear(); }} />{market.label}</label>)}</div></details>
      <p className="football-muted">{strategy === "high-risk" ? "Higher loss risk. Longer accumulators compound risk." : strategy === "conservative" ? "Fewer selections with higher market-implied probabilities. No bet is safe." : "Balance market-implied probabilities, prices and uncertainty."}</p>
      <button type="button" className="primary-button football-generate-button" disabled={Boolean(busy) || !browserId || !selected.length || !start || !end || !Number.isFinite(Number(stake)) || Number(stake) < 1} onClick={() => void generate()}>{busy === "generate" ? "Finding supported selections…" : "Generate Ticket"}</button>
      </fieldset>
    </section>

    {proposal && <section className="panel football-panel football-generated-ticket" aria-labelledby="generated-ticket-heading"><h2 id="generated-ticket-heading">{proposal.selections.length ? "Your proposed ticket" : "No suitable ticket"}</h2><p role="status">{proposal.message}</p>{proposal.warnings.map((warning, i) => <p className="football-notice" key={i}>{warning}</p>)}
      {proposal.selections.length > 0 && <><p>{proposal.riskLabel}</p><ol className="football-proposed-legs">{legs.map(row => <li key={row.fixtureId}><div><strong>{row.homeTeam} vs {row.awayTeam}</strong><small>{time(row.kickoff)} · {row.competition}</small><p>{row.market}: <strong>{row.selection}</strong> · <strong>{row.decimalOdds.toFixed(3)}</strong></p><small>{row.bookmaker} · The Odds API</small><small>Retrieved {time(row.oddsObservedAt!)} · bookmaker update {time(row.oddsUpdatedAt!)}</small><small>Market-implied estimate {(row.estimatedProbability * 100).toFixed(1)}%{row.pushProbability ? ` · draw/push ${(row.pushProbability * 100).toFixed(1)}%` : ""}; not verified accuracy.</small></div><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { setLegIds(ids => ids.filter(id => id !== row.fixtureId)); setSaved(null); }}>Remove leg</button></li>)}</ol>
      {payout && <div className="football-ticket-estimate"><span>Combined odds <strong>{payout.combinedOdds.toFixed(3)}</strong></span><span>Stake R{payout.stakeZar.toFixed(2)}</span><span>Potential total return <strong>R{payout.potentialReturnZar.toFixed(2)}</strong></span><span>Potential net profit R{payout.potentialProfitZar.toFixed(2)}</span><small>Full-win market-implied scenario: {(legs.reduce((p, row) => p * row.estimatedProbability, 1) * 100).toFixed(1)}%, assuming independence. This is not measured accuracy.</small></div>}
      <p className="football-muted">Every leg must win for the full displayed return. A draw/void in an applicable market changes the payout. Prices can change; no bet is placed.</p><div className="football-fixture-actions"><button type="button" className="primary-button" disabled={Boolean(busy) || !payout || !legs.length} onClick={() => void save()}>{busy === "save" ? "Saving…" : saved ? "Saved" : "Save Ticket"}</button><button type="button" className="secondary-button" disabled={Boolean(busy) || !saved} onClick={() => saved && void send(saved.id)}>Send to Telegram</button><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { setLegIds(proposal.selections.map(row => row.fixtureId)); setSaved(null); }}>Restore proposed legs</button></div><p className="football-muted">Edit the stake above or remove legs, then save. Quoted proposals expire after ten minutes.</p></>}
      <details className="football-details"><summary>Selection methodology</summary><p>{proposal.methodology}</p></details><button type="button" className="text-button" onClick={() => setAdvancedOpen(true)}>Use manual odds entry instead</button>
    </section>}

    <section className="panel football-panel" aria-labelledby="ticket-history-heading"><h2 id="ticket-history-heading">Ticket History</h2>{!tickets.length && <p className="football-muted">Your saved tickets will appear here and in your linked Telegram chat.</p>}{tickets.slice(0, 20).map(ticket => <details className="football-saved-ticket" key={ticket.id}><summary>{time(ticket.createdAt)} · R{ticket.stakeZar.toFixed(2)} · odds {ticket.combinedOdds.toFixed(3)}</summary>{ticket.selections.map(row => <p key={row.fixtureId}>{row.homeTeam} vs {row.awayTeam} · {row.market}: {row.selection} @ {row.decimalOdds.toFixed(3)} · {row.oddsSource} · {row.bookmaker}</p>)}<p>Potential return R{ticket.potentialReturnZar.toFixed(2)} · net profit R{ticket.potentialProfitZar.toFixed(2)}</p><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void send(ticket.id)}>Send to Telegram</button></details>)}</section>
    <details className="panel football-panel"><summary>Link @MinesLabSignalsBot</summary><p>Create a one-time link, then privately send <code>/link CODE</code> to <a href="https://t.me/MinesLabSignalsBot" target="_blank" rel="noreferrer">@MinesLabSignalsBot</a>. Saved tickets are shared through Redis.</p><button type="button" className="secondary-button" disabled={!browserId || Boolean(busy)} onClick={() => void link()}>Create one-time link</button>{linkCode && <p className="football-link-code">/link {linkCode}<small>Single use · expires in ten minutes</small></p>}</details>
    <details className="panel football-panel"><summary>Setup &amp; limits</summary>{setup && <p className="football-alert">{setup}</p>}<p>Free football-data.org fixtures and The Odds API prices require separate server-only keys. Availability, schedules and market coverage depend on the accounts. No historical match is substituted. Free quotas are enforced across instances.</p><p>Calendar requests allow up to 90 days, split into provider-supported windows. Large requests may require a retry after the minute quota resets. Odds often become available only near kickoff.</p></details>
    <details className="panel football-panel football-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>Advanced · manual planner, fixtures &amp; analysis</summary>{advancedOpen && <FootballWorkspace />}</details>
  </div>;
}
