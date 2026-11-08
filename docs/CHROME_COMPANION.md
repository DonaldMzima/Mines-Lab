# Chrome game-presence companion

The companion is a local Manifest V3 extension that can report only whether an
explicitly permitted 1win tab contains an approved Mines DOM marker. It is not
a 1win game-data integration.

## What it does

- Lets Mines Lab ask whether an open `*.1win.com` tab exposes the observed
  `v_1wingames:mines` or `vgsonewin2_mines` DOM marker.
- Reports one of: permission required, game not found, game detected, or error.
- Rechecks while the site shows **Game detected**, so closing or navigating away
  from the tab returns the site to a non-detected status.

## What it does not do

- It does not read passwords, cookies, authentication headers, localStorage,
  account balances, network traffic, WebSocket messages, or game outcomes.
- It does not place bets, select tiles, or cash out.
- It does not send any data to Telegram or establish a live round-data feed.
- A detected tab is not evidence of an active round or a verified completed
  result.

## Local installation

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Select this project's `chrome-extension` folder.
5. Open the extension popup and select **Grant 1win tab access**. Chrome will
   display the origin permission request.
6. Open a 1win Mines page in your own browser session.
7. Open Mines Lab at `http://localhost:3000` and select **Connect Game**.

For the deployed app, the manifest currently allows
`https://mines-lab-nine.vercel.app`. A different deployment origin requires a
deliberate manifest update and extension reload; it is not opened with a broad
website wildcard.

## Status meanings

- **Extension not installed**: Mines Lab did not receive a reply from its own
  companion content script.
- **Permission required**: the extension is installed but 1win tab permission
  has not been explicitly granted in the extension popup.
- **Game not found**: no allowed 1win tab supplied an approved Mines DOM marker.
- **Game detected**: only the permitted marker was found. No round data is
  available.
- **Disconnected**: the site stopped its local presence checks.

## Provider-data boundary

No authorized 1win read-only round-data API or browser export surface has been
established. The extension intentionally does not connect to the existing
`GameDataAdapter` until that permission, exact data surface, and event contract
are available. Telegram runs server-side and cannot observe a user's local
extension without a separately authorized server-side transfer design.
