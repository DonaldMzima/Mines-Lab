const GAME_HOST_PERMISSION = "https://*.1win.com/*";
const APP_ORIGINS = new Set(["http://localhost:3000", "https://mines-lab-nine.vercel.app"]);

function sendResponse(sendResponse, response) {
  sendResponse(response);
}

function hasGamePermission() {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [GAME_HOST_PERMISSION] }, resolve);
  });
}

function queryGameTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: [GAME_HOST_PERMISSION] }, resolve);
  });
}

function probeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "mines-lab:probe-mines" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ gameDetected: false });
        return;
      }
      resolve(response && response.gameDetected === true ? { gameDetected: true } : { gameDetected: false });
    });
  });
}

async function detectGame() {
  if (!(await hasGamePermission())) return { status: "permission-required" };
  const tabs = await queryGameTabs();
  if (tabs.length === 0) return { status: "game-not-found" };
  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;
    if ((await probeTab(tab.id)).gameDetected) return { status: "game-detected" };
  }
  return { status: "game-not-found" };
}

function isAllowedAppSender(sender) {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== "string") return false;
  try {
    return APP_ORIGINS.has(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "mines-lab:detect-game") return;
  if (!isAllowedAppSender(sender)) {
    sendResponse({ status: "error" });
    return;
  }
  void detectGame()
    .then((result) => sendResponse(sendResponse, result))
    .catch(() => sendResponse(sendResponse, { status: "error" }));
  return true;
});
