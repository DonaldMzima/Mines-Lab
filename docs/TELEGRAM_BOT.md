# Telegram bot setup

The Telegram bot is separate from Mines Lab browser storage. It stores its mine-count choice, local board marks, generated experimental signals, received completed rounds, and processed update IDs on the server only. The current store is process-local; use a shared durable database or Redis before a multi-instance deployment.

## Required environment variables

- `TELEGRAM_BOT_TOKEN` — create the bot with [@BotFather](https://t.me/BotFather) and use the token BotFather provides. Keep it server-only.
- `TELEGRAM_WEBHOOK_SECRET` — 1–256 characters from `A-Z`, `a-z`, `0-9`, `_`, or `-`.
- `APP_BASE_URL` — public HTTPS deployment URL, without a trailing slash.

## Register the webhook

Deploy first, then POST to `/api/telegram/setup` with:

```text
Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>
```

The endpoint calls Telegram's official `setWebhook` method with `/api/telegram/webhook`, the secret token, and only `message` and `callback_query` updates. Do not call this endpoint from browser code.

## Local development

Use one webhook-based workflow, not long polling. Start the normal Next.js development server, expose its port through a secure HTTPS tunnel, then set `APP_BASE_URL` to the tunnel URL and call the authenticated setup endpoint above. Telegram delivers updates only to the tunnel URL while that webhook is registered. Before switching to a production deployment, register the production URL through the same setup endpoint; do not run `getUpdates` while a webhook is active.

## Commands

- `/start`
- `/help`
- `/status`
- `/signal`
- `/history`

The bot’s signal uses the same uniform-random experimental generator as Mines Lab. It does not predict mines or place bets. Live completed-round notifications require a future genuine server-side data integration to call `notifyTelegramCompletedRound`; browser localStorage is not a source of bot notifications.

The bot accepts up to 20 commands or button actions per chat per minute in its current process. This limits accidental or abusive bursts but is not a distributed rate limiter.
