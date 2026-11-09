# Football data and league selection

The default page is now the [automatic ticket workspace](FOOTBALL_TICKETS.md).
The fixture browser and manual planner described below remain under Advanced.
The Odds API can supply actual bookmaker prices independently of fixtures;
its prices are never inferred from unavailable fixture-source predictions.

## Current fixtures

Current fixtures and delayed results use the free football-data.org v4 adapter
(`src/lib/football/football-data.ts`). Configure `FOOTBALL_DATA_API_TOKEN` on the
server from a free account. Do not expose it as a `NEXT_PUBLIC_` variable. The
existing `.env` credentials are unchanged. Restart the local server after
setting it; deployment environment changes require a new deployment by the operator.

The provider's [free coverage](https://www.football-data.org/coverage) lists
Premier League, La Liga, Serie A (Italy), Bundesliga, Ligue 1, Champions League,
Eredivisie, Primeira Liga, Championship, Brazil Serie A, World Cup, and European
Championship. The catalogue only enables entries returned with matching IDs,
codes, a current season, and `TIER_ONE` by the configured account. This is
documented coverage, not a claim that this account has passed a live check.

South African Premiership is displayed as unavailable. It is absent from that
free list. No unrelated competition is substituted.

The [free plan](https://www.football-data.org/pricing) has delayed schedules and
scores and 10 calls/minute. Predictions, bookmaker odds, detailed statistics
and paid add-ons are not requested or fabricated. Redis caches competitions
for 24 hours, fixture responses for 15 minutes, and normalized fixture records
for 15 minutes. An atomic Redis counter allows eight upstream calls/minute,
leaving headroom. Selected leagues are fetched in a single bulk request.
Date boundaries are filtered in Africa/Johannesburg after fetching the UTC
range; v4's `dateTo` is exclusive.

## API-Football history

API-Football [documents season limits on its free plan](https://www.api-football.com/pricing).
This account's observed error specifically permits 2022–2024; that range is
not asserted as a universal permanent entitlement. `API_FOOTBALL_FREE_SEASONS`
defaults to those reported seasons. Unsupported seasons are rejected before a
request; provider season denials are cached separately for 24 hours to avoid
retries. The existing 90-request UTC daily budget and Redis keys are retained.

Archive access is explicit, for example:
`/api/football/fixtures?provider=api-football&competitionId=39&season=2024&from=2024-09-01&to=2024-09-07`.
Dates must be past and the range at most 31 days. Current-date browsing never
falls back to these records. Existing API-Football fixture IDs and saved records
remain intact. football-data.org IDs use a disjoint numeric range above one
billion; routes, callbacks and ticket serialization retain numeric IDs.

TheSportsDB was investigated but is not enabled as a complete fallback.
Its [free v1 schedule endpoints](https://www.thesportsdb.com/docs_api_guide) cap
league-next responses at one record, day responses at three, and season
responses at fifteen; v2 is premium. These do not establish a complete current
fixture list for the requested leagues. No league ID or season is guessed.

## Website, tickets and Telegram

The page has Today, Tomorrow, Weekend and 7 Days buttons; searchable league
checkboxes; select-all-available, clear, supported-only and save actions; and a
team search. Selection starts empty unless choices were explicitly saved in
`mines-lab:football:league-selection:v1`. Saving touches no existing game data.
Unsupported leagues remain disabled with a reason. Technical explanations,
results, timezone controls and forecast evaluation are under Details.

The website and Telegram both call `src/lib/football/service.ts` and consume
the same source-specific normalized records. Existing command/callback names,
webhook authentication, notification preferences and one-time linking remain.
Source labels reflect the actual fixture provider. Current fixtures do not
trigger API-Football predictions, statistics or historical-season retries.

Manual full-time-result choices can be added to tickets without provider
probabilities. They are labelled as manual choices; odds must be supplied by
the user and are validated again on the server. Existing prediction-backed
ticket checks, stake/return calculations, stored ticket formats, Redis keys and
Telegram ticket access remain. No bet is placed.

## Errors and verification

API responses include distinct codes for configuration required, invalid API
key, season restricted, competition unavailable, daily quota exhausted, minute
rate limited, Redis unavailable, and provider unavailable. Failed fixture
requests do not become successful empty lists. Only a successful response may
produce “No upcoming fixtures”. Failures are kept separate from team filtering.

Changed areas: new fixture adapter/service/errors/date/manual-market modules;
provider and storage helpers; existing football API handlers; website component
and scoped CSS; Telegram provider imports/source labels; environment example;
football regression tests and documentation. No casino game, Python module,
credentials, existing stored records or database contents were modified.

`fixture-providers.test.ts` prepares cases for ID separation, account coverage,
missing token, SAST boundaries, caching/quota reuse, error classification,
denial cooldown, archive rejection, and honest missing analysis/statistics. It
is included by `football.test.cjs`. Existing mocks that instrument football
detail delivery must now instrument the shared service when testing website
or Telegram routes.

Approved local checks: all 27 football regression tests pass; TypeScript
checking passes; the mocked Telegram verifier passes 29 cases / 430 assertions
covering all fifteen games and current-source fixture parity. Full and targeted
lint stalled without results and were interrupted. No build or visual browser
check was run for this change. No live account coverage has been verified.
A token is now configured locally. The live provider checks below supersede
the earlier missing-token status. No Git, deployment or package installation was performed. The explicitly
authorized provider-only checks below did not contact Redis or Telegram.
Manual verification should select multiple leagues, search teams, save/reload
choices, clear them, inspect unsupported competitions, create a manual ticket,
read it through Telegram linking, and simulate each error class. Credentialed
provider/Redis/Telegram checks require explicit authorization.

## File inventory

New modules:

- `src/lib/football/football-data.ts`
- `src/lib/football/service.ts`
- `src/lib/football/errors.ts`
- `src/lib/football/dates.ts`
- `src/lib/football/ticket-markets.ts`
- `src/lib/football/fixture-providers.test.ts`

Updated source and checks:

- `src/lib/football/provider.ts`, `storage.ts`, `types.ts`, `http.ts`, and `football.test.cjs`
- `src/app/api/football/competitions/route.ts`
- `src/app/api/football/fixtures/route.ts`
- `src/app/api/football/fixtures/[fixtureId]/route.ts`
- `src/app/api/football/fixtures/[fixtureId]/statistics/route.ts`
- `src/app/api/football/tickets/route.ts`
- `src/components/football-workspace.tsx` and `src/app/globals.css`
- `src/lib/telegram/bot.ts` and `scripts/verify-telegram.cjs`
- `.env.example`, `README.md`, `docs/FOOTBALL_SERVICE.md` and this guide

## Configure current-season access

1. Register at https://www.football-data.org/client/register and obtain the free account token.
2. Set `FOOTBALL_DATA_API_TOKEN` in local `.env` and the server hosting environment. Never prefix it with `NEXT_PUBLIC_` or commit the real value.
3. Keep `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` configured; the existing adapter uses Redis caching and request budgets.
4. Restart the local server yourself, or redeploy after updating hosting secrets. No deployment is performed automatically.
5. Open Football, select supported leagues and the desired calendar range. Under Advanced, inspect fixtures/results independently of ticket generation.
6. Current requests omit a fixed season: the returned match season and kickoff determine what is shown. Published 2026–2027 and later schedules require no annual code change; unannounced schedules remain unavailable.
7. `ODDS_API_KEY` is optional and separate: missing bookmaker prices must not be interpreted as missing fixtures. API-Football stays archive-only with `API_FOOTBALL_FREE_SEASONS=2022,2023,2024`.

TheSportsDB remains disabled as a bulk fallback: its documented free limits
(league next/previous: 1; day: 3; season: 15) cannot establish complete multi-league
calendar coverage. A partial response is never substituted for a complete primary
response or used to hide an upstream error. No TheSportsDB secret is required.

## Live provider verification — 9 November 2026, 18:01 SAST

Four authorized authenticated read-only requests returned HTTP 200. No credentials
were logged. These check the upstream service, not the deployed application or Redis.

- `/competitions`: all 12 configured competitions returned `TIER_ONE`. Nine European club competitions returned 2026–2027 current-season dates; Brazil returned 2026. World Cup returned 2026, European Championship 2024 (catalogue access does not mean upcoming matches).
- `/matches?dateFrom=2026-11-09&dateTo=2026-11-18`: 2 upcoming Brazilian Série A records, both 14 November UTC: Mirassol FC–CA Mineiro at 21:30 UTC and Chapecoense AF–CR Vasco da Gama at 23:30 UTC. The latter is 15 November 01:30 SAST.
- `/matches?dateFrom=2026-11-01&dateTo=2026-11-09&status=FINISHED`: 148 completed matches across Eredivisie (13), Serie A Italy (17), La Liga (15), Ligue 1 (14), Bundesliga (11), Primeira Liga (14), Premier League (12), Brazil Série A (10), Champions League (18), Championship (24).
- `/matches?competitions=2001,2002,2003,2013,2014,2015,2016,2017,2019,2021&dateFrom=2026-11-19&dateTo=2026-11-28`: 125 upcoming records, confirming the adapter’s bulk multi-league parameter. Counts: Brazil 18, Bundesliga 10, Ligue 1 10, La Liga 11, Championship 25, Premier League 11, Serie A Italy 11, Eredivisie 10, Champions League 18, Primeira Liga 1.

Examples returned: Bayern–Köln (20 November 19:30 UTC), Manchester City–Fulham
(21 November 12:30 UTC), Lazio–Lecce (21 November 14:00 UTC). These are real
provider responses, not seeded fixture data. Dates above describe UTC API windows;
the application additionally applies exact inclusive SAST calendar boundaries.

Not verified/available: South African Premiership free coverage, upcoming World
Cup/European Championship fixtures, unpublished later seasons, odds/predictions,
application Redis connectivity, deployed UI and real Telegram delivery. No tests
or builds were run in this follow-up. The existing primary-provider integration
needed no runtime changes; only this guide and `.env.example` were updated.
