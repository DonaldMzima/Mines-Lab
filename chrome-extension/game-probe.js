const MINES_GAME_ID = "v_1wingames:mines";

function hasApprovedMinesMarker() {
  const escapedId = MINES_GAME_ID.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  return Boolean(document.querySelector(
    `[data-game-id="${MINES_GAME_ID}"], [data-game="${MINES_GAME_ID}"], [data-integration-key="vgsonewin2_mines"], meta[name="game-id"][content="${MINES_GAME_ID}"], meta[property="game:id"][content="${MINES_GAME_ID}"], [id="${escapedId}"]`,
  ));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "mines-lab:probe-mines") return;
  // Return only a boolean. This intentionally avoids reading or exporting account/game data.
  sendResponse({ gameDetected: hasApprovedMinesMarker() });
});
