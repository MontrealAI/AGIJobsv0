# Hypernova validation record — 6 October 2026

This record describes engineering validation of the demo. It is not a certificate of live agent reliability, independent buyer acceptance, paid settlement or infrastructure delivery.

## Implemented and verified locally

- Node 22.23.3: **15 focused tests pass**, including the 60 work-type/region combinations, exact six-decimal USDC amounts, invalid inputs, cyclic/unknown dependencies, budget values beyond JavaScript’s safe integer range, byte-bound source review, rehashed incorrect calculations, altered exports, fabricated live claims, CLI failure codes, report preservation and rejection of nonlocal wrapper inputs.
- Chromium: all ten proposal downloads agree with the CLI contract; exact-source, evidence, Markdown and CSV exports work. Historical defects are reproduced. Mismatched source, incorrect rehashed answers, malformed/oversized imports and stale asynchronous file reads are rejected. Zero reviewer capacity and invalid input cannot leave stale capacity values visible.
- Browser layout and accessibility: no horizontal page overflow and no automated WCAG A/AA violations at **320, 390, 768, 1024 and 1440 pixels**. Keyboard skip navigation and focusable scrollable tables work. The source/runbook fallback is available without JavaScript. No external asset or provider requests were observed.
- The original README Mermaid block and historical plan are preserved byte-for-byte. All six regions, eleven jobs, dependencies, rewards, durations and participant roles remain intact.
- The corrected allocation ledger sums to **1,250,000,000** scenario units; job rewards remain **1,128,000,000**, leaving **122,000,000**. The explicit duration-after-dependencies model has a **286-day** critical path under unlimited parallel capacity.
- The preserved governance-kit command completed, compiling 267 Solidity files and generating reports and diagrams. Its owner-verification output reported **18 missing addresses and zero verified owner checks** in the unconfigured ephemeral environment. Successful artifact generation is therefore not proof of deployed ownership. Inspect a configured deployment and use strict verification before live operations.

## Required CI and publishing gates

The Hypernova workflow runs the focused tests, analysis export, deterministic kit and isolated local-chain rehearsal. Pages builds the full catalog, retains all original diagrams and runs browser QA against the published Hypernova assets under the GitHub project prefix. The PR must pass applicable checks before merge. The deployment workflow verifies the published source revision after merge.

Screenshots and machine-readable browser results are generated under `reports/pages/hypernova/` and uploaded by Pages CI. Fresh CLI runs create their own evidence directories; generated local reports are not committed as proof of live execution.

## Deployment-specific work still required

OpenClaw / ChatGPT Work handoffs are documented and source-bound, but this demo does not establish an authenticated live worker session. Commission the chosen runtime, real permissions, provider cost limits, stop/recovery behavior, independent reviewer identity, actual buyer use and authorized payment separately. The retained local-chain path uses mock assets and the shared three-job ASI Global mission, not the eleven physical infrastructure projects. Synthetic AGIALPHA accounting and proposed USDC reward ceilings are distinct from a commissioned settlement contract.

The $40T/year market ceiling and capacity controls are explicitly labeled assumptions. Do not treat illustrative throughput as revenue, profit, funded escrow or paid settlements.
