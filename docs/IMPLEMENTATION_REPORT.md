# Mines Lab V4 implementation report

Date: 8 November 2026. This report describes source changes in the existing repository, not a production release.

## Verification boundary

The user approved local tests, builds and loopback/browser checks. `yarn lint` passed with seven warnings; the Node suite passed 41 tests; Python passed 43 tests; TypeScript type-check and production build passed. Cross-language parity passed 28 scenarios/42 metrics, the release verifier passed 34 checks, and the offline Telegram verifier passed 27 cases/412 assertions. A production-build browser smoke clicked all fifteen **Get Signal** buttons, checked persistence, exercised confirmed Blackjack/Hilo actions, and started/completed the labeled Mines demo.

These are local/offline results only. The Next.js API and UI use TypeScript; the Node parity verifier calls the Python CLI separately. Direct Next.js-to-Python runtime communication is not implemented or verified. No live provider feed, real Telegram request, production Redis, production deployment, or future-outcome accuracy was verified.

## All 15 games

UI entries describe the implemented paths; all fifteen Get Signal buttons were smoke-tested locally. Telegram entries were verified by the offline mocked integration suite, not against Telegram's live service. Python is an offline reference engine. Real data means the supported manual/demo input path, not independently authenticated provider access. No game has validated future-outcome accuracy.

| Game | Python engine | UI path | Telegram path | Real data | Signal method | Validated accuracy |
|---|---|---|---|---|---|---|
| Mines | Implemented | Existing board + Get Signal; local smoke passed | Existing board/commands; offline integration passed | Existing local/demo/import maps; no feed | Experimental uniform random tiles; combinatorial baseline | Not established |
| Penalty | Implemented | Modes/step/Get Signal/manual results; local smoke passed | Modes/step/probabilities/history; offline integration passed | Supplied rules + manual scored/saved records; no feed | Rounded-rule scoring/cumulative probabilities; direction unavailable | Not established |
| Blackjack | Implemented | Known cards + supported rules/actions; local smoke passed | Per-user config and actions; offline integration passed | User-entered actual cards/results; no feed | Restricted S17/DAS basic strategy | Not an evaluated win predictor |
| Hilo | Implemented | Current rank/distribution/ties; local smoke passed | Configured direction and probabilities; offline integration passed | User-entered ranks/distribution; no feed | Maximum configured win probability; rules confirmation required | Not established |
| Dice | Implemented | Threshold/range/payout controls; local smoke passed | Config/probability/records; offline integration passed | User-entered integer outcomes; no feed | Exact strict threshold counts and payout EV | Not established |
| Plinko | Implemented | Rows/bias/payout distribution; local smoke passed | Config/distribution/history; offline integration passed | User-entered bucket records; no feed | Conditional binomial distribution and payout EV | No next-bucket forecast |
| Keno | Implemented | Pool/draw/selections/paytable; local smoke passed | Config/distribution/records; offline integration passed | User-entered completed draws; no feed | Hypergeometric hit probabilities | Not established |
| Towers | Implemented | Friendly row controls/survival; local smoke passed | Layout/survival/records; offline integration passed | User-entered step/survival; no feed | Independent configured row products | No hazard-position forecast |
| Coinflip | Implemented | Probability/side-payout EV; local smoke passed | Probability/side-payout EV/history; offline integration passed | User-entered sides; no feed | Configured probabilities; no chosen winning side | No next-side forecast |
| Poker | Implemented | Five-card ranks/exact replacement analysis; local smoke passed | Five-card config/rank/history; offline integration passed | User-entered actual cards; no feed | Full high-hand ranking and exact 0–2-card draw distributions | No opponent/action forecast |
| Lucky Jet | Implemented | Imported history/threshold statistics; local smoke passed | Imported history/statistics; offline integration passed | User-provided completed multipliers; no feed | Descriptive sample risk and historical payout scenarios | No next-crash forecast |
| Rocket Queen | Implemented | Imported history/threshold statistics; local smoke passed | Imported history/statistics; offline integration passed | User-provided completed multipliers; no feed | Separate profile; descriptive history | No next-crash forecast |
| Rocket X | Implemented | Imported history/threshold statistics; local smoke passed | Imported history/statistics; offline integration passed | User-provided completed multipliers; no feed | Separate profile; descriptive history | No next-crash forecast |
| Aviator | Implemented | Imported history/threshold statistics; local smoke passed | Imported history/statistics; offline integration passed | User-provided completed multipliers; no feed | SPRIBE profile; descriptive history; no RTP-derived law | No next-crash forecast |
| Speed & Cash | Implemented | Completed-race history/statistics; local smoke passed | Separate race history/statistics; offline integration passed | One consistent race/market's manual multipliers; no feed | Descriptive race-multiplier statistics | No winning-car/crash forecast |

