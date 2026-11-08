# Penalty integration status

Reviewed 8 November 2026.

## Decision

Penalty remains **planned**. Mines Lab does not implement probability, payout,
history, prediction, or connection features for it because the facts required
to calculate them have not been verified.

## What was checked

Public 1win pages found during this review describe the general casino service
and Betwave sports-prediction rules. They do not document a Penalty game
provider, identifier, direction count, goalkeeper/outcome contract, payout
schedule, cash-out mechanics, game modes, completed-result format, or a
read-only data API.

## Missing evidence

Before a Penalty workspace can calculate a score probability, consecutive-shot
probability, multiplier probability, expected value, or cash-out comparison,
Mines Lab needs provider-approved documentation for all of the following:

1. The exact Penalty game provider and stable game identifier.
2. The legal shooting directions and the goalkeeper's possible responses.
3. The outcome distribution and whether it changes by stage or mode.
4. The multiplier and cash-out schedule, including any house edge.
5. Demo and real-money mode differences.
6. A permitted completed-round export or API, with round IDs, timestamps,
   selected direction, outcome, multiplier, and terminal-state semantics.
7. Permission to retain and relay those results to Mines Lab and Telegram.

## Current behavior

The game selector intentionally presents Penalty as planned and supplies no
connection, prediction, or calculation controls. This avoids treating a
generic football penalty assumption as a fact about a specific 1win product.

## Implementation path after authorization

Once the evidence above is available, add a game-specific parser that rejects
unknown directions, mismatched payout stages, duplicate round IDs, and
ambiguous terminal outcomes. Add pure probability functions only from the
documented transition and payout rules; retain Demo and Real records separately.
No browser traffic inspection, credential collection, betting, tile/action
automation, or provider endpoint guessing is part of this path.
