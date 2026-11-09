"use strict";

/** Offline JSON CLI. Run only with operator approval: node scripts/analyze.cjs [--list]. */
const { registerTypescript } = require("./register-typescript.cjs");

function analyzeRequest(raw, args = []) {
  const restore = registerTypescript();
  try {
    const { analyzeGame, getDefaultInput, ANALYSIS_VERSION } = require("../src/lib/analysis/index.ts");
    const { GAME_IDS, isGameId } = require("../src/lib/game-registry.ts");
    if (args.length === 1 && args[0] === "--list") return { exitCode: 0, body: { engineVersion: ANALYSIS_VERSION, games: GAME_IDS, exampleInputs: Object.fromEntries(GAME_IDS.map(id => [id, getDefaultInput(id)])) } };
    if (args.length) throw new Error("usage: node scripts/analyze.cjs [--list]");
    if (raw.byteLength > 1_048_576) throw new Error("request exceeds 1 MiB");
    const request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!request || typeof request !== "object" || Array.isArray(request) || typeof request.gameId !== "string") throw new Error("request must contain gameId and input");
    if (!isGameId(request.gameId)) throw new Error("unsupported gameId");
    const signal = analyzeGame(request.gameId, request.input);
    return { exitCode: signal.details.validationErrors ? 2 : 0, body: { engineVersion: ANALYSIS_VERSION, signal } };
  } catch (error) {
    return { exitCode: 2, body: { error: error.message } };
  } finally { restore(); }
}

async function main() {
  const chunks = [];
  let size = 0;
  if (!process.argv.slice(2).length) {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      chunks.push(chunk);
      if (size > 1_048_576) break;
    }
  }
  const result = analyzeRequest(Buffer.concat(chunks), process.argv.slice(2));
  process.stdout.write(JSON.stringify(result.body) + "\n");
  process.exitCode = result.exitCode;
}

module.exports = { analyzeRequest };
if (require.main === module) main().catch(error => {
  process.stdout.write(JSON.stringify({ error: error.message }) + "\n");
  process.exitCode = 2;
});
