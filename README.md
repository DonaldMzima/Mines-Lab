# Mines Lab V4

The existing Next.js application now contains analysis modules for all 15 games, a shared web/Telegram signal contract, manual completed-result records, and native TypeScript analysis and evaluation.

**The API-Football integration is not yet verified.** Earlier local checks covered the fifteen-game application before football was added; they do not establish that the current source builds or that football works. No live API-Football, Upstash, Telegram, or production deployment verification has been performed.

## Start here

- [Full implementation report and 15-game matrix](docs/IMPLEMENTATION_REPORT.md)
- [Game mechanics, evidence and exact blockers](docs/GAME_RULES_V4.md)
- [Native analysis migration and offline JSON CLI](docs/NATIVE_ANALYSIS.md)
- [Telegram configuration and commands](docs/TELEGRAM_BOT.md)
- [Automatic football tickets, odds and limits](docs/FOOTBALL_TICKETS.md)
- [Football sources, multi-select and current limitations](docs/FOOTBALL_DATA.md)
- [Football archive service and release verification](docs/FOOTBALL_SERVICE.md)
- [Authorized data-source investigation](docs/REAL_DATA_INVESTIGATION.md)
- [Penalty evidence boundary](docs/PENALTY_INTEGRATION_BLOCKERS.md)

## Website

Choose a game, enter known state and rules, then use **Get Signal**. Blackjack and Hilo directions require the supported rule configuration to be explicitly confirmed. Other games return calculations or an honest unavailable result. Example configurations are not verified 1win rules.

The main card shows connection status, controls, a short action/status, a summary and the latest completed result. Details contains formulas, provenance, imports, history and manual comparison statistics. Existing Mines board, demo controls, browser-presence companion and localStorage history remain in place. Mines suggestions are explicitly experimental uniform-random selections.

All games show **Not connected**: no authorized provider result feed was established. Browser game detection never becomes a live-data connection. Manual/imported records are structurally validated but not provider-authenticated.

## Architecture

Next.js remains the website and bot application layer. Browser, POST /api/analysis and Telegram use the same TypeScript calculations under src/lib/analysis. Legacy Mines suggestions are adapted into that contract without migrating or deleting stored records.

All fifteen games use the existing shared TypeScript engines. Football uses API-Football for current leagues, fixtures, final scores, on-demand statistics and provider probabilities. Native validation and retrospective evaluation live in `src/lib/football/analysis.ts`, shared by website and Telegram. Redis retains the atomic 90-call UTC daily budget, existing keys, forecasts, tickets and account links. No prediction is fabricated when provider data is absent.

The website and Telegram call the same API-Football fixture/detail logic. Saved forecasts, manual-odds tickets and one-time account links use the same Upstash Redis namespace. Bookmaker odds are not fetched or invented; ticket odds are explicitly entered manually. The local adapter request budget, live provider coverage, shared storage, native validation, and website/Telegram parity have not been tested end-to-end.

Telegram preserves @MinesLabSignalsBot and its existing webhook. Its non-football state uses the existing Telegram storage configuration; football tickets and forecast history use Upstash. Browser and general game histories remain separate.

## Local verification commands

Earlier results apply only to the non-football app before the current football
provider work. The current checks are:

~~~sh
yarn lint
node --test src/lib/analysis/analysis.test.cjs src/lib/analysis-records.test.cjs src/lib/telegram/validation.test.cjs
node --test src/lib/football/football.test.cjs
node scripts/verify-analysis.cjs
node scripts/verify-telegram.cjs
node node_modules/typescript/bin/tsc --noEmit
yarn build
~~~

See the migration notes for current results and environment blockers. Follow [FOOTBALL_SERVICE.md](docs/FOOTBALL_SERVICE.md) for the full check sequence, configuration prerequisites, and required approval gates. Do not treat earlier game-suite or browser-smoke results as verification of football.

Regression and mocked integration checks passed; production build verification and removal of the retired reference sources remain blocked; see [the migration notes](docs/NATIVE_ANALYSIS.md).

The Football route now prioritizes Generate Ticket with custom dates, stake, strategy and actual bookmaker quotes when configured. See [ticket setup and verification](docs/FOOTBALL_TICKETS.md); live coverage remains unverified.
