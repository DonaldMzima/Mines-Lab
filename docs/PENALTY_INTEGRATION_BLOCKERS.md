# Penalty evidence and integration status

Reviewed 8 November 2026. This document supersedes the earlier claim that Penalty is only planned.

## Implemented from supplied in-game evidence

Game ID v_1wingames:penalty and observed integration key vgsonewin2_penalty are retained. Supplied published RTP is 94%; Turbo scoring chance is 53.33%. Series conditional scoring chances are 53.33%, 53.33%, 46.67%, 46.67%, 33.33%, with observed displayed multipliers 1.81, 3.41, 7.30, 15.65 and 46.97.

Web and Telegram now support Turbo/Series configuration, Series step selection, Get Signal, scoring and cumulative reach probabilities, diagnostics, manual completed scored/saved records and history. Python independently calculates the same rounded-rule products. Get Signal states that a directional signal is unavailable.

Multiplying rounded scoring probabilities gives a rounded-rule approximation. Reach probability multiplied by the displayed multiplier remains a diagnostic, because full cash-out, gross/net and settlement rules have not been established. The published RTP does not override that missing evidence.

## Evidence still needed

1. An official versioned goal diagram, row/column bounds, coordinate orientation and reproducible request/response examples. Without this, drawing a specific clickable shooting grid would invent a layout.
2. Documented terminal-state codes, stable round IDs, the meaning/timing of outcome.catches and any goalkeeper/goal coordinate mapping. ms_id remains a message ID. Observed state 2 remains in-progress only.
3. Complete payout/cash-out rules, stake-return semantics, mode differences and rounding. The displayed Series numbers alone do not prove EV.
4. A documented permitted read-only source, its authentication mechanism, usage/retention permission, timestamp semantics, replay/rate limits and sanitized authentic completed fixtures.
5. For a directional recommendation, legitimate pre-shot observable features and a method fixed before independent evaluation rounds, with baselines, sample sizes and uncertainty.

The existing observation parser remains read-only and does not manufacture terminal outcomes. The new canonical manual result schema requires explicit mode, step and scored:boolean, roundId and completedAt; it is user-provided evidence, not a decoding of catches. Coordinates and goalkeeper positions are neither inferred nor displayed as established.

No official shooting-grid or outcome API specification was established in the reviewed [operator material](https://1win.com/casino). No betting request, protected-session access or credential capture was performed.
