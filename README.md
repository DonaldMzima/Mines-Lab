# Mines Lab

Mines Lab is a local, evidence-first analysis workspace for selected 1win-style games. It currently provides Mines analysis, Penalty probability analysis, an optional Chrome game-presence companion, and an optional Telegram interface.

It is not a gambling automation tool. It does not place bets, select tiles or shots, cash out, or claim knowledge of future outcomes.

## Important status

There is **no verified authorized 1win read-only game-data API, WebSocket feed, or provider adapter configured in this repository**.

- Browser **Game detected** means only that the optional Chrome companion found an approved Mines marker in a permitted tab.
- A detected tab is not an active round, completed outcome, or live data feed.
- Mines suggestions are a **uniform random baseline**, not safe-tile predictions.
- Penalty calculations are theoretical rule calculations, not goalkeeper-direction forecasts.
- Imported data is user-provided unless a future authorized server-side source verifies provenance.

## Implemented games

| Game | Available functionality | Live provider data | Prediction claim |
| --- | --- | --- | --- |
| Mines | 5×5 probability analysis, demo simulation, validated local/imported results, history, experimental suggestions | Unavailable | No verified predictive advantage |
| Penalty | Turbo/Series score probabilities, cumulative Series probability, displayed multiplier diagnostics | Unavailable | No direction or outcome prediction |
| Blackjack, Hilo, Dice, Plinko, Keno, Towers, Coinflip, Poker, Lucky Jet, Rocket Queen, Rocket X, Aviator, Speed & Cash | Catalog entries only | Unavailable | None |

The game selector intentionally marks unimplemented games as **Planned** and shows no fake connection or prediction controls.

## Mines

For a 25-tile board, supported mine counts are 2, 3, 5, and 7. The survival chance for `k` suggested picks with `m` mines is:

`∏(25 - m - i) / (25 - i)` for `i = 0` through `k - 1`.

The signal generator shuffles tile positions uniformly and labels every recommendation **Experimental**. It does not use round history, completed mines, account data, or hidden game state.

Canonical completed Mines results require a completed round ID, timestamp, supported mine count, matching unique mine positions from 0–24, and a result status. The display maps internal positions 0–24 to tiles 01–25. Duplicate results are skipped; conflicts do not overwrite saved history.

Observed Mines payload helpers understand captured request/result shapes, but do not create a network connection and do not treat `ms_id` or a raw state code as a canonical round ID or terminal result by itself.

See [round tracking](./docs/ROUND_TRACKING.md) and [the live-data investigation](./docs/REAL_DATA_INVESTIGATION.md).

## Penalty

Penalty uses game ID `v_1wingames:penalty` and observed integration key `vgsonewin2_penalty`.

### Supplied in-game rules

- Published RTP: 94%
- Turbo theoretical score chance: 53.33%
- Series conditional score chances: 53.33%, 53.33%, 46.67%, 46.67%, 33.33%
- Displayed Series multipliers: 1.81×, 3.41×, 7.30×, 15.65×, 46.97×

The Series workspace multiplies the documented conditional score chances to show the chance of reaching each step. It also shows `reach probability × displayed multiplier` as a **diagnostic product only**. It is not a verified expected return because complete payout and cash-out rules are not documented.

### Observed data boundary

The Penalty observation parser validates these captured shapes:

- Shot request: `id`, `row`, `col`, `bet_amount`
- Response: `ms_id`, `state`, `outcome.catches`, `cashout`, `fair`
- `isDemo: true` is recognized as Demo; `false` remains unknown.
- Observed `state: 2` is labeled in-progress only.

The parser does **not** infer a goal layout, shooting direction, goalkeeper position, completed outcome, or real-money mode. `outcome.catches` is opaque because its meaning and timing are not verified. `ms_id` is never used as a round ID. See [Penalty integration blockers](./docs/PENALTY_INTEGRATION_BLOCKERS.md).

## Chrome companion

The unpacked Manifest V3 companion lives in [`chrome-extension`](./chrome-extension). It can return only:

