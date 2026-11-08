const NAMESPACE = "mines-lab-companion";
const VERSION = 1;
const DETECT_REQUEST = "detect-game";
const DETECT_RESPONSE = "game-presence";
const allowedStatuses = new Set(["permission-required", "game-not-found", "game-detected", "error"]);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.namespace !== NAMESPACE || message.version !== VERSION ||
    message.type !== DETECT_REQUEST || typeof message.requestId !== "string" || message.requestId.length > 128) return;
  chrome.runtime.sendMessage({ type: "mines-lab:detect-game" }, (response) => {
    const status = response && allowedStatuses.has(response.status) ? response.status : "error";
    window.postMessage({ namespace: NAMESPACE, version: VERSION, type: DETECT_RESPONSE, requestId: message.requestId, status }, window.location.origin);
  });
});
