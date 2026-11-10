# The Winning Edge Telegram bot

The existing @MinesLabSignalsBot webhook remains the single bot. All 15 games are selectable. This implementation has **not** been runtime verified; no test messages, webhook registration, Redis writes, or deployment were performed during development.

## User flow

/start or /games opens the compact menu. Mines, Penalty, Blackjack, and Dice are on the first menu; Crash and More Games expose the other 11 games. Each game has Get Signal, Game Settings, Latest Result, History, Connection Status, and Details. Settings and histories are independent per game and private user. Group chats direct users to the bot privately so one user's settings cannot affect another's.

- /signal analyzes the selected game through the shared TypeScript contract. Mines retains experimental random suggestions and the local markable board. Penalty returns scoring probabilities and an unavailable direction signal. Other models use actual entered state and user-confirmed configurations; confirmation does not verify a 1win variant or establish predictive accuracy.
- /settings shows supported configuration. /config {JSON} updates supported fields; unknown keys and invalid values are rejected. Defaults are examples. Penalty mode and Mines mine/suggestion counts also have buttons.
- /details shows calculations and limitations outside the main action message.
- /result and /round show the latest completed result. /history separates completed outcomes from recorded signals.
- /record {JSON} imports a canonical manual completed result through the shared game-specific validator. Provider payloads, cookies, credentials, and undocumented state codes are not accepted as verified data sources.
- /status shows Not connected, storage mode, and notification preference.
- /notifications opens an explicit Enable/Disable menu and defaults to disabled. /notifications on and /notifications off set the desired preference. Legacy notification buttons only open the menu. Replayed updates set the same desired value, so a failed confirmation send cannot toggle opt-in back. Live notifications still require a permitted server adapter. Manual records are private and never broadcast to others.
- /penalty preserves the existing command and selects Penalty.
- Football adds `/football` and `/weekly` period/competition selection; `/search TEAM`; `/prediction ID`; `/footballstats ID`; `/footballhistory`; `/link CODE`; and `/tickets`. Fixture callbacks and `/prediction` read the same API-Football detail and provider percentage data as the website. Provider validation and retrospective history evaluation run in the same native TypeScript module as the website. `/footballstats` and the `Match statistics` callback use the same cached, rate-limited provider adapter. Linking is single-use, expires after ten minutes, and is accepted only in private chats. These paths have not yet been runtime-tested with Telegram, API-Football or shared Redis.

Example advanced setting: /config {"currentRank":8,"rulesConfirmed":true} after entering and checking the actual Hilo rank distribution and tie rule in /settings. Blackjack requires the actual hand, dealer upcard, and supported rule profile. Crash analysis requires genuine completed history; it never recommends the next multiplier. Crash results entered through /record merge into that game's historical analysis input. Conflicting or over-capacity configured histories are preserved, and the result remains saved separately.

A manual completed result uses this envelope:

    {"gameId":"dice","roundId":"actual-round-id","completedAt":"2026-11-07T12:00:00Z","source":"manual","data":{"value":42}}

Data differs by game: Mines minePositions; Penalty mode, step, scored; Blackjack outcome; Hilo rank; Dice value; Coinflip side; Plinko slot; Keno drawnNumbers; Towers steps and survived; Poker cards; all five crash games multiplier. The shared parser is authoritative. Manual records are not independently provider verified.

Signals capture exact input and generation/recording times **before** delivery. Set roundId in /config before generating a signal to associate a later outcome. Evaluation requires matching game, round, configuration, and chronological order. Generation refuses an already-signaled or already-completed linked round. Restored histories reject duplicate record IDs or round links. Multiple signals for one round are excluded from the compact matched-event count. Probability-event comparisons are labeled manual, not independently evaluated accuracy. Historical crash summaries and card-hand classifications are not future predictions.

## Deployment configuration

Existing server-only variables remain unchanged:

- TELEGRAM_BOT_TOKEN: token for the existing bot.
- TELEGRAM_WEBHOOK_SECRET: 1–256 characters from A–Z, a–z, 0–9, underscore, or hyphen.
- APP_BASE_URL: public HTTPS application origin.

Optional durable storage:

- UPSTASH_REDIS_REST_URL: HTTPS origin of a provisioned Redis REST endpoint.
- UPSTASH_REDIS_REST_TOKEN: its server-only write-capable token.
- TELEGRAM_STORE_NAMESPACE: optional deployment-specific prefix, default mines-lab:telegram:v4. Use a separate namespace per bot/environment.

The adapter uses the documented [Upstash Redis REST command-array API](https://upstash.com/docs/redis/features/restapi), including Redis SET NX EX and token-checked Lua release. It adds no dependencies. Provision the database separately and configure secrets using the hosting secret manager. No account/database is created by this code. Incomplete Redis configuration fails closed instead of silently discarding state.

With Redis configured, preferences, per-game signals/results, notification opt-in, update claims, user locks, and action rate limits are shared across instances. Without it, /status explicitly reports process-local (not durable); restarts lose bot state and multiple instances do not share deduplication or history. Browser localStorage is always separate.

Retention is the latest 20 signals and 20 manual completed results per game plus 20 server-known Mines rounds. Per-game configuration is limited to 16 KB and complete user state to 500 KB; capacity errors preserve saved records. Process-local operation is capped at 10,000 users and 10,000 retained update claims. This fallback is unsuitable for multi-instance production.

## Webhook and retry behavior

The /api/telegram/webhook path and constant-time secret comparison are preserved. The handler validates nested message/chat/sender/callback shapes and enforces a 32 KB streaming body limit even without Content-Length. Invalid JSON returns 400; oversize payloads return 413. Authentication occurs before reading the body. Telegram and Redis calls have bounded timeouts. Secrets and message contents are not logged.

Update IDs use atomic processing claims with 120-second expiry, then completed markers retained seven days. Failed updates release their own token-checked claim so Telegram can retry; an in-progress duplicate or busy user returns 503 instead of pretending it completed. Private mutations are serialized with a 120-second lease. The Redis limiter allows 20 actions per 60-second window; fallback operation uses process-local rate accounting.

Completed-update deduplication prevents normal webhook retries from replaying work. Exactly-once delivery is not guaranteed if a network failure occurs after Telegram accepts a message but before the bot receives the response or stores completion. Delivery and persistence are separate systems. Lease expiry during an abnormally slow handler is another operational limit. Monitor timeouts and use host request limits consistent with the lease.

To register after deployment, POST to /api/telegram/setup with Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>. Setup remains deployment-only and registers message and callback_query updates. See the official [Telegram webhook documentation](https://core.telegram.org/bots/api#setwebhook). Do not use getUpdates while a webhook is registered. No setup request was executed during this change.

## Verification still required

The earlier offline Telegram validation suite covered malformed nested identity, callback byte limits, streamed body limits, migration of valid old state, and cross-user/corrupt settings rejection. Current football changes and their tests have not been executed; build, type-checking, live Telegram integration, Redis integration and deployed behavior remain unverified.

After permission to run checks, verify all menus, configuration isolation with two private users, Mines local marks, Penalty Turbo/Series, manual result import, separate signal history, notification persistence and replay of a failed notification confirmation, invalid secrets, malformed/oversized bodies, duplicate updates, failed-update retry, concurrent actions, and state surviving a restart with Redis. Successful Telegram or database access does not establish live provider connectivity.
