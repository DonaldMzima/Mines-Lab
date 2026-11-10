> Retired reference sources: the application now uses native TypeScript analysis.
> These files remain temporarily because production-build verification is blocked.
> The historical service setup below is not used by current application callers.
> See [migration status](../docs/NATIVE_ANALYSIS.md).

# The Winning Edge Python analysis

Python 3.10+. The fifteen game engines form an offline reference/evaluation CLI.
Football optionally provides an authenticated FastAPI service for additional
validation of API-Football prediction percentages and retrospective evaluation.
It is a separate deployable service, not a local subprocess. API-Football
predictions remain available from the provider when this optional service is
not configured; retrospective evaluation is then explicitly unavailable.

The offline game calculations use the standard library. The hosted football API
requires the packages listed in `requirements.txt`.

## Contract and provenance

`registry.analyze_game(gameId, input)` returns a frozen `GameSignal` dataclass;
`.to_dict()` emits camelCase JSON compatible with the web signal contract:
`gameId`, `action`, `status`, `source`, `generatedAt`, `summary`, `explanation`,
`details`, optional `gameMode` and `roundId`.

`validated` means deterministic mathematics for a **user-confirmed configuration**;
it does not establish 1win rules, observable live state, independent accuracy, or
provider authenticity. Example configurations remain `experimental` and cannot
produce directional actions. Missing inputs, invalid records and unavailable
future signals return explicit `unavailable` results. There are no live connectors.

`default_input()` deep-copies examples. Actual Blackjack/Poker cards and Hilo's
current rank are deliberately absent. Defaults for dice ranges, Plinko payouts,
Keno layouts and Towers rows are editable examples, **not verified 1win rules**.
Gross payout always includes the returned stake. EV assumes zero payout on loss.

## Calculations implemented

- **Mines:** exact `C(25-k,m)/C(25,m)` survival, starting-tile probability; no
  preferred tile. Legacy primitives retain their supported 2/3/5/7 mine settings;
  the configurable registry model supports 1–24 mines.
- **Penalty:** supplied Turbo 53.33% and five Series conditional probabilities;
  exact `Fraction` products, cumulative reach chances, displayed multipliers and
  diagnostic products. The directional signal remains unavailable. Unknown goal
  coordinates, `outcome.catches`, terminal codes and full settlement are not guessed.
- **Blackjack:** soft/hard hand totals, ace adjustment, total-dependent basic
  strategy for 4–8 decks, S17, DAS, dealer peek, no surrender, double any initial
  two, one extra card for split aces. Explicit legal-action flags control doubles
  and splits. Unsupported table profiles are rejected.
- **Hilo:** strict higher/lower/equal probabilities from thirteen **remaining**
  rank counts, Ace low; explicit tie lose/push/win. Direction compares win chance,
  not expected payout. Exclude observed cards when using a finite deck.
- **Dice:** exact strict under/over counts for a uniform inclusive integer range,
  gross and net unit-stake expectation; decimal/nonuniform provider dice excluded.
- **Coinflip:** configured heads/tails probabilities and separate side-payout EV (optional headsGrossPayout/tailsGrossPayout override the common grossPayout fallback), no
  guessed side on an independent flip.
- **Plinko:** full binomial bucket distribution and payout expectation under
  independent constant-bias rows. No landing forecast or inferred board physics.
- **Keno:** hypergeometric hit distribution, expected hits, and EV only with a
  complete explicit paytable including zero payouts.
- **Towers:** survival products for independent uniformly located per-row hazards,
  optional gross-payout expectation; no hidden hazard coordinates.
- **Poker:** full standard five-card high rankings, kickers and Ace-low wheel;
  exact category distribution after explicitly discarding zero, one or two cards,
  enumerating `C(47,k)` replacement sets from one 52-card deck. No unsupported
  Hold'em/video-poker variant or opponent/bet/fold recommendation.
- **Lucky Jet, Rocket Queen, Rocket X, Aviator:** separate game profiles with
  strict imported completed-multiplier history validation; sample counts, mean,
  median, range, target exceedance/at-or-above rates, Wilson interval and historical
  unit-stake payout scenarios. No theoretical crash distribution is inferred from
  RTP, and no next multiplier or cashout time is predicted.
- **Speed & Cash:** separate race-game profile using one consistent race/market's
  completed multiplier history. The two-car settlement schema and grouping remain
  unverified; no car state, winning car or next result is invented.

Crash records have `{roundId, completedAt, multiplier, source:"manual"|"import"}`.
IDs must be unique and timezone-aware timestamps must be completed, not future.
At most 5,000 records are accepted. Import is structurally validated, never treated
as provider-authenticated. Equality settlement is unknown: strict-above and
at-or-above rates are separate. Historical scenarios assume gross target payouts,
zero loss payout and no fees; they are not validated expected returns for 1win.
Wilson intervals assume independent representative samples, which imports cannot
establish. Missing history returns unavailable rather than synthetic data.

## Offline JSON CLI

Run only after obtaining the operator's permission for commands:

```sh
PYTHONPATH=python python3 -m mines_lab_analysis --list
```

The default CLI reads one JSON object from standard input, bounded to 1 MiB:

```json
{"gameId":"hilo","input":{"currentRank":8,"rankCounts":[4,4,4,4,4,4,4,4,4,4,4,4,4],"ties":"lose","rulesConfirmed":true}}
```