## Root causes addressed

1. Thirteen catalog entries were marked planned and had no calculation workspace. They now have bounded game-specific mathematical engines and real input validation.
2. Penalty exposed a long probability explanation without a primary Get Signal action. Modes and step controls now lead to a concise signal status and scoring chance. A probability is never promoted to a goalkeeper direction.
3. Mines signal generation was hidden in Advanced. It is now directly accessible while preserving the original board, demo, completed-map and evaluation systems.
4. The bot was primarily Mines/Penalty, with no uniform per-game state/history contract. It now selects all fifteen and preserves settings/results/history per private user and per game.
5. Server-side Telegram state and deduplication were process-local. An optional documented Redis REST store adds shared state, atomic update claims and per-user leases; the fallback explicitly remains non-durable.
6. Documentation contradicted the code (Penalty planned versus implemented). The current evidence/status documents are aligned.
7. Static review found restored-state coercion, impossible-date acceptance, duplicate links, display-before-save and retrying notification toggles. These source paths were hardened. No runtime correctness is inferred from the fixes.

## Game-specific calculations

[The evidence register](GAME_RULES_V4.md) gives every rule profile and blocker; [the Python guide](../python/README.md) gives independent formulas. Core calculations are Mines combinations, Penalty conditional products, ace-aware restricted Blackjack strategy, remaining-rank Hilo, inclusive integer Dice counting, side-specific Coinflip EV, Plinko binomial buckets, Keno hypergeometric hits, Towers independent survival and five-card Poker ranking/kickers/exact replacement enumeration. Each crash/race game has a distinct profile with a shared legitimate statistical implementation: counts, mean/median/range, strict-above versus at-or-above threshold rates, uncertainty and explicitly conditional historical payout scenarios. No trained model or fabricated future-outcome generator was added.

Initial configurable models are labeled examples. A validated label means mathematics conditional on a user-confirmed configuration, with providerVerified:false. It does not mean independently verified rules or predictive accuracy.

## Website changes

Branding and game navigation remain. The primary game card prioritizes selected game, Not connected status, relevant configuration, Get Signal, short output and latest completed result. Details contains mathematics, provenance, canonical manual imports, saved analysis/result history and exports. Every game has separate browser-local V4 storage; the existing Mines storage keys are untouched. Corrupt storage is preserved and saving disabled rather than silently reset; cross-tab writes are checked for conflicts. Storage is bounded to 200 analyses and 200 completed records per game.

Blackjack/Hilo do not invent missing cards. Dice/Keno/Plinko/Towers settings are configurable models, not claims about undocumented 1win variants. Penalty retains the complete supplied Series table under a collapsible section. A goal/keeper grid is withheld because its actual mapping remains unknown. Main navigation retains Settings and adds direct History, Signals and Telegram access.

## Telegram changes

The existing bot identity, webhook route, setup route and secret-header checks remain. Compact main/crash/more menus cover all fifteen. Each game exposes Get Signal, Settings, Latest Result, History, Status and Details. Existing Mines controls and commands remain. Config/record JSON is validated; independent private-user state avoids leaking group settings. Notification opt-in remains explicit; Enable/Disable operations are retry-idempotent.