- Extension unavailable
- Permission required
- Game not found
- Game detected
- Disconnected
- Error

It does not read passwords, cookies, localStorage, session tokens, network traffic, WebSocket messages, account balances, or game outcomes. It does not automate any action.

See [Chrome companion setup](./docs/CHROME_COMPANION.md).

## Telegram bot

The bot is configured only with server-side environment variables. Commands include:

- `/start`, `/help`, `/status`
- `/signal` — experimental random Mines suggestions
- `/penalty` — Turbo/Series Penalty probability analysis
- `/result` and `/round` — latest server-known completed Mines result
- `/history` — server-known Mines results
- `/notifications` — opt in/out of future server-side completed-round notifications

The bot has no direct access to browser localStorage or the Chrome companion. Its current store is process-local; durable shared storage is required for reliable production history, settings, deduplication, and notifications across serverless instances.

Required deployment variables:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
APP_BASE_URL=https://your-public-https-domain.example
```

Keep real values in a deployment secret manager, never in client code, localStorage, or `.env.example`. Rotate a token or secret if it has been exposed.

## Local storage and provenance

The web workspace stores browser-local history, signals, evaluations, and preferences. Records are validated independently; corrupt categories are preserved until recovered in Settings.

- **Demo**: local simulation only.
- **Import/manual**: user-provided data, structurally validated but not provider-verified.
- **Provider/live**: reserved for a future documented, authorized adapter.

Do not mix Demo and Real records or present simulations as provider data.

## Python reference analysis

The [`python`](./python) package is an offline, standard-library-only reference implementation for Mines combinatorics, Penalty probability/multiplier diagnostics, and prospective prediction evaluation. It is intentionally not called by Next.js, Telegram, or Vercel: no deployed Python service, authentication contract, or authorized shared outcome source exists yet.

It adds independent calculations without adding a machine-learning stack or claiming a predictive model. See [the Python package guide](./python/README.md) for the future local test command.

## Run locally

This repository uses Yarn.

```bash
yarn dev
```

Open `http://localhost:3000`.

To use the Chrome companion during development, load [`chrome-extension`](./chrome-extension) as an unpacked extension, grant its optional 1win tab permission in the extension popup, then select **Connect Game** in Mines Lab.

## Manual verification checklist

1. Select **Mines**, start a local Demo round, and confirm it is labeled Demo.
2. Generate a Mines signal and confirm suggestions are labeled experimental, not safe or predictive.
3. Select **Penalty**, switch Turbo/Series, and compare probabilities and multipliers with the supplied game evidence.
4. Confirm Penalty does not show a live connection, directions, completed outcomes, or an expected-return claim.
5. Reload the unpacked Chrome extension; test no tab, non-Mines tab, detected Mines marker, and a closed/navigated tab.
6. After deployment, use `/start`, `/penalty`, `/signal`, and `/notifications` in Telegram. Confirm a response does not imply a 1win data connection.
7. Run build and type checks before deployment. No runtime success should be inferred from static inspection alone.

## Security and development rules

- Never automate betting, tile selection, shots, or cash-outs.
- Never collect cookies, passwords, session tokens, or account credentials.
- Never replay observed gameplay requests or use undocumented endpoints as a data feed.
- Do not label random output as prediction or imported data as provider-verified without evidence.
- Add a provider connector only after authorization, documented authentication, event schemas, round IDs, state meanings, rate limits, and retention permission are established.

## Further documentation

- [Live data investigation](./docs/REAL_DATA_INVESTIGATION.md)
- [Browser companion feasibility](./docs/BROWSER_COMPANION_FEASIBILITY.md)
- [Chrome companion setup](./docs/CHROME_COMPANION.md)
- [Penalty integration blockers](./docs/PENALTY_INTEGRATION_BLOCKERS.md)
- [Telegram bot setup](./docs/TELEGRAM_BOT.md)
- [Round tracking](./docs/ROUND_TRACKING.md)