For an authorized execution, pass that object on stdin to
`PYTHONPATH=python python3 -m mines_lab_analysis`. It emits
`{engineVersion,signal}`. Bad transport/game/input returns a JSON error or explicit
unavailable signal with exit status 2. CLI JSON rejects NaN and Infinity.

## Independent prospective evaluation

`evaluation.pair_prediction()` requires exact game/round IDs, matching provenance
class, timezone-aware timestamps and a completed outcome strictly after the saved
prediction. `performance()` rejects duplicate rounds, mixed games/model versions/
sources and corrupted success flags. Reports include successes, failures, sample
rate, Wilson 95% interval and expected baseline rate. `validatedAccuracy` remains
null: local/imported matches do not independently establish data provenance or a
predictive advantage. The caller must retain records **before** outcomes in a
durable append-only store; this offline package does not authenticate timestamps.

## Tests and verification status

Tests cover all fifteen contracts, independent mathematical fixtures, Blackjack
chart decisions and fallbacks, Hilo ties, strict dice thresholds, Keno combinations,
Plinko bucket normalization, Towers products, Poker wheels/kickers/draw counts,
history provenance/future/duplicate rejection and prospective evaluation.

```sh
PYTHONPATH=python python3 -m unittest discover -s python/tests
```

The fifteen-game Python suite and football tests are automated, but the current
football integration changes have not yet been tested. Earlier Python test
results predate the football API changes and do not verify its deployment or
runtime behavior. Obtain explicit approval before running the suite.

## Deployment boundaries

The main website is the Next.js application at the repository root. Its root
`vercel.json` explicitly selects `"framework": "nextjs"`. In the main Vercel
project, use the repository root (`./`) as **Root Directory**, **Next.js** as
**Framework Preset**, `yarn install --frozen-lockfile` as **Install Command**, and
`yarn build` as **Build Command**. Leave **Output Directory** at the Next.js
default; remove any Python install/start command overrides. Keep the existing
Telegram, API-Football, Redis, and other server environment variables.

After these files have been committed and pushed by the operator, deploy that
new revision in Vercel. Do not redeploy the older failed revision: it does not
contain the framework fix. For a clean retry, leave **Use existing Build Cache**
unselected if Vercel offers that option. Confirm the logs select Next.js and
run the Yarn build rather than searching for a Python entrypoint.

No Python entrypoint is needed by the main Vercel project. The optional service
has the real ASGI entrypoint `football_service.main:app`, defined in
`python/football_service/main.py`. Deploy it independently on a Python 3.10+
ASGI host with working directory `python/`, install `requirements.txt`, and
start `uvicorn football_service.main:app --host 0.0.0.0 --port <host-port>`.
Use the port assigned by the host and expose an HTTPS origin. Keep both
`football_service/` and its sibling `mines_lab_analysis/` in that deployment.
The repository-root equivalent command is shown under **Hosted football API**.
Configure the shared token and Next.js service URL as described there; verify
`GET /health` before enabling the integration. The offline analysis CLI is
`mines_lab_analysis.__main__`, not a web server.

## Hosted football API

To enable optional hosted validation and evaluation, set
`FOOTBALL_MODEL_API_TOKEN` on the Python host to a secret of at least 32
characters and set the same value as a server-only variable in Next.js. The
Next.js variable `FOOTBALL_MODEL_API_URL` must be the HTTPS origin of this
service. When both values are unset, provider prediction display still works;
evaluation remains unavailable. Do not configure a plain-HTTP URL or place
secrets in client code.

Install dependencies and run behind an HTTPS-terminating hosting proxy:

```sh
python3 -m pip install -r python/requirements.txt
PYTHONPATH=python uvicorn football_service.main:app --host 0.0.0.0 --port 8000
```

`GET /health` is the liveness endpoint. Authenticated JSON endpoints are
`POST /v1/validate-predictions` and `POST /v1/evaluate`; requests are limited to
one MiB. A successful response means a provider probability payload passed the
documented distribution checks, not that it predicts an outcome accurately.
See [the service/release guide](../docs/FOOTBALL_SERVICE.md) for all settings,
web/Telegram flow, exact checks, and approval requirements.

## Evidence boundaries

- [Blackjack Apprenticeship's S17 chart](https://www.blackjackapprenticeship.com/wp-content/uploads/2024/09/S17-Basic-Strategy.pdf)
  is the author's primary strategy reference. It does not verify the 1win table.
- [1win public game descriptions](https://1win.com/) describe Lucky Jet and
  Rocket Queen as multiplier crash games and Speed & Cash as a two-car race.
  They do not document an authorized result API or full multiplier law. The [operator casino description](https://1win.com/casino?provider=Pragmatic+Play) also describes Rocket X as an in-house crash game and Coinflip as two outcomes with side-dependent multipliers.
- [SPRIBE Aviator](https://www.spribe.co/games/aviator) establishes the crash
  mechanic. A published RTP is insufficient to derive target survival probabilities.
- Penalty probabilities and multipliers come from the supplied in-game observations.
  They are rounded published values; no more precise hidden probabilities are assumed.
- Standard card/combinatorial models above are conditional mathematics. Exact
  provider identities, rule versions, authorized feeds, schemas, authentication,
  rate/retention permissions and independently evaluated results remain required
  before any live provider integration or accuracy claim.
