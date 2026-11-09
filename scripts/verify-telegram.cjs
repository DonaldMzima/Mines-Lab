"use strict";

/**
 * Offline integration verification for the actual bot, store, webhook, and engines.
 * No .env files are read. Production env values are replaced temporarily in memory.
 * global.fetch never delegates to the real fetch: unexpected URLs fail immediately.
 * Run only with permission: node scripts/verify-telegram.cjs
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { registerTypescript, projectRoot } = require("./register-typescript.cjs");

async function runTelegramVerification(options = {}) {
  const restoreLoader = registerTypescript();
  const NativeDate = global.Date;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const envNames = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "APP_BASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "TELEGRAM_STORE_NAMESPACE"];
  const savedEnv = new Map(envNames.map(name => [name, process.env[name]]));
  const telegramPrefix = path.join(projectRoot, "src/lib/telegram") + path.sep;
  const routeFile = path.join(projectRoot, "src/app/api/telegram/webhook/route.ts");
  const clearModules = () => {
    for (const filename of Object.keys(require.cache)) {
      if (filename.startsWith(telegramPrefix) || filename === routeFile) delete require.cache[filename];
    }
  };
  const calls = [];
  const logs = [];
  const cases = [];
  let assertions = 0;
  let updateId = 7_000_000;
  let responseId = 90_000;
  let clockMs = NativeDate.parse("2025-01-01T12:00:00.000Z");
  let failOnce = null;
  let hold = null;
  const token = "000000:offline-test-token";
  const secret = "offline-test-webhook-secret";

  function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
  function same(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
  function truth(value, message) { assertions += 1; assert.ok(value, message); }
  async function rejects(action, expected, message) { assertions += 1; await assert.rejects(action, expected, message); }
  async function test(name, action) {
    const before = assertions;
    try { await action(); }
    catch (error) {
      error.message = name + ": " + error.message;
      throw error;
    }
    cases.push({ name, assertions: assertions - before });
    if (options.verbose) console.log("PASS " + name);
  }
  const advance = (milliseconds = 1_000) => { clockMs += milliseconds; };
  const iso = value => new NativeDate(value).toISOString();
  const message = (chatId, text) => ({
    update_id: ++updateId,
    message: { message_id: updateId + 100, from: { id: chatId }, chat: { id: chatId, type: "private" }, text },
  });
  const callback = (chatId, data) => ({
    update_id: ++updateId,
    callback_query: {
      id: "offline-callback-" + updateId, from: { id: chatId }, data,
      message: { message_id: updateId + 100, chat: { id: chatId, type: "private" } },
    },
  });

  try {
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    process.env.APP_BASE_URL = "https://offline.invalid";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.TELEGRAM_STORE_NAMESPACE;
    global.Date = class VerificationDate extends NativeDate {
      constructor(...args) {
        if (args.length === 0) super(clockMs);
        else super(...args);
      }
      static now() { return clockMs; }
    };
    console.error = (...args) => { logs.push(args); };
    global.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const prefix = "https://api.telegram.org/bot" + token + "/";
      if (typeof url !== "string" || !url.startsWith(prefix)) throw new Error("Offline verifier blocked an unexpected network destination.");
      const method = url.slice(prefix.length);
      if (!["sendMessage", "editMessageText", "answerCallbackQuery"].includes(method)) throw new Error("Offline verifier blocked an unexpected Telegram method.");
      const body = JSON.parse(String(init.body));
      const call = { method, body };
      calls.push(call);
      if (hold && hold.predicate(call)) {
        const active = hold;
        hold = null;
        active.started();
        await active.gate;
      }
      if (failOnce && failOnce(call)) {
        failOnce = null;
        return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, result: method === "sendMessage" ? { message_id: ++responseId } : true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    clearModules();
    const { handleTelegramUpdate } = require(path.join(projectRoot, "src/lib/telegram/bot.ts"));
    const store = require(path.join(projectRoot, "src/lib/telegram/store.ts"));
    const { POST } = require(routeFile);
    const { analyzeGame, getDefaultInput } = require(path.join(projectRoot, "src/lib/analysis/index.ts"));
    const { GAME_IDS, getGameDefinition } = require(path.join(projectRoot, "src/lib/game-registry.ts"));
    const { toMinesGameSignal } = require(path.join(projectRoot, "src/lib/mines-game-signal.ts"));

    const sentSince = (start, chatId) => calls.slice(start).filter(call => ["sendMessage", "editMessageText"].includes(call.method) && call.body.chat_id === chatId);
    async function command(chatId, text) {
      advance();
      const start = calls.length;
      await handleTelegramUpdate(message(chatId, text));
      return sentSince(start, chatId);
    }
    async function press(chatId, data) {
      advance();
      const start = calls.length;
      await handleTelegramUpdate(callback(chatId, data));
      return sentSince(start, chatId);
    }
    const lastText = responses => responses.at(-1)?.body.text ?? "";
    const buttonData = response => (response?.body.reply_markup?.inline_keyboard ?? []).flat().map(button => button.callback_data);
    const stable = signal => {
      const { generatedAt, ...rest } = signal;
      return rest;
    };
    function fixture(id) {
      const input = { ...getDefaultInput(id), rulesConfirmed: true, roundId: "offline-round-" + id };
      if (id === "mines") Object.assign(input, { mines: 3, picks: 3, rulesConfirmed: false });
      if (id === "penalty") Object.assign(input, { mode: "series", step: 3 });
      if (id === "blackjack") Object.assign(input, { cards: ["8", "8"], dealer: "6" });
      if (id === "hilo") Object.assign(input, { currentRank: 8, rankCounts: Array.from({ length: 13 }, (_, i) => i === 7 ? 3 : 4), ties: "lose" });
      if (id === "towers") Object.assign(input, { steps: 2, grossPayout: 2.5 });
      if (id === "poker") Object.assign(input, { cards: ["AS", "KS", "QS", "JS", "10S"], discardIndexes: [] });
      if (getGameDefinition(id).category === "crash") Object.assign(input, {
        history: [1.2, 2, 3.4, 1.8].map((multiplier, i) => ({ roundId: id + "-past-" + i, completedAt: "2024-12-31T12:00:0" + i + "Z", multiplier, source: "manual" })),
        target: 2,
      });
      if (id === "penalty") delete input.rulesConfirmed; // Penalty uses supplied rules, not a confirmation switch.
      return input;
    }
    function outcome(id, input) {
      const data = {
        mines: { minePositions: [0, 1, 2] },
        penalty: { mode: "series", step: 3, scored: true },
        blackjack: { outcome: "loss" },
        hilo: { rank: 6 },
        dice: { value: 42 },
        plinko: { slot: 4 },
        keno: { drawnNumbers: Array.from({ length: 20 }, (_, i) => i + 1) },
        towers: { survived: true, steps: 2 },
        coinflip: { side: "heads" },
        poker: { cards: ["AS", "KS", "QS", "JS", "TS"] },
      }[id] ?? { multiplier: 2.4 };
      advance(5_000);
      return { gameId: id, roundId: input.roundId, completedAt: iso(clockMs - 1_000), source: "manual", data };
    }
    function request(payload, headerSecret = secret) {
      return new Request("https://offline.invalid/api/telegram/webhook", {
        method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": headerSecret },
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
      });
    }

    await test("all 15 games are reachable through the actual compact menus", async () => {
      const chatId = 110_001;
      const menuResponses = [];
      menuResponses.push(...await command(chatId, "/start"));
      menuResponses.push(...await press(chatId, "menu:crash"));
      menuResponses.push(...await press(chatId, "menu:more"));
      const ids = new Set(menuResponses.flatMap(buttonData).filter(data => data.startsWith("game:")).map(data => data.slice(5)));
      same([...ids].sort(), [...GAME_IDS].sort(), "Every game must have a reachable menu choice.");
      truth(menuResponses[0].body.text.includes("\n"), "Telegram messages must contain actual line breaks.");
      truth(!menuResponses[0].body.text.includes("\\n"), "Telegram messages must not display escaped line breaks.");
    });

    for (const [index, id] of GAME_IDS.entries()) {
      await test(id + ": selection, configuration, signal parity, completed result and history", async () => {
        const chatId = 120_000 + index;
        const selected = await press(chatId, "game:" + id);
        for (const action of ["signal", "settings", "completed", "history", "status", "details"]) {
          truth(buttonData(selected.at(-1)).includes(action), id + " must expose the supported workspace action " + action);
        }
        const input = fixture(id);
        await command(chatId, "/config " + JSON.stringify(input));
        let state = await store.getTelegramUser(chatId);
        equal(state.selectedGame, id);
        same(state.gameConfigs[id], input, "Saved settings must reflect this game's actual input.");
        const responses = await command(chatId, "/signal");
        state = await store.getTelegramUser(chatId);
        const records = state.signalHistory[id] ?? [];
        equal(records.length, 1);
        same(records[0].input, input, "The exact input must be stored before delivery.");
        truth(NativeDate.parse(records[0].signal.generatedAt) <= NativeDate.parse(records[0].recordedAt));
        const expected = id === "mines" ? toMinesGameSignal(state.latestSignal) : analyzeGame(id, input);
        same(stable(records[0].signal), stable(expected), "Bot and application must use the same signal contract.");
        const text = lastText(responses);
        truth(text.includes("Not connected"), "No manual input can imply a provider connection.");
        if (expected.action) truth(text.includes(expected.action), "Main message must show the engine action.");
        truth(text.includes(expected.summary), "Main message must show the game-specific analysis.");
        if (id === "mines") {
          equal(state.latestSignal.suggestedTiles.length, 3);
          equal(new Set(state.latestSignal.suggestedTiles).size, 3);
          equal(buttonData(responses.at(-1)).filter(data => data.startsWith("tile:")).length, 25);
        }
        if (id === "penalty") {
          truth(text.includes("Direction signal: Unavailable"));
          truth(!/SIGNAL\s+(?:LEFT|CENTER|RIGHT)\b/.test(text));
        }
        if (getGameDefinition(id).category === "crash") {
          equal(records[0].signal.action, null, "Completed crash history cannot become a next-round action.");
          equal(records[0].signal.details.sampleSize, 4);
        }
        const result = outcome(id, input);
        await command(chatId, "/record " + JSON.stringify(result));
        state = await store.getTelegramUser(chatId);
        equal(state.completedResults[id].length, 1);
        equal(state.completedResults[id][0].source, "manual");
        const latest = lastText(await command(chatId, "/result"));
        truth(latest.includes(result.roundId));
        truth(latest.toLowerCase().includes("manual"));
        const history = lastText(await command(chatId, "/history"));
        truth(history.includes("COMPLETED RESULTS") && history.includes("SIGNAL HISTORY"));
        truth(history.includes("Independently evaluated accuracy: unavailable"));
        const detail = lastText(await command(chatId, "/details"));
        truth(detail.includes("Latest analysis details"));
        if (getGameDefinition(id).category === "crash") {
          equal(state.gameConfigs[id].history.length, 5, "Manual crash import must retain the supplied history.");
        }
      });
    }

    await test("two private users retain independent settings, signals and completed results", async () => {
      const first = 130_001, second = 130_002;
      for (const [chatId, threshold, value] of [[first, 20, 10], [second, 80, 90]]) {
        await press(chatId, "game:dice");
        await command(chatId, "/config " + JSON.stringify({ threshold, rulesConfirmed: true, roundId: "shared-external-round" }));
        await command(chatId, "/signal");
        advance(5_000);
        await command(chatId, "/record " + JSON.stringify({ gameId: "dice", roundId: "shared-external-round", completedAt: iso(clockMs - 1_000), source: "manual", data: { value } }));
      }
      let a = await store.getTelegramUser(first), b = await store.getTelegramUser(second);
      equal(a.gameConfigs.dice.threshold, 20);
      equal(b.gameConfigs.dice.threshold, 80);
      equal(a.completedResults.dice[0].data.value, 10);
      equal(b.completedResults.dice[0].data.value, 90);
      equal(a.signalHistory.dice.length, 1);
      equal(b.signalHistory.dice.length, 1);
      await press(first, "game:hilo");
      await command(first, "/config " + JSON.stringify({ currentRank: 8, rulesConfirmed: true }));
      await command(first, "/signal");
      await press(first, "game:dice");
      const settingsText = lastText(await command(first, "/settings"));
      truth(settingsText.includes('"threshold": 20'));
      const resultText = lastText(await command(first, "/result"));
      truth(resultText.includes('"value":10'));
      a = await store.getTelegramUser(first); b = await store.getTelegramUser(second);
      equal(a.signalHistory.hilo.length, 1);
      equal(b.signalHistory.hilo, undefined);
      equal(b.selectedGame, "dice");
    });

    await test("legacy Mines controls preserve independent counts, local marks and server results", async () => {
      const chatId = 140_001;
      await press(chatId, "mines:5");
      await press(chatId, "suggestions:2");
      const response = await command(chatId, "/signal");
      let state = await store.getTelegramUser(chatId);
      equal(state.mineCount, 5); equal(state.suggestionCount, 2);
      equal(state.latestSignal.suggestedTiles.length, 2);
      truth(lastText(response).includes("Experimental") || lastText(response).includes("experimental"));
      await press(chatId, "tile:4");
      state = await store.getTelegramUser(chatId);
      same(state.selectedTiles, [4]);
      await press(chatId, "tile:4");
      same((await store.getTelegramUser(chatId)).selectedTiles, []);
      await store.updateTelegramUser(chatId, { rounds: [{ id: "legacy-mines-round", gameId: "v_1wingames:mines", timestamp: "2024-12-31T01:00:00Z", bombCount: 3, minePositions: [0, 2, 4], selectedPositions: [], result: "unknown", source: "demo", mode: "demo" }] });
      const completed = lastText(await command(chatId, "/round"));
      truth(completed.includes("legacy-mines-round"));
      truth(completed.includes("01, 03, 05"));
      truth(completed.includes("demo"));
    });

    await test("legacy Penalty command and Turbo/Series controls use documented probabilities", async () => {
      const chatId = 140_002;
      let text = lastText(await command(chatId, "/penalty"));
      truth(text.includes("turbo") && text.includes("53.33%"));
      await press(chatId, "penalty:series");
      await command(chatId, "/config " + JSON.stringify({ step: 5 }));
      text = lastText(await command(chatId, "/signal"));
      truth(text.includes("Step: 5") && text.includes("33.33%"));
      text = lastText(await press(chatId, "penalty:turbo"));
      truth(text.includes("53.33%") && !text.includes("Step: 5"));
      text = lastText(await press(chatId, "penalty:series"));
      truth(text.includes("Step: 5") && text.includes("Direction signal: Unavailable"));
    });

    await test("notification menu and explicit on/off actions are isolated and retry-idempotent", async () => {
      const chatId = 150_001, other = 150_002;
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, false);
      await command(chatId, "/notifications");
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, false);
      await press(chatId, "notifications:on");
      await press(chatId, "notifications:on");
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true);
      await press(chatId, "notifications:toggle");
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true);
      await command(chatId, "/notifications off");
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, false);
      const update = message(chatId, "/notifications on");
      failOnce = call => call.method === "sendMessage" && call.body.chat_id === chatId;
      await rejects(() => handleTelegramUpdate(update), /Telegram sendMessage failed/);
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true, "Save succeeds before the simulated send failure.");
      await handleTelegramUpdate(update);
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true, "Replay must retain the desired opt-in.");
      const sent = calls.length;
      await handleTelegramUpdate(update);
      equal(calls.length, sent, "Completed update replay must produce no outbound requests.");
      equal((await store.getTelegramUser(other)).notificationsEnabled, false);
    });

    await test("invalid configuration, conflicting results and duplicate linked signals preserve data", async () => {
      const chatId = 160_001;
      await press(chatId, "game:dice");
      await command(chatId, "/config " + JSON.stringify({ threshold: 30, rulesConfirmed: true, roundId: "  canonical-link  " }));
      let state = await store.getTelegramUser(chatId);
      equal(state.gameConfigs.dice.roundId, "canonical-link");
      const original = structuredClone(state.gameConfigs.dice);
      await command(chatId, '/config {"threshold":"invalid"}');
      await command(chatId, '/config {"unknownTokenField":"never-store-this"}');
      same((await store.getTelegramUser(chatId)).gameConfigs.dice, original);
      await command(chatId, "/signal");
      await command(chatId, "/signal");
      equal((await store.getTelegramUser(chatId)).signalHistory.dice.length, 1);
      advance(5_000);
      const result = { gameId: "dice", roundId: "canonical-link", completedAt: iso(clockMs - 1_000), source: "manual", data: { value: 12 } };
      await command(chatId, "/record " + JSON.stringify(result));
      await command(chatId, "/record " + JSON.stringify(result));
      await command(chatId, "/record " + JSON.stringify({ ...result, data: { value: 99 } }));
      state = await store.getTelegramUser(chatId);
      equal(state.completedResults.dice.length, 1);
      equal(state.completedResults.dice[0].data.value, 12);
      truth(lastText(await command(chatId, "/history")).includes("Manual event successes: 1/1"));
      await command(chatId, '/config {"roundId":null}');
      equal((await store.getTelegramUser(chatId)).gameConfigs.dice.roundId, undefined);
      await command(chatId, '/config {"roundId":"canonical-link"}');
      truth(lastText(await command(chatId, "/signal")).includes("already has"));
    });

    await test("completed outcomes cannot be recorded as new future signals", async () => {
      const chatId = 160_002;
      await press(chatId, "game:dice");
      const result = { gameId: "dice", roundId: "already-finished", completedAt: "2024-12-31T12:00:00Z", source: "manual", data: { value: 40 } };
      await command(chatId, "/record " + JSON.stringify(result));
      await command(chatId, '/config {"roundId":"already-finished","rulesConfirmed":true}');
      truth(lastText(await command(chatId, "/signal")).includes("already has"));
      equal((await store.getTelegramUser(chatId)).signalHistory.dice, undefined);
    });

    await test("in-flight duplicate updates and same-user concurrency are retried safely", async () => {
      const chatId = 170_001;
      let started, release;
      const startedPromise = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      hold = { predicate: call => call.method === "sendMessage" && call.body.chat_id === chatId, started, gate };
      const first = message(chatId, "/status");
      const firstRun = handleTelegramUpdate(first);
      await startedPromise;
      await rejects(() => handleTelegramUpdate(first), /being processed/);
      const second = message(chatId, "/help");
      await rejects(() => handleTelegramUpdate(second), /being processed/);
      release();
      await firstRun;
      await handleTelegramUpdate(second);
      const count = calls.length;
      await handleTelegramUpdate(first);
      await handleTelegramUpdate(second);
      equal(calls.length, count);
    });

    await test("group controls and mismatched private sender identity cannot alter another user", async () => {
      const owner = 170_002;
      const original = await store.getTelegramUser(owner);
      const forged = callback(owner, "notifications:on");
      forged.callback_query.from.id = 170_003;
      await handleTelegramUpdate(forged);
      equal((await store.getTelegramUser(owner)).notificationsEnabled, original.notificationsEnabled);
      const group = message(170_004, "/notifications on");
      group.message.chat = { id: -100_170_004, type: "supergroup" };
      await handleTelegramUpdate(group);
      equal((await store.getTelegramUser(170_004)).notificationsEnabled, false);
    });

    await test("webhook validates secrets, nested payloads, JSON and streaming body limits", async () => {
      const initialCalls = calls.length;
      let touchedBody = false;
      const unauthorized = {
        headers: new Headers({ "x-telegram-bot-api-secret-token": "wrong-secret" }),
        get body() { touchedBody = true; throw new Error("Unauthorized body must not be read."); },
      };
      equal((await POST(unauthorized)).status, 401);
      equal(touchedBody, false);
      equal((await POST(request("{"))).status, 400);
      equal((await POST(request({ update_id: ++updateId, callback_query: { id: "bad", from: { id: "not-a-number" } } }))).status, 400);
      equal((await POST(request("x".repeat(32_769)))).status, 413);
      equal((await POST(new Request("https://offline.invalid/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret, "content-length": "40000" }, body: "{}" }))).status, 413);
      equal(calls.length, initialCalls, "Rejected webhooks must not call Telegram.");
      const payload = message(180_001, "/start");
      const good = await POST(request(payload));
      equal(good.status, 200);
      equal((await good.json()).ok, true);
      const count = calls.length;
      equal((await POST(request(payload))).status, 200);
      equal(calls.length, count);
    });

    await test("webhook releases failed updates for retry and retains secret-free error logging", async () => {
      const chatId = 180_002;
      const payload = message(chatId, "/notifications on");
      failOnce = call => call.method === "sendMessage" && call.body.chat_id === chatId;
      equal((await POST(request(payload))).status, 502);
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true);
      equal((await POST(request(payload))).status, 200);
      equal((await store.getTelegramUser(chatId)).notificationsEnabled, true);
      const count = calls.length;
      equal((await POST(request(payload))).status, 200);
      equal(calls.length, count);
      const output = JSON.stringify(logs);
      truth(!output.includes(token) && !output.includes(secret) && !output.includes(String(chatId)) && !output.includes("/notifications on"));
    });

    await test("process-local rate limiting remains separate from duplicate-update handling", async () => {
      const chatId = 190_001;
      const start = calls.length;
      for (let i = 0; i < 21; i += 1) await handleTelegramUpdate(message(chatId, "/status"));
      const responses = sentSince(start, chatId);
      equal(responses.length, 21);
      truth(responses.at(-1).body.text.includes("Please wait"));
      truth(responses[0].body.text.includes("process-local (not durable)"));
      advance(61_000);
      truth(lastText(await command(chatId, "/status")).includes("Connection: Not connected"));
    });

    await test("football website and Telegram share native validation and history evaluation", async () => {
      const football = require(path.join(projectRoot, "src/lib/football/service.ts"));
      const footballStorage = require(path.join(projectRoot, "src/lib/football/storage.ts"));
      const { validateProviderForecast, evaluateProviderForecasts } = require(path.join(projectRoot, "src/lib/football/analysis.ts"));
      const { GET: getHistory } = require(path.join(projectRoot, "src/app/api/football/history/route.ts"));
      const { GET: getDetail } = require(path.join(projectRoot, "src/app/api/football/fixtures/[fixtureId]/route.ts"));
      const originalDetail = football.getFootballFixtureDetail;
      const originalHistory = footballStorage.getForecastHistory;
      const forecast = { fixtureId: 123, provider: "API-Football", kickoff: "2099-01-01T12:00:00Z", generatedAt: "2024-12-01T00:00:00Z", predictable: true, markets: [{ key: "result", name: "Full-time result", outcomes: [{ label: "home", probability: 50 }, { label: "draw", probability: 30 }, { label: "away", probability: 20 }] }] };
      const validation = validateProviderForecast(forecast);
      const detail = { fixture: { id: 123, homeTeam: "Home FC", awayTeam: "Away FC", competition: { id: 39, name: "Premier League" }, kickoff: forecast.kickoff }, markets: validation.markets, primaryOutcome: validation.primaryOutcome, model: { name: "API-Football predictions", version: validation.modelVersion, status: "provider-model", summary: validation.message } };
      const records = [{ forecast: { ...forecast, kickoff: "2024-12-02T00:00:00Z" }, result: { home: 2, away: 1, completedAt: "2024-12-03T00:00:00Z" } }];
      football.getFootballFixtureDetail = async id => { equal(id, 123); return detail; };
      footballStorage.getForecastHistory = async () => records;
      try {
        const web = await (await getDetail(new Request("https://offline.invalid/api/football/fixtures/123"), { params: Promise.resolve({ fixtureId: "123" }) })).json();
        same(web.primaryOutcome, validation.primaryOutcome);
        const chatId = 195_001;
        const predictionText = lastText(await command(chatId, "/prediction 123"));
        truth(predictionText.includes(`${web.primaryOutcome.outcome} · ${web.primaryOutcome.market} · ${web.primaryOutcome.probability.toFixed(1)}%`));
        const history = await (await getHistory()).json();
        same(history.evaluation, evaluateProviderForecasts(records));
        equal(history.evaluationMessage, null);
        const text = lastText(await command(chatId, "/footballhistory"));
        truth(text.includes(`Settled fixtures: ${history.evaluation.evaluatedFixtures}`));
        truth(text.includes(`Top-outcome accuracy: ${(history.evaluation.topOutcomeAccuracy * 100).toFixed(1)}%`));
        truth(text.includes(`Multiclass Brier score: ${history.evaluation.multiclassBrierScore.toFixed(4)}`));
      } finally {
        football.getFootballFixtureDetail = originalDetail;
        footballStorage.getForecastHistory = originalHistory;
      }
    });

    await test("current-source fixtures stay identical on the website and Telegram without invented predictions", async () => {
      const footballStorage = require(path.join(projectRoot, "src/lib/football/storage.ts"));
      const { parseFootballDataFixture } = require(path.join(projectRoot, "src/lib/football/football-data.ts"));
      const { GET: getDetail } = require(path.join(projectRoot, "src/app/api/football/fixtures/[fixtureId]/route.ts"));
      const originalCache = footballStorage.cachedJson;
      const fixture = parseFootballDataFixture({ id: 123, utcDate: "2099-01-01T12:00:00Z", status: "TIMED", competition: { id: 2021, name: "Premier League", code: "PL" }, season: { startDate: "2098-08-01" }, area: { name: "England" }, homeTeam: { name: "Home FC" }, awayTeam: { name: "Away FC" }, score: { fullTime: { home: null, away: null } } });
      footballStorage.cachedJson = async key => { equal(key, `football-data:fixture:${fixture.id}`); return fixture; };
      try {
        const web = await (await getDetail(new Request(`https://offline.invalid/api/football/fixtures/${fixture.id}`), { params: Promise.resolve({ fixtureId: String(fixture.id) }) })).json();
        same(web.fixture, fixture);
        equal(web.primaryOutcome, null);
        same(web.markets, []);
        const text = lastText(await command(195_002, `/prediction ${fixture.id}`));
        truth(text.includes("Home FC vs Away FC"));
        truth(text.includes("Source: football-data.org"));
        truth(!text.includes("Most likely provider outcome:"));
        truth(text.includes(web.model.summary));
      } finally { footballStorage.cachedJson = originalCache; }
    });

    await test("website and Telegram generate and save the same priced proposal", async () => {
      const generator = require(path.join(projectRoot, "src/lib/football/ticket-generator.ts"));
      const footballStorage = require(path.join(projectRoot, "src/lib/football/storage.ts"));
      const { POST: generateRoute } = require(path.join(projectRoot, "src/app/api/football/generate/route.ts"));
      const { POST: saveRoute } = require(path.join(projectRoot, "src/app/api/football/tickets/route.ts"));
      const original = { generate: generator.generateFootballTicket, save: generator.saveGeneratedFootballTicket, cached: footballStorage.cachedJson, cache: footballStorage.cacheJson, link: footballStorage.getLinkedBrowserId };
      const browserId = "00000000-0000-4000-8000-000000000001", proposalId = "00000000-0000-4000-8000-000000000002";
      const input = { dates: { start: "2099-01-01", end: "2099-02-10" }, competitionIds: [1000002021], stakeZar: 50, strategy: "conservative", markets: ["h2h"] };
      const selections = [{ fixtureId: 1000000123, homeTeam: "Home FC", awayTeam: "Away FC", kickoff: "2099-01-02T12:00:00Z", competition: "Premier League", market: "Full-time result", selection: "Home", decimalOdds: 1.4, bookmaker: "Book A", oddsSource: "The Odds API", providerOddId: null, oddsObservedAt: new Date().toISOString(), oddsUpdatedAt: new Date().toISOString(), estimatedProbability: .7, probabilityBasis: "market-implied", providerEventId: "offline-event", providerMarketKey: "h2h", overround: .04 }];
      const proposal = { proposalId, settings: input, selections, combinedOdds: 1.4, potentialReturnZar: 70, potentialProfitZar: 20, estimatedAllWinProbability: .7, riskLabel: "Conservative; no bet is safe.", message: "One supported selection.", warnings: [], generatedAt: new Date().toISOString(), expiresAt: new Date(clockMs + 600000).toISOString(), methodology: "Market-implied estimates; not verified accuracy." };
      const generated = [], saved = [], cache = new Map();
      cache.set("football-ticket-settings:196001", input);
      footballStorage.cachedJson = async key => cache.get(key) ?? null;
      footballStorage.cacheJson = async (key, value) => { cache.set(key, value); };
      footballStorage.getLinkedBrowserId = async () => browserId;
      generator.generateFootballTicket = async (browser, value) => { generated.push({ browser, settings: generator.parseTicketSettings(value) }); return proposal; };
      generator.saveGeneratedFootballTicket = async (browser, id) => { saved.push({ browser, id }); return { ticket: { id, createdAt: new Date().toISOString(), stakeZar: 50, selections, combinedOdds: 1.4, potentialReturnZar: 70, potentialProfitZar: 20, fingerprint: "a".repeat(64) }, duplicate: false }; };
      const post = (url, body) => new Request("https://offline.invalid" + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      try {
        const web = await (await generateRoute(post("/api/football/generate", { browserId, ...input }))).json();
        equal(web.selections[0].decimalOdds, 1.4);
        await command(196001, "/ticketdates 2099-01-01 2099-02-10");
        await command(196001, "/ticketbudget 50");
        const text = lastText(await command(196001, "/generateticket"));
        truth(text.includes("PROPOSED TICKET — NOT SAVED"));
        truth(text.includes("Book A · 1.400"));
        truth(text.includes("Potential total return R70.00"));
        same(generated[0], generated[1]);
        equal((await saveRoute(post("/api/football/tickets", { browserId, proposalId }))).status, 201);
        await press(196001, "ft:save:" + proposalId);
        same(saved[0], saved[1]);
      } finally { generator.generateFootballTicket = original.generate; generator.saveGeneratedFootballTicket = original.save; footballStorage.cachedJson = original.cached; footballStorage.cacheJson = original.cache; footballStorage.getLinkedBrowserId = original.link; }
    });

    return { suite: "telegram-offline-integration", cases: cases.length, assertions, games: GAME_IDS.length, network: "mocked only; no real requests", storage: "process-local test state", results: cases };
  } finally {
    global.fetch = originalFetch;
    global.Date = NativeDate;
    console.error = originalConsoleError;
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    clearModules();
    restoreLoader();
  }
}

module.exports = { runTelegramVerification };
if (require.main === module) {
  runTelegramVerification().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error("Telegram offline verification failed: " + error.message);
    process.exitCode = 1;
  });
}
