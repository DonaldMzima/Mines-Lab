# Native analysis migration

## Dependency map and preserved behavior

The website, `/api/analysis`, and Telegram already use `src/lib/analysis/index.ts`
and the same fifteen TypeScript engines. Their existing input/output contracts,
rules confirmation, limitations, and game registry remain canonical.

- Mines: combinatorial survival and uniform-placement assumptions; legacy round
  processing and storage remain in their existing modules.
- Penalty: supplied scoring probabilities, cumulative products, multipliers and
  diagnostic returns; no unsupported direction is introduced.
- Blackjack and Hilo: existing restricted strategy, remaining-card counts,
  action permissions and tie rules.
- Dice, Coinflip, Plinko, Keno and Towers: existing strict threshold counts,
  side-specific payouts, binomial/hypergeometric distributions, independent-row
  survival and conditional expected returns.
- Poker: existing five-card ranking, kickers, and exact zero-to-two-card draws.
- Lucky Jet, Rocket Queen, Rocket X, Aviator and Speed & Cash: separate profiles
  using the existing shared descriptive history implementation. No new forecast.

The duplicated reference engines were not application subprocess dependencies.
The actual runtime dependency was the optional football HTTP client, called by
the provider, history route, and Telegram history command. Those callers now
use `src/lib/football/analysis.ts` directly. It preserves supported-market
validation, priority selection, chronology, multiclass Brier score, uniform and
bookmaker baselines, calibration bins, and recorded-odds one-unit scenarios.
Existing JSON fields and the evaluation model version are retained. The
provider keeps its existing two-percentage-point rounding tolerance and tie
behavior; historical evaluation keeps the former service's 1.5-point rule.

`src/lib/analysis/evaluation.ts` preserves the reference-only prospective pairing,
provenance matching, duplicate/mixed-group rejection, baseline summaries and
Wilson intervals. Timezone-aware timestamp ordering retains microseconds.
No new package, backend, or external model service is needed.

## Offline CLI and fixtures

The native CLI is `node scripts/analyze.cjs [--list]`. Without `--list`, supply
one JSON object on stdin: `{"gameId":"mines","input":{"mines":3,"picks":3}}`.
It retains the one-MiB byte limit, `{engineVersion,signal}` envelope, JSON errors,
and exit status 2 for invalid input. It calls the same canonical game engine.

Independent expected values for all fifteen games are preserved under
`src/lib/analysis/fixtures/analysis-cases.json`. `scripts/verify-analysis.cjs`
checks these values and contracts without a second runtime. The release and
game test suites use the relocated fixtures.

## Compatibility and deployment

Redis keys, record serialization, Lua scripts, tickets, account links, quotas,
cache durations, localStorage, Telegram credentials, webhook authentication,
notifications, application routes, UI, and Chrome extension are unchanged by
this migration. No database or browser data is rewritten. The pre-existing
fixture parser was corrected to read `fixture.status`, matching API-Football
and the existing fixture tests.

`vercel.json` keeps `"framework": "nextjs"`. In Vercel, select repository root
(`./`), Next.js, `yarn install --frozen-lockfile`, and `yarn build`; leave Output
Directory at the framework default. No Python installation/start command or
model-service URL/token is used by application callers. Keep existing API,
Telegram and Upstash variables. No deployment is authorized or performed.

## Verification gate

The runtime migration has passed 62 Node regression tests, 15 game fixtures /
21 expected metrics, and the mocked Telegram verifier (28 cases / 421
assertions, including football website/bot parity). TypeScript checking passed.
Lint stalled and was interrupted. Production build verification is blocked:
Turbopack could not bind its CSS worker port even on an approved outside-sandbox
retry; the Webpack alternative could not resolve Google Fonts, and its
network-enabled retry was declined. No Git operations, package installations,
live API-Football/Redis/Telegram requests, or deployments were performed.
The original `python/`, unreferenced `python-client.ts`, and old parity script
are retained until the replacement checks pass. Remove those retired sources
and obsolete local model-service variables only after that gate; do not delete
the relocated mathematical fixtures. This is the remaining cleanup blocker.

Request permission before executing the prepared checks:

```sh
yarn lint
node --test src/lib/analysis/analysis.test.cjs src/lib/analysis-records.test.cjs src/lib/telegram/validation.test.cjs src/lib/football/football.test.cjs
node scripts/verify-analysis.cjs
node scripts/verify-telegram.cjs
node node_modules/typescript/bin/tsc --noEmit
yarn build
```

The football suite includes native distribution/evaluation cases, mocked
provider/cache/quota handling, preserved forecast records, and the history API.
The offline Telegram verifier compares prediction and history output with the
website routes using shared native logic. Mocks do not prove live provider,
Redis, or Telegram availability. The existing loopback release verifier can
be run against an approved local production server after a successful build.