Update claims use a short processing lease and completed-update retention. Shared storage uses optional Redis command-array REST requests and token-owned lock release; configured storage failures are reported rather than silently falling back and losing state. A Telegram send and a database write cannot be committed atomically: an ambiguous send failure can still cause a repeated message on retry. No exactly-once delivery claim is made. Process-local mode does not provide multi-instance guarantees. See [Telegram setup](TELEGRAM_BOT.md).

## Python integration choice

Python is an offline reference and evaluation engine, compatible with the actual existing Next.js deployment rather than dependent on a nonexistent FastAPI service. Every game has a real implementation behind a strict frozen dataclass signal contract, registry and bounded JSON stdin/stdout CLI. Standard library only; no dependency installation. Fifteen shared mathematical fixtures are consumed independently by Python and TypeScript test sources. Optional game-specific detail field names can differ while the signal contract and independently checked quantities agree by design; parity has not yet been executed.

## Backend, result records and evaluation

POST /api/analysis validates JSON content, stream size (64 KiB), game ID and bounded game inputs, returns the shared contract with no-store caching, and uses HTTP422 for invalid configurations. It performs no betting, account access, shell execution or Python subprocess call.

Canonical manual completed records require gameId, roundId, completedAt, source:manual and game-specific data. Validated timestamps reject calendar rollover/future dates; conflicts preserve the first record. Opaque provider fields do not create canonical outcomes. Manual data never becomes provider-authenticated data.

Signals store their original inputs and timestamps before display/delivery. New all-game comparisons require exact game/round linkage and outcome chronology. Supported probability events are Penalty scored, Hilo selected win direction, strict Dice threshold, Keno all-selected-hit and Towers row survival. Saved baseline values are recomputed from validated input before evaluation. The browser groups identical configurations and reports samples, successes, failures, baseline, Brier score and Wilson95 intervals with their independence assumptions. Blackjack strategy, Poker current ranks and crash descriptive history are not mis-scored as future predictions. Existing Mines comparison/provenance behavior is preserved. Manual uploads and browser clocks cannot establish independent authenticity, unbiased sampling or prospective accuracy.

## Available connections and missing access

No live provider/result connection is established for any game. The existing optional Chrome companion remains presence-only. The new manual adapters accept genuine user-provided records but do not authenticate their origin. No endpoints, session replay, passwords, cookies or unauthorized data sources were invented.

Every real adapter still needs the provider identity/version, stable game/mode IDs, official complete rules, a permitted read-only feed/export, documented authentication, authentic sanitized fixtures, state/round/completion semantics, rate/replay ordering and retention/relay permission. [Exact per-game gaps](GAME_RULES_V4.md) include Penalty grid/payout/terminal meanings and Speed & Cash car/market settlement grouping. No extra account access is needed to use the configured analysis already implemented.

## Tests written versus executed

Passed locally:

~~~sh
yarn lint
node --test src/lib/analysis/analysis.test.cjs src/lib/analysis-records.test.cjs src/lib/telegram/validation.test.cjs
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -m unittest discover -s python/tests
node scripts/verify-python-parity.cjs
node scripts/verify-telegram.cjs
node node_modules/typescript/bin/tsc --noEmit
yarn build
~~~

The loopback release check was `node scripts/verify-release.cjs http://127.0.0.1:3100` against a local `yarn start --port 3100`. It passed 34/34 checks. Lint reports seven warnings and no errors. No dependencies were installed.

## Required environment and deployment steps

Existing server-only settings: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_BASE_URL (public HTTPS). Optional production shared storage: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN together; TELEGRAM_STORE_NAMESPACE can isolate deployments. No Python service URL is required. No credentials or environment files were modified. Existing credential-like values were observed in .env.example and require operator review/rotation; they are deliberately not repeated here.

