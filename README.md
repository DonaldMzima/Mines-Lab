# Mines Lab V4

The existing Next.js application now contains analysis modules for all 15 games, a shared web/Telegram signal contract, manual completed-result records, and an independent Python reference engine.

**Local release checks passed on 8 November 2026; this is not a production release.** The production build, type-check, automated suites, local API/page checks and browser smoke checks passed. No live provider feed, production Redis, real Telegram request or deployment was tested.

## Start here

- [Full implementation report and 15-game matrix](docs/IMPLEMENTATION_REPORT.md)
- [Game mechanics, evidence and exact blockers](docs/GAME_RULES_V4.md)
- [Python reference calculations and JSON CLI](python/README.md)
- [Telegram configuration and commands](docs/TELEGRAM_BOT.md)
- [Authorized data-source investigation](docs/REAL_DATA_INVESTIGATION.md)
- [Penalty evidence boundary](docs/PENALTY_INTEGRATION_BLOCKERS.md)

## Website

Choose a game, enter known state and rules, then use **Get Signal**. Blackjack and Hilo directions require the supported rule configuration to be explicitly confirmed. Other games return calculations or an honest unavailable result. Example configurations are not verified 1win rules.

The main card shows connection status, controls, a short action/status, a summary and the latest completed result. Details contains formulas, provenance, imports, history and manual comparison statistics. Existing Mines board, demo controls, browser-presence companion and localStorage history remain in place. Mines suggestions are explicitly experimental uniform-random selections.

All games show **Not connected**: no authorized provider result feed was established. Browser game detection never becomes a live-data connection. Manual/imported records are structurally validated but not provider-authenticated.

## Architecture

Next.js remains the application layer. Browser, POST /api/analysis and Telegram use the same TypeScript calculations under src/lib/analysis. Legacy Mines suggestions are adapted into that contract without migrating or deleting stored records.

Python is an offline standard-library reference/evaluation engine. All 15 modules are available through its registry and bounded JSON CLI. The Node parity verifier invokes that CLI and matched the shared fixtures, but the Next.js runtime does **not** call Python; direct Next.js-to-Python communication is not implemented or verified. There is no production Python service, fabricated trained model, or new runtime package.

Telegram preserves @MinesLabSignalsBot, the webhook and command routes. Optional Upstash Redis REST settings provide shared server-side state and update claims. Without them, status explicitly says process-local storage is not durable. Browser and bot histories remain separate.

## Local verification performed

These checks passed locally:

~~~sh
yarn lint
node --test src/lib/analysis/analysis.test.cjs src/lib/analysis-records.test.cjs src/lib/telegram/validation.test.cjs
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -m unittest discover -s python/tests
node scripts/verify-python-parity.cjs
node scripts/verify-telegram.cjs
node node_modules/typescript/bin/tsc --noEmit
yarn build
~~~

The local release verifier also passed all 34 page/API checks against `yarn start --port 3100`; browser smoke exercised all 15 **Get Signal** buttons, settings/results persistence, conditional Blackjack/Hilo actions and the labeled Mines demo. Telegram verification used a mocked network only. No credentials were changed and no production deployment was performed. Deployment is not approved by these local checks.
