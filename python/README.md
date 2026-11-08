# Mines Lab offline Python analysis

Python 3.10+; standard library only. All fifteen games have registry entries and
game-specific modules. This is an independent reference/evaluation engine, not a
deployed service. Next.js and Telegram use the matching TypeScript calculations;
they never spawn Python or depend on an absent production FastAPI endpoint.

No dependency installation is required. `requirements.txt` is intentionally empty
apart from its explanatory comment. No NumPy, SciPy, pandas, machine learning, or
web framework is needed for these bounded calculations.

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

These tests are **written, not executed**. The user permitted read-only inspection
commands only; no Python interpreter, test suite, build or compilation was run.
There is no production runtime verification. Execute the suite after permission,
then compare the independent formulas with TypeScript fixtures before deployment.

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
