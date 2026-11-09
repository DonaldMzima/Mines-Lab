# Automatic football tickets

The existing Football route now opens a ticket-first workspace: calendar range,
searchable league multi-select and Select All, ZAR stake, strategy, optional
markets, Generate Ticket, a proposed ticket, Save, Send to Telegram, and history.
The former fixture browser, manual planner and evaluation remain lazily mounted
under Advanced. Other Mines Lab pages and game engines are untouched.

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
  The existing `.env` is not modified. Both new-provider keys were absent during
  implementation; live coverage and prices have not been verified.

The [v4 odds documentation](https://the-odds-api.com/liveapi/guides/v4/) supplies
current bookmaker prices. Active sport keys are checked first. Automatic
queries head-to-head and goal totals in one UK region. Explicitly selected
additional markets use the event-odds endpoint. The bookmaker's identity,
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
retrieved within fifteen minutes, updated within six hours, and at least five
minutes before kickoff. Incomplete distributions, invalid prices, unsupported
lines, margins above 15%, and ambiguous identities are ineligible.

Strategy policies are explicit and testable:

- Conservative: at least 65% market-implied win estimate, prices 1.1–2.1,
  at most two distinct fixtures; rank probability minus overround.
- Balanced: at least 45%, prices 1.2–3.5, at most three; rank
  `probability + 0.12 * ln(price) - 2 * overround`.
- High Risk: at least 20%, prices 1.5–8, at most five; rank
  `0.3 * ln(price) + 0.3 * probability - 2 * overround`.

Each proposal uses one bookmaker and at most one selection per fixture. Ties
are deterministic. Tickets are never padded. Bookmaker groups are compared by
supported leg count up to the cap, then average rank. These are policy filters,
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
`/ticketmarkets auto|h2h,totals,...`, `/todaystickets`, `/weekendtickets` and the
existing `/tickets`. Buttons provide league selection, strategy, budget,
generation, explicit saving, history and ticket details. Both surfaces call
the same generator, quote saver, fixture adapter, odds adapter and Redis store.

## Verification

Focused tests are prepared for custom dates, leagues, identity matching,
markets, timestamps, strategy filtering, deterministic same-bookmaker tickets,
no-padding behavior, payouts, cache/credit use, scoped proposal saving,
tamper/expiry rejection, explicit sharing and link ownership. The mocked
Telegram verifier compares website generation and saving with bot commands.
Approved local results: all 39 football tests pass, including server-held quote
saving, calendar windows and initial page rendering. TypeScript checking passes.
The mocked Telegram verifier passes 30 cases / 437 assertions across all fifteen
games, including shared generation and saving. Targeted lint stalled without
results and was interrupted. No build or interactive browser walkthrough was
performed. No live provider, Redis or Telegram call was made; all such test
traffic was intercepted. No success claim is made for live coverage or deployment.

Remaining verification: configure the two free provider keys and confirm actual
account coverage; perform a separately authorized browser walkthrough of calendar,
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
