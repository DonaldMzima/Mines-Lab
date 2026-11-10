# Browser companion feasibility

Reviewed 7 November 2026 for the simplified Connect Game workflow.

## Decision

No browser companion is implemented. The public-source investigation has not established the provider's permission for this collection method or a reliable permitted Mines data surface containing genuine round IDs and completed outcomes. This is an unresolved requirement, not a claim that the provider has prohibited every companion or that no private agreement exists.

The official API/feed remains the preferred route. The provider search findings and exact API requirements are recorded in [REAL_DATA_INVESTIGATION.md](./REAL_DATA_INVESTIGATION.md). Browser permissions alone do not resolve those requirements.

## Browser permission is separate from provider permission

Chrome's `activeTab` permission grants temporary host access after the user invokes an extension, such as by clicking its toolbar action. Access is tied to the active tab and its main-frame origin, and is revoked when that tab closes or navigates to another origin. `scripting` is additionally required to inject an extension content script. [Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

A click on Connect Game in a regular The Winning Edge web page does not, by itself, grant `activeTab` access to a different game tab. A future companion using this permission would need an explicit extension action on the chosen game tab during setup, and renewed action when access is revoked. That is a browser access boundary, not a provider data-use permission grant.

No applicable provider authorization or complete restriction on this exact read-only companion was verified from the official material reviewed. The official casino page did not return readable text to direct retrieval; the accessible partner site describes affiliate marketing. Rules for unrelated products, third-party blogs, and Chrome API availability cannot establish permission to collect Mines data. No private endpoint, authenticated page, browser credential, or game session was accessed during research.

## What the extension APIs actually provide

Content scripts can inspect a permitted document's DOM. By default they run in an isolated JavaScript world and cannot directly access page-script variables or existing WebSocket objects. A visible board is not evidence that stable round identity, terminal completion, or a full mine layout exists in accessible DOM. [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Injection defaults to the main frame. Targeting other frames requires the appropriate matching access; `allFrames` is not a general cross-origin permission grant. A game's cross-origin iframe must not be assumed readable just because the containing casino tab has been selected. The exact approved frame origin and permitted surface remain unknown here. [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

Content-script network requests remain subject to the page origin's same-origin rules. Extension-origin requests can have additional network privileges through host permissions, but those privileges do not establish provider authorization. Using a privileged worker as a proxy to evade provider CORS, authentication, or access restrictions is outside this project's scope. [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

The `webRequest` API can expose a permitted WebSocket upgrade handshake; it does not expose individual messages on an established WebSocket. Consequently, the observed HTTP `101` response cannot be turned into a completed-round feed merely by adding `webRequest`. No traffic interception, request rewriting, response-body capture, patched `fetch`/WebSocket globals, debugger attachment, or credential extraction is proposed. [Chrome webRequest API](https://developer.chrome.com/docs/extensions/reference/api/webRequest).

## Minimum evidence needed before implementation

1. Provider confirmation that this read-only collection and transfer to The Winning Edge is permitted, including demo mode, commercial use if relevant, and any retention/rate limits.
2. The exact supported casino/game origin and frame, plus an approved DOM export or documented page event surface. No rotating mirror domains or iframe hosts are guessed.
3. A sanitized example containing a stable round ID, known completion evidence, timestamp, mine count, and unique zero-based revealed mine positions. Start/update availability must be established separately.
4. Documented state semantics and enough fixtures to distinguish active, completed, repeated, malformed, and changed-page cases. `ms_id` is not assumed to be a round ID.
5. The deployed The Winning Edge origin and an approved pairing/data-transfer design. This origin is not yet used to invent an API endpoint or extension manifest.

## Narrow future architecture, conditional on permission

This is a design boundary for a future implementation, not a completed integration:

- Use Manifest V3 and a user-invoked extension action with `activeTab` and `scripting` if the approved data is on that origin. Avoid `<all_urls>`, cookie access, broad browsing access, `debugger`, and network interception permissions. If a separate approved frame genuinely requires additional host access, request only that specific optional origin and explain it before collection.
- Check the exact origin, selected tab/frame, and supported game before observing. Read only the provider-approved round fields; do not read login forms, account balances, cookies, tokens, local session stores, or unrelated page data. Stop if the source structure changes rather than infer outcomes from colors or timing.
- Pair the chosen game tab with The Winning Edge through a narrowly allowed app origin. `externally_connectable.matches` controls which web pages can initiate extension messaging; no broad wildcard is needed. [Chrome externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable).
- Have the app initiate the permitted messaging connection to the known extension ID. Validate sender origin, selected tab/frame, message version, and a fresh in-memory pairing nonce; allow only status/read-only data operations. Validate payloads on both sides, bound sizes/rates, and reject stale/replayed sequence IDs. Page/content-script messages remain untrusted; pairing is not proof that a DOM result is authentic. [Chrome messaging and security guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
- Feed only normalized events into the existing `GameDataAdapter`/round tracker. If the permitted surface provides completed results only, emit completions only. Never synthesize starts or hidden-safe positions. Stop observers and disconnect ports on user disconnect, tab close, origin change, or permission loss; require a fresh user grant when necessary.

This approach contains no gameplay command or bet placement. It does not promise access to private network payloads, cryptographic verification, or advance mine prediction.

## What works while access is unresolved

Connect Game can check actual application readiness and explain that live access is unavailable. User-entered completed results and the existing optional JSON import pipeline remain legitimate local workflows. Such records must remain labeled user-provided, with exact-ID or explicitly confirmed signal associations. A simplified manual fallback reduces entry effort; it does not eliminate the missing provider authorization or become automatic game synchronization.

The smallest next step is one provider-approved, sanitized completed-round export fixture and written confirmation of the permitted access method. Only then can the connector or companion be implemented against a known source.
