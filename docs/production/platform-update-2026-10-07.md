# Platform and website update — 2026-10-07

This update adds a practical machine-labor entry point to the complete demo observatory. All existing demo directories, command decks, guides and original Mermaid blocks remain available. Hypernova PR #3904 was merged after all 48 workflow runs on its exact head succeeded and both review findings were resolved.

## Changes

- A homepage route for buyers, workers and independent reviewers, plus a concrete progression from useful digital work to coordinated scientific and infrastructure research.
- A browser-local planner for ten work categories. It exports exact proposals, tasks in the existing computer-work schema, and operator handoffs. Draft edits invalidate prior downloads. No worker, transaction, source fetch or external effect is triggered by the planner.
- Editable drafts can be saved and reopened locally, including unfinished work. Import accepts only bounded planner fields, invalidates generated downloads, and never imports execution authority. Switching categories preserves a custom objective; an explicit reset restores the suggested objective.
- Exact six-decimal proposal arithmetic, explicit USDC/AGIALPHA deployment distinction, source URL validation, input/output limits and independent content acceptance criteria.
- A stable readiness index and published computer-work guide. OpenClaw's native Codex readiness configuration is documented against current official sources; ChatGPT Work remains an operator-led route.
- The $40T/year opportunity is explicitly a user-supplied planning assumption. No universal automation capability, realized stellar infrastructure, buyer acceptance or production certification is asserted.

## Dependency refresh

The fresh root production audit initially reported **1 critical, 8 high, 36 moderate and 22 low** affected packages. Targeted compatible patch updates move `proxy-addr` from 2.0.7 to 2.0.8 and `source-map-js` from 1.2.1 to 1.2.2 across affected npm locks and the CULTURE pnpm workspace. The root audit after the npm refresh reports **0 critical, 7 high, 36 moderate and 22 low**.

All 20 nested npm production lockfiles report zero critical and zero high findings. The refreshed CULTURE pnpm production workspace reports zero findings at every severity. One-Box retains two low findings and Validator Constellation v2 retains five moderate findings. The [machine-readable audit](dependency-audit-2026-10-07.json) binds every result to its exact lockfile SHA-256.

The remaining high findings are the previously documented `braces` and `node-forge` dependency chains, including legacy Web3.Storage dependencies. They are not waived or hidden. Counts reflect registry advisories at the time of execution and may change. See the [dependency review](dependency-review-2026-10-04.md) for migration and compatibility requirements.

Primary advisories: [proxy-addr IP trust validation](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) and [source-map-js indexed map validation](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Verification results

- Complete site build: 76 demo pages, 337 guides and 265 preserved diagrams.
- All 22 site tests pass, including actual adapter-schema compatibility, the two security regressions and bounded editable-draft round trips.
- Full browser verification passes with 31 check groups, zero diagram failures and zero automated accessibility violations across the tested widths.
- Gateway and orchestrator builds pass; all 47 computer-work boundary tests and 12 browser/provider/runtime tests pass.
- Documentation links verify across 288 Markdown files. The checker now decodes percent-encoded filenames correctly, and a missing incident-response link is corrected. Pages CI runs the documentation check before publishing.
- Locked dependency installation and the Node/npm preflight pass.

## Reproduce validation

Use the pinned Node/npm toolchain in [START_HERE](../START_HERE.md). Install the independent CULTURE workspace as described in the [website guide](../../website/README.md).

```bash
npm ci
npm run ci:preflight
npm run demos -- --check
npm run site:build
npm run site:test
npm run site:qa
npm run build:gateway
npm run build:orchestrator
node --test apps/orchestrator/dist/apps/orchestrator/__tests__/computerWork.test.js
node --test demo/One-Box/computer-work/test.cjs
npm run compile
npm test
npm run release:check-size
npm audit --package-lock-only --omit=dev --json
```

The audit is expected to report the unresolved findings rather than claim a clean production tree. Website tests include actual adapter-schema compatibility for all ten work categories, exact proposal units, invalid inputs and downloadable bytes. Browser QA checks stale-draft invalidation, input injection, keyboard navigation, responsive layouts, accessibility and the no-JavaScript path alongside the full preserved collection.

Local and CI validation establish only their measured behavior. Live worker commissioning, independent security review, authorized release trust, buyer use and real settlement remain deployment-specific gates in the [readiness index](readiness.md).

## Evidence-review follow-up

The [evidence reviewer](../EVIDENCE_REVIEW.md) adds a complete local delivery-inspection route at `/review/`, linked from the homepage's reviewer route and the job planner. It compares the independently supplied admitted task and expected job/deployment with the persistent worker receipt, recomputes each artifact's SHA-256 and UTF-8 byte count, and records the exact input-file fingerprints. Artifacts are displayed as text; downloads preserve their content and append `.txt`. Criterion-by-criterion findings export as an unsigned assessment. No upload, worker dispatch, provider authentication, buyer acceptance or settlement is inferred.

The gateway previously accepted malformed UTF-8 by replacing invalid bytes. This was reproduced against the prior source with a local HTTP response. Transport now rejects malformed encoding; task/evidence strings reject unpaired Unicode surrogates, and the adapter enforces the 128,000-byte artifact limit in UTF-8 bytes. Rejected worker output retains the dispatch replay barrier. The exact multibyte boundary remains accepted.

Local checks on the follow-up pass: 583 contract tests, 63 gateway/orchestrator/provider/runtime checks, 28 website/model tests, both TypeScript service builds, the contract-size gate, toolchain/lock preflight and documentation links across 289 Markdown files. The site builds 76 demo pages, 338 guides and all 265 original diagrams. The evidence tests consume actual adapter-generated local HTTP receipts and cover tampering, substituted tasks, replay, invalid encodings, unsigned provenance and acceptance requirements. Browser checks cover the real file/download journey, text injection, edits during asynchronous reads, five viewport widths, accessibility and the no-JavaScript path; their results and screenshots are emitted to the Pages CI evidence artifact.

The full browser verification passes **34 check groups**, with **zero diagram failures** and **zero automated accessibility violations on the tested surfaces**. The separate CULTURE browser journey also passes its lifecycle, export, responsive-layout and accessibility checks.

The current root dependency audit remains **0 critical, 7 high, 36 moderate and 22 low**; this change does not suppress or remediate those existing findings. Read-only GitHub inspection on 2026-10-07 found `main` at `16cd23de77670b5fe5e75246654e59ccd6a28fb5`, all 17 associated workflows successful, `protected: false`, and no active repository rulesets returned. Documentation now distinguishes intended CI checks from enforced merge protection. Branch rules require separate administrative configuration; no repository security policy is weakened by this update.

The prior validation counts above describe the earlier update. Follow-up results establish their stated local behavior, not certification of all historical demo claims or readiness for unattended mainnet operation.
