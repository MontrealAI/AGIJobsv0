# HGM validation record · 2026-10-06

The update completes the research-console and bounded benchmark-analysis workflow. It does not certify a live machine-labor deployment.

## Corrected behavior

- Apply admission-count and queued-cost bounds to the preserved asynchronous simulator; propagate task failures and validate its action limit.
- Reserve pending evaluation and expansion costs before scheduling; enforce the budget on completed plus queued work.
- Apply the configured budget and owner limits to the greedy baseline as well as HGM.
- Include pending expansions in the agent ceiling; preserve unfinished tasks and cost reservations at the horizon.
- Ignore undefined initial ratios in thermostat feedback. Reject invalid types, non-finite values, unknown settings and inconsistent ranges before producing reports.
- Export explicit simulation/approval boundaries and JSON-safe undefined ratios; save the resolved configuration for reproduction.
- Replace the broken telemetry URL with built recordings and explicit local file import. Reject malformed imports and use text rendering for record-derived content.
- Preserve the original evolution diagram, systems map and Grand Operator Console. Bundle dependencies locally and retain a readable fallback if diagram rendering fails.

## Repeatable verification

`tests/` covers the original engine/configuration/lineage/owner behavior plus queued-budget regression cases, constrained concurrent work, pending agent ceilings, horizon reservations, no-work owner pause, invalid configuration and undefined-ratio feedback.

`web/tests/model.test.mjs` checks the generated reference/constrained/paused records, exact arithmetic and source binding, forged approvals, cross-source candidates, invalid imports, the synthetic task contract, all ten work-order categories and market percentage arithmetic.

`web/tests/browser-qa.mjs` checks desktop/mobile widths (320, 390, 768, 1024 and 1440), accessibility, local diagrams, scenario changes, paused ratios, analysis download, accepted and rejected candidate checks, work-order download, invalid import state clearing, market inputs and the preserved console. It fails on page errors and external asset requests. Evidence is saved under `reports/pages/hgm/` and uploaded by CI.

The HGM workflow runs all these checks plus the shared-worker task inspector. The Pages workflow verifies the integrated public route. Repository-wide gates remain required before merge.

## What remains deployment-specific

No real OpenClaw or Work provider session, unrelated reviewer acceptance, buyer use, settlement, 72-hour host commissioning or proof of universal task competence is established by this change. The connected adapter is an available, fail-closed path that needs protected configuration and exact operator admission. Imported records and unsigned worker receipts do not authenticate their own provenance.

Simulated strategy performance is sensitive to seeds, different action rates, input distributions, cost assumptions and pending work. The original ROI field is a gross multiple. The $40 trillion opportunity is a user-supplied planning scenario; the page neither sources it as a measured fact nor treats it as revenue.
