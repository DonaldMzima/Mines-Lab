const NAMESPACE = "mines-lab-companion";
const VERSION = 1;
const DETECT_REQUEST = "detect-game";
const DETECT_RESPONSE = "game-presence";
const allowedStatuses = new Set(["permission-required", "game-not-found", "game-detected", "error"]);

function respond(requestId, status) {
  window.postMessage({ namespace: NAMESPACE, version: VERSION, type: DETECT_RESPONSE, requestId, status }, window.location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.namespace !== NAMESPACE || message.version !== VERSION ||
    message.type !== DETECT_REQUEST || typeof message.requestId !== "string" || message.requestId.length > 128) return;
  // This script must be injected by the MV3 manifest into the isolated world.
  // If a page or stale extension copy executes it elsewhere, never call an
  // extension API or leak an exception into the page console.
  if (!globalThis.chrome?.runtime?.sendMessage) {
    respond(message.requestId, "error");
    return;
  }
  globalThis.chrome.runtime.sendMessage({ type: "mines-lab:detect-game" }, (response) => {
    if (globalThis.chrome.runtime.lastError) {
      respond(message.requestId, "error");
      return;
    }
    const status = response && allowedStatuses.has(response.status) ? response.status : "error";
    respond(message.requestId, status);
  });
});
