# Automatic football tickets

The existing Football route now opens a ticket-first workspace: calendar range,
searchable league multi-select and Select All, editable matches/ticket, ticket count,
ZAR stake, target payout, risk preference, Automatic/Custom markets, Generate Tickets,
numbered proposals, Save, Send to Telegram, and history. Defaults: 4 distinct matches,
3 tickets, R20 stake per ticket, R158 target total return, Balanced preference.
The former fixture browser, manual planner and evaluation remain lazily mounted
under Advanced. Other The Winning Edge pages and game engines are untouched.

## Configuration and actual availability

- `FOOTBALL_DATA_API_TOKEN`: free football-data.org v4 fixtures and delayed
  results. Its [documented free coverage](https://www.football-data.org/coverage)
  includes the seven requested European leagues/cups and five additional
  competitions. Account-returned IDs, codes, seasons and `TIER_ONE` are checked
  before enabling leagues. South African Premiership remains unavailable.
- `ODDS_API_KEY`: a free [The Odds API](https://the-odds-api.com/) key. The Starter
  tier currently advertises 500 credits/month, most bookmakers, all sports and
  betting markets, but no historical odds. This is not a guarantee that a
  particular event, bookmaker or market is available in this account.
- Existing API-Football, Redis, Telegram credentials and namespaces remain.
  The existing `.env` is not modified. Current fixture access was verified on
  9 November 2026; see [live results](FOOTBALL_DATA.md). Actual odds-account
  market coverage has not been verified for this enhancement.

The [v4 odds documentation](https://the-odds-api.com/liveapi/guides/v4/) supplies
current bookmaker prices. Active sport keys are checked first. Automatic
evaluates all implemented market families within the existing credit budget in
one UK region. Additional markets are discovered through the event-markets
endpoint (1 credit, recently seen keys only), then retrieved in chunks of up to
8 keys from the event-odds endpoint. Custom limits eligible market keys. The bookmaker's identity,
original decimal price, provider event/market ID, update time and retrieval time
are retained. A provider quote is not a guarantee of availability in the user's
bookmaker account. No paid subscription or package is added.

TheSportsDB remains excluded as a complete fallback because its free schedule
responses are truncated; no unverified full-season coverage is asserted.
API-Football retains only explicitly permitted historical access, without
substituting old matches into the current calendar.

## Dates, cache and free budgets

Custom calendar ranges may span months. A 90-day request ceiling protects free
quotas; this is not a seven-day fixture horizon. football-data.org queries are
split into nine-day SAST windows with exclusive UTC end dates. Every returned
fixture must belong to selected leagues. Large ranges may exhaust the existing
eight-call/minute fixture budget and need a retry after reset; cached windows
are reused. Off-season and international-break empty responses are legitimate;
request failures remain errors, never an empty fixture list.

Odds are cached five minutes, sport coverage one hour. Atomic Redis reservations
cap this app at 400 odds credits per UTC calendar month and 24 requests/minute;
generation requests are capped at 24 estimated credits each. These counters
are conservative, do not refund failed/empty calls, and cannot see another
application's use of the same key. The provider's quota response remains
authoritative, including its account-specific reset date. No automatic payment
or quota upgrade occurs. Partial odds coverage produces visible warnings.

## Selection methodology and limits

No independent current team-strength/form model or validated prediction feed
has been established. The implementation does not fabricate one. Estimates
are explicitly **market-implied**, not verified prediction accuracy or an
independent edge over bookmaker prices.

For a complete mutually exclusive bookmaker market, estimate each event as
`(1 / decimalOdds) / sum(1 / decimalOdds)`. Full-time soccer requires all three
home/draw/away prices. BTTS requires Yes/No. Goal and team-goal totals require
both sides of the same half-goal line; integer lines with unknown push mass
are excluded. Draw-no-bet uses the same bookmaker's complete h2h probabilities
for unconditional win and draw/push probabilities. Double chance uses the sum
of corresponding h2h probabilities and an actual returned double-chance price;
its overlapping outcomes are never normalized as mutually exclusive events.
Unknown selection labels are skipped.

Fixtures must match sport, teams (using only source-provided names/aliases),
orientation, and kickoff within one minute, with a unique match. No fuzzy
guess or related league substitutes for an exact identity. Quotes must be
retrieved within fifteen minutes, updated within fifteen minutes, and at least five
minutes before kickoff. Incomplete distributions, invalid prices, unsupported
lines, margins above 15%, and ambiguous identities are ineligible.

Risk-preference filters remain explicit: Conservative requires at least 65%
market-implied probability and prices 1.1–2.1; Balanced 45% and 1.2–3.5; High Risk
20% and 1.5–8. These are user policy filters, not measured risk categories. All
rankings use probability minus twice the overround. Attractive prices alone get
no ranking bonus. Actual ticket risk is labelled **unassessed**, because no
independent calibrated model, form sample or uncertainty bounds are available.
No independent probability-versus-price value comparison is claimed.

Each proposal uses one bookmaker and at most one selection per fixture. Ties
are deterministic. Tickets are never padded. Bookmaker groups are compared by
supported leg count up to the requested count, then average rank. Only at equal
quality does closeness to target payout break a bookmaker-group tie. The requested
match count overrides the old strategy leg cap. Every returned ticket has exactly
that many fixtures; batches are non-overlapping and stop rather than pad. These are policy filters,
not empirically calibrated betting strategies. No bet is safe or guaranteed.
The product of leg estimates is shown only as an independence scenario, not a
measured full-ticket win rate; correlation and settlement can differ.

If no eligible selections exist, the exact result is:
**No suitable ticket available for these dates and settings.**
Missing keys, provider failures and quota failures show their real cause.
Manual odds entry remains available under Advanced when genuine prices or
usable probabilities are absent.

## Quotes, saving, payout and sharing

The server stores a browser-scoped proposal for ten minutes. Saving uses that
quote, never client-supplied prices. Edits may remove legs or change stake;
other edits require regeneration. Kickoff, quote age and ownership are checked
again. Combined odds multiply actual decimal prices; total return is stake
times that product, and net profit subtracts stake, with cents rounding and
safe numeric bounds. Every leg must win for the displayed full return. Draws,
pushes or void legs change settlement; nothing places a bet.

Existing ticket records/keys and manual/legacy formats remain readable. New
records add an explicit The Odds API source and optional quote/estimate fields.
No stored record is rewritten or deleted. Existing forward Telegram links
remain valid. New one-time linking atomically adds a reverse index so an
explicit website Send action can target only its currently linked private
chat. Older links may need renewal for website delivery; `/tickets` continues
to use the unchanged forward link. Sends are throttled per saved ticket and
reported successful only after the Bot API acknowledges delivery.

Telegram `/football` now opens ticket controls. Commands include
`/footballticket`, `/generateticket`, `/ticketdates START END`,
`/ticketbudget ZAR`, `/ticketstrategy conservative|balanced|high-risk`,
`/ticketmarkets auto|h2h,totals,...`, `/ticketmatches 4`, `/ticketcount 3`,
`/tickettarget 158`, `/todaystickets`, `/weekendtickets` and the
existing `/tickets`. Buttons provide league selection, strategy, budget,
generation, explicit saving, history and ticket details. Both surfaces call
the same generator, quote saver, fixture adapter, odds adapter and Redis store.

## Verification

Focused tests are prepared for custom dates, leagues, identity matching,
markets, timestamps, strategy filtering, deterministic same-bookmaker tickets,
no-padding behavior, payouts, cache/credit use, scoped proposal saving,
tamper/expiry rejection, explicit sharing and link ownership. The mocked
Telegram verifier compares website generation and saving with bot commands.
Historical checks before this market expansion: all 39 football tests passed, including server-held quote
saving, calendar windows and initial page rendering. TypeScript checking passes.
The mocked Telegram verifier passes 30 cases / 437 assertions across all fifteen
games, including shared generation and saving. Targeted lint stalled without
results and was interrupted. No build or interactive browser walkthrough was
performed. No live provider, Redis or Telegram call was made; all such test
traffic was intercepted. No success claim is made for live coverage or deployment.

This enhancement has not been tested or typechecked. Focused test cases and
the mocked Telegram parity fixture were updated but not executed.

Remaining verification: confirm actual odds account coverage; perform a separately authorized browser walkthrough of calendar,
league selection, generation, leg/stake edits, save/history, linking and explicit
Telegram delivery; complete lint/build checks in an environment where they run.

## Exact file inventory

New files:

- `src/lib/football/ticket-generation-types.ts`
- `src/lib/football/ticket-generator.ts`
- `src/lib/football/ticket-math.ts`
- `src/lib/football/odds-provider.ts`
- `src/lib/football/ticket-format.ts`
- `src/lib/football/ticket-share.ts`
- `src/lib/football/ticket-generator.test.ts`
- `src/lib/telegram/football-tickets.ts`
- `src/components/football-ticket-workspace.tsx`
- `src/app/api/football/generate/route.ts`
- `src/app/api/football/tickets/send/route.ts`
- `docs/FOOTBALL_TICKETS.md`

Updated files:

- `src/lib/football/types.ts`
- `src/lib/football/dates.ts`
- `src/lib/football/football-data.ts`
- `src/lib/football/storage.ts`
- `src/lib/football/football.test.cjs`
- `src/lib/football/fixture-providers.test.ts`
- `src/app/api/football/tickets/route.ts`
- `src/app/football/page.tsx`
- `src/components/football-workspace.tsx`
- `src/app/globals.css`
- `src/lib/telegram/bot.ts`
- `scripts/verify-telegram.cjs`
- `.env.example`
- `README.md`
- `docs/FOOTBALL_DATA.md`

## Market expansion and explicit odds formats

Implemented eligible keys (only when actually returned with valid quotes):

- Full time: h2h, totals, double_chance, draw_no_bet, btts, team_totals.
- Periods: h2h_3_way_h1, h2h_3_way_h2, totals_h1, totals_h2, btts_h1.
- Alternate goal lines: alternate_totals, alternate_team_totals.

Home/away team-goal identity comes from the provider outcome description. Half
result markets require exactly home/draw/away; totals require both sides of a
half-goal line. Integer/quarter lines, two-way half results and unknown labels
are rejected. Period identities remain distinct; a second-half result refers
only to that half. Full-match markets are regulation time; bookmaker cancellation,
postponement, abandonment and void rules still govern actual settlement.

The provider [documents these keys](https://the-odds-api.com/sports-odds-data/betting-markets.html),
but documentation is not proof of this account’s current bookmaker availability.
Correct score and half-time/full-time are documented provider markets but remain
disabled: no complete exhaustive outcome parser or settlement mapping is implemented.
Winning margin, clean sheet, first/last team to score and the four requested combined
markets remain unavailable in this adapter. No combined price is manufactured from
individual prices. Screenshots do not grant access to Hollywoodbets prices; no
scraping or private endpoints are used. No screenshots were attached in this turn,
so no specific displayed number was interpreted as a verified quote.

[Hollywoodbets explains fractional and decimal display options](https://blog.hollywoodbets.net/faq/what-are-betting-odds-and-how-to-read/).
The normalization utility requires an explicit format and source: decimal is
unchanged; fractional profit/stake is converted with 1 + numerator/denominator
(or 1 + an explicitly fractional numeric ratio); American uses 1 + positive/100
or 1 + 100/absolute-negative. A fractional 0.50 becomes decimal 1.50 only when
its format is explicitly known. Unknown/ambiguous formats, invalid prices and
unsupported bounds are rejected. The live adapter explicitly requests decimal
from The Odds API and retains its original value, format and source in Redis.
Website and Telegram display the same normalized price to three decimal places.

Server-held proposals remain authoritative when saving. New optional saved-ticket
number/target fields preserve old records. Fixtures and odds are retrieved once per
batch; there is no quota-spending retry per requested ticket. Missing/insufficient
statistics are stated as a limitation rather than invented confidence. Quoted
market-implied probabilities and independence scenarios are not success forecasts.

Files changed for this enhancement only:

- New: src/lib/football/odds-normalization.ts
- src/lib/football/ticket-generation-types.ts
- src/lib/football/types.ts
- src/lib/football/odds-provider.ts
- src/lib/football/ticket-generator.ts
- src/lib/football/ticket-format.ts
- src/lib/football/ticket-share.ts
- src/lib/football/ticket-generator.test.ts
- src/lib/football/football.test.cjs
- src/app/api/football/generate/route.ts
- src/components/football-ticket-workspace.tsx
- src/lib/telegram/football-tickets.ts
- scripts/verify-telegram.cjs
- docs/FOOTBALL_TICKETS.md

No terminal commands, tests, builds, Git, deployment, live odds or real Telegram
delivery were executed for this enhancement. Prior check results do not validate
these edits. No credentials, environment names, Python files or casino modules changed.

Large Telegram tickets are split at line boundaries so fixtures and payout totals
are not silently truncated; save controls accompany the final proposal part.