No production deployment was performed or approved. Before production, resolve the explicit Next.js-to-Python runtime integration requirement (or confirm that the offline-reference architecture is acceptable), configure/verify authorized provider data if required, and test protected setup, live webhook health, and shared Redis persistence/retry across instances. No credentials were changed.

## Additional release checks not performed

Live provider round imports, all Penalty steps and advanced game edge cases in the browser, corrupt/cross-tab browser storage, real Telegram delivery, Redis outages/leases across instances, and mobile/responsive accessibility remain untested. The offline Telegram suite covers the bot commands, menus, result recording, per-user state, retry behavior, and webhook validation only under mocked network/storage conditions.

## Files created

- src/app/api/analysis/route.ts
- src/components/game-workspace.tsx
- src/lib/analysis/analysis.test.cjs
- src/lib/analysis/aviator.ts
- src/lib/analysis/blackjack.ts
- src/lib/analysis/coinflip.ts
- src/lib/analysis/core.ts
- src/lib/analysis/crash.ts
- src/lib/analysis/dice.ts
- src/lib/analysis/hilo.ts
- src/lib/analysis/index.ts
- src/lib/analysis/keno.ts
- src/lib/analysis/lucky-jet.ts
- src/lib/analysis/mines.ts
- src/lib/analysis/penalty.ts
- src/lib/analysis/plinko.ts
- src/lib/analysis/poker.ts
- src/lib/analysis/rocket-queen.ts
- src/lib/analysis/rocket-x.ts
- src/lib/analysis/speed-cash.ts
- src/lib/analysis/towers.ts
- src/lib/analysis/types.ts
- src/lib/analysis-client-storage.ts
- src/lib/analysis-records.test.cjs
- src/lib/analysis-records.ts
- src/lib/game-data-sources.ts
- src/lib/mines-game-signal.ts
- src/lib/telegram/validation.test.cjs
- src/lib/telegram/validation.test.ts
- src/lib/telegram/validation.ts
- python/fixtures/analysis-cases.json
- python/mines_lab_analysis/__main__.py
- python/mines_lab_analysis/aviator.py
- python/mines_lab_analysis/blackjack.py
- python/mines_lab_analysis/coinflip.py
- python/mines_lab_analysis/crash.py
- python/mines_lab_analysis/dice.py
- python/mines_lab_analysis/hilo.py
- python/mines_lab_analysis/keno.py
- python/mines_lab_analysis/lucky_jet.py
- python/mines_lab_analysis/plinko.py
- python/mines_lab_analysis/poker.py
- python/mines_lab_analysis/registry.py
- python/mines_lab_analysis/rocket_queen.py
- python/mines_lab_analysis/rocket_x.py
- python/mines_lab_analysis/signals.py
- python/mines_lab_analysis/speed_cash.py
- python/mines_lab_analysis/towers.py
- python/mines_lab_analysis/validation.py
- python/tests/test_cli.py
- python/tests/test_engines.py
- python/tests/test_evaluation.py
- python/tests/test_parity_fixtures.py
- docs/GAME_RULES_V4.md

## Existing files modified

- README.md
- docs/IMPLEMENTATION_REPORT.md
- docs/PENALTY_INTEGRATION_BLOCKERS.md
- docs/REAL_DATA_INVESTIGATION.md
- docs/TELEGRAM_BOT.md
- src/app/page.tsx
- src/app/globals.css
- src/app/history/page.tsx
- src/app/signals/page.tsx
- src/app/api/telegram/webhook/route.ts
- src/components/app-shell.tsx
- src/components/inline-signals.tsx
- src/components/penalty-workspace.tsx
- src/lib/game-registry.ts
- src/lib/telegram/api.ts
- src/lib/telegram/bot.ts
- src/lib/telegram/store.ts
- src/lib/telegram/types.ts
- python/README.md
- python/mines_lab_analysis/__init__.py
- python/mines_lab_analysis/contracts.py
- python/mines_lab_analysis/evaluation.py
- python/mines_lab_analysis/mines.py
- python/mines_lab_analysis/penalty.py
