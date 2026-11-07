# Authorized game-data feasibility

Research date: 7 November 2026; public-source searches and official page retrievals were repeated for the live-tracking and simplified Connect Game follow-ups. This is a public-documentation investigation, not a provider authorization or certification.

## Result

No suitable documented, authorized read-only source for this application's 1win Mines round history was established. No public Mines history endpoint, completed-round event feed, WebSocket subscription contract, permission grant, authentication flow, or rate-limit specification was found in the official sources reviewed. This is an evidence limitation; it does not prove that a private partner offering does not exist.

The default application continues with local user-provided data while live access is unresolved. A successful `101 Switching Protocols` response establishes a WebSocket upgrade only. It establishes neither a gameplay message protocol nor permission for a third-party application to consume it.

The simplified Connect Game investigation also reviewed a Chrome browser companion as the second-choice integration route. No provider permission or usable permitted round-data surface was established, so no extension or interception is implemented. User-granted `activeTab` access is separate from provider authorization, and Chrome's `webRequest` does not provide established WebSocket messages. See [browser companion feasibility](./BROWSER_COMPANION_FEASIBILITY.md) for primary Chrome references and the narrow architecture that could be used if permission and a schema are established.

`src/lib/provider-config.ts` records only the supplied provider identity, game ID, and integration key by default. Its `unconfigured` branch has no transport, endpoint, authentication method, mode, or capability flags: unknown capabilities are not represented as false facts. The strict `documented` branch validates transport and supporting documentation references but does not grant authorization, implement a connector, or establish that supplied references are official. Credentials are not configuration fields, and URLs with embedded credentials or query parameters are rejected.

## Sources and search scope

- [1win casino](https://1win.com/casino): the search-indexed official FAQ describes 1win Games as proprietary titles and says demo availability varies by game and provider. Direct page retrieval returned no readable text in this research environment. This material supplies no Mines data-access contract or demo/real-money protocol equivalence.
- [1win Partners](https://1win-partners.com/): an affiliate marketing program. The public page advertises affiliate statistics and describes original games as exclusive to 1win users. It does not document player-specific Mines history access. Affiliate reporting, game distribution, wallet callbacks, and a player's completed-round outcome feed are different capabilities.
- Public searches for Mines API/history/WebSocket documentation on `1win.com`, `1win.io`, and `1win-partners.com`, plus the supplied identifiers `v_1wingames:mines` and `vgsonewin2_mines`, did not establish an official integration specification.
- Follow-up searches for official round lifecycle events, API history, and fairness documentation again surfaced casino/forum or affiliate marketing material, without an implementable read-only Mines protocol. Forum discussion of playing Mines is not API documentation.
- The Connect Game follow-up repeated official-domain searches for Mines APIs, game history, browser extensions, and applicable automation terms. It did not establish this application's access grant or a Mines companion contract. Rules found for an unrelated 1win product are not applied to Mines.

Searches also surfaced third-party articles, unofficial predictor offers, independent sports odds services, scripts, and unrelated game-provider APIs. None is used as evidence of an authorized Mines integration. No provider login, session credential capture, private endpoint probing, account creation, or gameplay request was performed.

## What remains unestablished

- An official game-history or completed-round endpoint and whether it includes all mine positions.
- A read-only event subscription, transport schema, stable round identifier, replay cursor, ordering guarantees, or duplicate behavior.
- Which fairness fields are available before play, when a server seed becomes revealable, and the exact board-generation algorithm.
- Whether demo and real-money rounds share schemas, identifiers, terminal-state semantics, and fairness behavior.
- The supported authorization mechanism, permitted usage, data retention/export rights, commercial-use rights, request limits, and reconnection rules.
- Any specific applicable contractual restriction on this application. No terms are inferred from third-party commentary.
- Permission for a browser companion to observe and transfer Mines results, and the exact approved page/frame/data surface needed for such a companion.

The supplied browser observations are examples of response shapes, not a public API specification. `ms_id` must not be promoted to a stable round identifier without confirmation. Observed `state: 0` and `state: 1` must not be treated as a complete universal state enumeration.

## Prediction feasibility

The supplied observations show complete mine positions only after the observed rounds ended. They do not demonstrate access to hidden positions before a move or any prospective predictive advantage.

- **Pre-round:** board size and chosen mine count provide a probability model. Client-controlled seed/configuration values alone do not establish knowledge of hidden positions. The precise timing of public fairness fields was not established by official documentation.
- **During-round:** selected positions and their revealed outcomes may update conditional probabilities. They do not, by themselves, identify which remaining hidden position contains a mine.
- **Post-round:** the supplied completed-response examples reveal `outcome.mines` and fairness metadata. These support retrospective evaluation when the round identity and completion context are supplied; they are not advance predictions.

A server-seed hash is not the secret server seed. NIST describes approved hash functions' preimage resistance: recovering an input from its digest is intended to be computationally infeasible. This assumes an appropriate hash and a sufficiently unpredictable secret; it is not a security audit of this provider. [NIST Hash Functions](https://csrc.nist.gov/projects/hash-functions).

HMAC requires a secret key. The label `hmac_sha256:1`, client seed, nonce, cursor, and byte count do not supply the secret key or fully specify a provider's serialization, byte extraction, shuffle, or tile mapping. Implementing a fairness verifier requires provider documentation and reproducible test vectors, including legitimately revealed seed material. [RFC 2104](https://www.rfc-editor.org/info/rfc2104/).

`src/lib/fairness.ts` supplies an optional provider/game/algorithm-specific verifier registry and a post-round verification interface. No algorithm implementation is registered. `FairnessDetails` exposes the imported metadata and retained provider-state code, labels verification unavailable, and does not offer an inactive verification button. An imported hash or seed reference alone never marks a round verified. A future verifier receives a legitimately disclosed post-round seed for one operation; this module does not persist that seed.

Under the independent uniform-placement model, a fixed set of `k` distinct suggestions survives `m` mines with probability `C(25-m,k) / C(25,k)`. No demonstrated advantage beyond that random baseline was established. Actual provider independence and uniformity were not independently verified.

Any future model must be fixed before its evaluation rounds, use previously unseen outcomes, preserve original suggestions, record round identity before outcomes where possible, report sample size and uncertainty, and separate retrospective user-confirmed associations from prospectively recorded ones. Selective manual uploads or selective evaluations are not an unbiased prospective experiment.

## Smallest next milestone

Obtain the provider's written confirmation of an authorized read-only completed-round export/feed and its official schema. Request one sanitized terminal-round fixture plus its stable round identifier, completion/result semantics, timestamp, fairness documentation, permitted scope, and rate limits. Use those facts to implement one connector against the existing import pipeline. Do not request user gambling passwords or reuse browser session cookies/tokens.

For active-round tracking, additionally request documented start/update events, ordering/replay rules, supported subscriptions, and the meaning of selected/revealed tiles. If the provider authorizes completed-round history only, synchronize completions without fabricating round-start or progress events. Demo-mode support cannot be inferred from the existence of a demo game; confirm its API scope separately. No financial amount should be identified as real money without verified mode and currency.
