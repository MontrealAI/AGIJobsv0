# Validation and qualification record · 2026-10-06

## Scope

This revision completes the local Synthesis Foundry website, connects it to GitHub Pages, retains both original engines and their flowcharts, and adds an explicit admitted-worker path. It does not certify an unattended production fleet or report a live provider run, buyer acceptance or payment.

## Correctness changes

- The Python winner is selected from the last evaluated, recorded generation; the unreported extra breeding/evaluation step is removed.
- Policy objects reject non-finite numbers, boolean amounts, fractional counts, unsafe scenario identifiers and excessive bounded-search settings. Applied invalid CLI inputs return non-zero, and the wrapper propagates the exit code.
- A zero-percent slash stays zero. Negative/invalid stake mutations fail. Reward allocation remains finite at small supported temperatures and rejects non-zero pools without recipients.
- The simulated ledger requires an actual matching solver commitment, distinct single-vote validators and a positive quorum. Revealing a payload alone does not complete a job; result recommitment and modified reveals fail.
- Governance respects an explicitly zero delay, rejects negative delays and requires boolean pause state.
- TypeScript output-directory selection applies to the full dossier. Unknown CLI flags fail, invalid numerical examples/counts fail, and embedded report JSON is parseable and safe against script termination.
- Generated reports identify simulation credits and offline configuration inspection. They do not label local allocation as real payments or on-chain jobs.
- Original Python labels and TypeScript timeline periods are corrected so Mermaid diagrams render. Reports use the preserved local Mermaid asset; dynamic diagram content is escaped in HTML.
- The current website generates both research dashboards from source. It implements bounded local search, separate semantic checking, exact USDC planning, reviewer-capacity holds and an explicitly hypothetical opportunity calculator.
- The worker task is source-bound and starts unadmitted. The receipt checker binds expected job/deployment, task, artifact integrity and Python semantics while retaining external-review and settlement requirements.

## Reproducible checks

| Check | Coverage |
| --- | --- |
| Python demo tests | Existing functionality plus winner/telemetry identity, numeric/path rejection, CLI failure codes, stake/reward/vote and timelock regressions, HTML escaping |
| `npm run demo:program-synthesis:test` | All three candidates and counterexamples, fixed task/source binding, exact accounting, reviewer and rights admission, receipt mutation, complete TypeScript dossier and manifest integrity |
| Existing TypeScript demo suites | Original mission coverage, deterministic candidates, owner-command audit and report export |
| `npm run demo:program-synthesis:qa` | Actual Chromium interactions and downloads, Python checks of downloaded files, wrong-candidate rejection, held plans, responsive layouts, WCAG A/AA checks, local assets and original diagrams |
| `npm run site:build` / `site:test` | Integration into the complete observatory and catalog |
| PR workflows | Authoritative remote build, test, lint, security and Pages checks; inspect the PR for the exact commit's results |

Browser evidence is written under `reports/pages/program-synthesis/` and uploaded by CI. Reproduction commands are in the README. Dynamic timestamps remain in original reports; seeded inputs and decision/score behavior are reproducible, not every report byte.

## Remaining deployment work

Real-worker integration requires actual account/version/tool commissioning, an isolated host, independently enforced spend/action bounds, tested cancellation and reconciliation, separate reviewer/operator identities, actual buyer use and deployment-specific settlement authorization. The fixed synthetic acceptance suite is published and finite. It is neither a proof of universal correctness nor a substitute for independent evaluation of new work categories. Model/provider access was not required for this local qualification.
