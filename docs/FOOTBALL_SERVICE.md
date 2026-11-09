# Football integration: API-Football by API-Sports

The adapter calls the documented API-Football v3 REST API:
[API-Football documentation](https://www.api-football.com/documentation-v3).
It supports current leagues, date-range fixtures and scores, on-demand fixture
statistics, and API-Football's own predictions endpoint when the account plan
provides them.

The provider's prediction percentages are shown as provider data after schema
and sum checks. They are not independent forecasts, verified accuracy, or
profitability claims. If a fixture has no prediction data, the application says
so and presents no pick. No provider bookmaker odds are fetched; saved ticket
odds are manually entered and labeled.

## Configuration

Server-only:

- `API_FOOTBALL_KEY`: API-Sports key. Sent in the `x-apisports-key` header.
- `API_FOOTBALL_BASE_URL`: optional API origin; defaults to
  `https://v3.football.api-sports.io`. Only HTTPS API-Sports hosts are accepted.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: required for the
  shared cache, daily request counter, forecasts, tickets and Telegram links.
- `FOOTBALL_STORAGE_NAMESPACE`: optional Redis key prefix.

Optional:

- `FOOTBALL_MODEL_API_URL` and `FOOTBALL_MODEL_API_TOKEN`: when both are
  configured, the hosted FastAPI service validates provider predictions and
  enables retrospective forecast evaluation. If neither is configured,
  validated API-Football percentages can still be displayed and evaluation is
  explicitly unavailable. If only one value is configured or a configured
  service fails, that forecast is shown as unavailable rather than bypassing
  the configured validation.

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_BASE_URL`, and
`TELEGRAM_STORE_NAMESPACE` remain the separate existing bot settings. Never
place credentials in browser code or commit them. `.env.example` contains
placeholders only.

## Request budget and cache

The free plan is documented as 100 requests per day. The adapter reserves a
maximum of 90 requests per UTC day in Upstash, across all application instances,
leaving ten calls for other use of the same key. Cache hits do not reserve a
call. Requests that fail after reservation still count conservatively. If the
provider key is shared with another application, that application's usage is
not visible to this counter; API-Sports may therefore reject a request sooner.

Cache durations: current leagues 24 hours, fixtures one hour, fixture details
30 minutes, predictions six hours, and statistics 30 minutes. Statistics are
fetched only when requested. Date-range fixtures load one provider call per page,
up to five pages per selection; the UI indicates when more pages remain.
When the 90-call local limit or provider rate limit is reached, the route returns
an explicit unavailable/rate-limit message; it does not invent cached data when
no cached response exists.

## Provider data behavior

- **Leagues:** `/leagues?current=true&page=N`; only leagues with a current season
  are selectable.
- **Fixtures and results:** `/fixtures?from=...&to=...&league=...&season=...`;
  at most five provider pages are loaded and the UI indicates if more remain.
  Final scores are displayed only for provider statuses recognized as complete.
- **Predictions:** `/predictions?fixture=...`; the adapter accepts a complete
  home/draw/away percentage distribution with bounded values and a total within
  two percentage points of 100. A tie for the highest percentage has no single
  recommended outcome.
- **Statistics:** `/fixtures/statistics?fixture=...` on explicit request. Empty
  or plan-restricted data is reported as unavailable. API-Sports coverage and
  endpoint entitlements vary by league and subscription.
- **Tickets:** only outcomes in the current API-Football prediction markets may
  be ticketed; odds and bookmaker are user-entered manual values. A ticket is a
  stored estimate, not a placed bet.
- **Website and Telegram:** both call the same server-side fixture/detail
  functions. The Telegram bot can request statistics and reads saved website
  tickets using the existing one-time private-chat link.

Saved football forecasts use a new API-Football-specific Redis key prefix, so
they do not mix with records created by the former provider adapter. Existing
tickets and account links remain in their current shared storage; legacy
provider-odds tickets are retained for reading but cannot be created through the
new ticket API.

## Verification commands (not yet run)

The user must approve command execution before any of these are run. These
checks do not deploy the site:

```sh
yarn lint
node --test src/lib/analysis/analysis.test.cjs src/lib/analysis-records.test.cjs src/lib/telegram/validation.test.cjs src/lib/football/football.test.cjs
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -m unittest discover -s python/tests
node scripts/verify-python-parity.cjs
node scripts/verify-telegram.cjs
node node_modules/typescript/bin/tsc --noEmit
yarn build
```

The current release verifier covers the fifteen existing casino-game page/API
flows, not API-Football or live Telegram. Further approved staging checks must
exercise API-Football response variants, empty/free-tier predictions and
statistics, the shared daily counter across instances, quota exhaustion,
forecast-result pairing, website/Telegram fixture parity, ticket linking, and
manual-odds labeling. No live provider call, build, test, or deployment has been
performed for this adapter change. Production deployment requires separate
explicit approval.

## Remaining blockers

- The API-Sports key, active subscription, actual daily quota and league/season
  coverage have not been verified.
- The provider docs were not reachable from the documentation fetcher during
  implementation; parser assumptions are covered by source-level tests but
  must be checked against authorized account responses after approval.
- Upstash persistence and the 90-call cap have not been exercised against a
  live Redis endpoint.
- Hosted Python remains optional for prediction display. No Python endpoint,
  authentication, or retrospective evaluation has been verified.
- Telegram calls and web/bot result parity have not been verified live.
- No accuracy or profitability claim is supported by this integration.
