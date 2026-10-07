# AGI Jobs Demo Observatory

The **[evidence reviewer](https://montrealai.github.io/AGIJobsv0/review/)** completes the local planning-to-review journey. It matches an admitted task and operator-supplied job/deployment identity with a completed receipt, verifies UTF-8 byte counts and SHA-256, displays untrusted artifacts as text, and exports unsigned criterion-by-criterion assessments. Files stay in the browser tab. See the [review guide](../docs/EVIDENCE_REVIEW.md) for formats and verification limits. `website/assets/review-model.mjs` owns the bounded integrity checks, and `review.js` invalidates results on input changes or stale asynchronous reads. Browser QA covers tampering, downloads, input races, accessibility and responsive layouts; model integration tests consume receipts produced by the actual adapter.

The public showcase at <https://montrealai.github.io/AGIJobsv0/> is built from the repository's tracked demo inventory. It provides a searchable collection, an individual page for every demo/support directory, original guides with Mermaid diagrams, and a clearly labeled browser-only lifecycle walkthrough.

The homepage spotlights **CULTURE Studio** and **AGI Jobs Platform at Kardashev II Scale** before the full collection. Header navigation and hero shortcuts lead to the featured experiences; each illustrated card explains three useful actions, links directly to the browser demo and its source-backed walkthrough, and states its preview or simulation scope. `scripts/pages/featured.mjs` owns this presentation. Its catalog references must resolve at build time. All existing discovery cards, guides and diagrams remain available.

Browser QA opens both featured demos using the keyboard, checks return navigation and mobile menu behavior, captures desktop/mobile spotlights, and verifies the launch links remain available without JavaScript. Layout checks cover 320, 390, 768, 900, 1024 and 1440 pixels alongside WCAG A/AA accessibility checks. Component screenshots hide fixed navigation only while capturing the image so the header does not obscure the tall mobile cards.

## Build and verify

Use the root `.nvmrc` toolchain and locked dependencies:

```bash
npm ci
npm run site:build
npm run site:test
npx playwright install --with-deps chromium
npm run site:qa
```

The static output is `build/pages/`. Browser screenshots, accessibility results and diagram checks are written to `reports/pages/`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already-installed Chromium executable. The browser test starts and stops its own loopback server, serves the real `/AGIJobsv0/` project prefix, and does not call external services.

The build uses the root lockfile's Marked, DOMPurify and JSDOM to render and sanitize documentation, and bundles the locked Mermaid runtime locally with esbuild. No CDN scripts, remote fonts, analytics, wallet connections or provider credentials are needed by the showcase. The browser simulation uses repository scenario names and committee settings; it omits actual escrow, timing, disputes and fees, and its downloadable receipt explicitly records simulation status and zero blockchain transactions.

## Content and preservation

- `scripts/demo/catalog.cjs` supplies all tracked directories and registered commands.
- `website/catalog-overrides.json` supplies short titles, themes and summaries. New directories with a guide require an explicit description; missing descriptions fail the build.
- Original directory names, sources, READMEs, runbooks and nested variants remain linked. The build does not rewrite their files.
- Diagram source is retained in an expandable block beside the rendered figure. The build manifest records counts and source hashes. Legacy unquoted label punctuation is adapted only for display; the original nodes, edges and source remain intact. Every diagram must parse and render successfully in Chromium before publishing, with a visible source fallback for unexpected runtime failures.
- Relative links to published guides are rewritten to stable local routes. Other tracked source links point to the exact build commit. Generated or unavailable targets are retained as text rather than published as broken local links.
- `catalog.json` records the source commit, all entries, guide routes and diagram inventory. No permanent green badge or production certification is inferred from catalog membership.

## GitHub Pages publishing

In the repository's **Settings → Pages**, the publishing source must be **GitHub Actions**. `.github/workflows/pages.yml` builds and checks pull requests without deploying them. A successful build on `main` publishes through GitHub's Pages artifact and OIDC deployment actions, then verifies the live manifest's exact source revision. Only the deployment job receives `pages: write` and `id-token: write`.

The workflow publishes only the generated `build/pages/` directory. It does not publish the repository root, dependency directories, environment files or local reports. Its preview artifact and browser evidence make every candidate reviewable before deployment.

The default base path is `/AGIJobsv0/`. `SITE_BASE_PATH=/ npm run site:build` supports a root-path deployment for development; the local test harness reads the prefix from the generated manifest.

## Individual demo experiences

Every catalog entry has a source-grounded guided tour in `demo-experiences.json`.
Each record names the concrete question, purpose, three source-backed steps,
selected execution path, expected output, suggested experiment and related
implementation. Design guides and compatibility packages explicitly identify their
scope. A missing entry or untracked source fails the website build.

The read-only source inspector uses exact repository files. Visitors can switch
between walkthrough sources, search JSON fields, read full source text and
download byte-identical copies with SHA-256 provenance. It never evaluates code,
sends transactions, recalculates economic claims or represents a stored example
as a fresh execution. JSON field paths use JSON Pointer escaping.

The document library includes **every tracked Markdown document and standalone
Mermaid file under `demo/`**, including nested variants, operator guides and
recorded reports. Original guide routes remain stable. Each individual experience
also shows a preserved architecture diagram where one is available; longer
libraries and test-source lists remain browsable without JavaScript.

When updating an experience:

1. Read the selected entry point, configuration and output-writing code together.
2. Run its documented command in the correct isolated environment. Explain
   whether the path is a complete demo, a component rehearsal, a preflight,
   compilation, a simulation or a design reading path.
3. Keep source references tracked and commands specific. Distinguish historical
   fixtures, synthetic targets, model heuristics and actual transaction evidence.
4. Run the website tests and browser QA. QA exercises all individual inspectors
   on mobile, downloads an exact source, checks field search and keyboard-accessible
   content, and parses and renders every published diagram.

See [the recorded validation scope](validation-2026-10-04.md) for the local checks
performed while introducing these experiences.

## Complete Kardashev II command decks

The Kardashev II experience links to all three complete command decks: the base
model, Stellar Civilization Lattice, and K2 Stellar. They are published under
`experiments/kardashev-ii/`, together with their standalone `output/` exports.
The builder copies tracked HTML, UI assets, ledgers and local Mermaid bundles;
`catalog.json` lists the six `dashboardRoutes`. Source files and diagrams remain
available alongside the guided tour.

These are dated, deterministic model snapshots. They do not connect wallets,
call providers, authenticate signatures or commission infrastructure. The demo's
run manifest records exact input hashes. CI checks all three generators, rejects
failed model readiness even after artifact regeneration, and tests every command
deck for accessibility, responsive layout, diagram rendering and HTML injection.
Pages QA separately opens all six published copies under the project base path.
See the [Kardashev validation record](validation-kardashev-2026-10-04.md) for
executed checks, preservation evidence and model limitations.

The Pages build also compiles the actual CULTURE Studio in explicit offline preview mode. Before `npm run site:build`, install its independent workspace with `cd demo/CULTURE-v0 && corepack pnpm install --frozen-lockfile`. Return to the repository root for site commands. Run `node scripts/pages/culture-qa.mjs` after the general website checks to verify the complete Studio journey, evidence exports, accessibility, and mobile layouts.

## Machine labor entry point

The homepage now explains the buyer, worker and independent-reviewer routes, connecting useful digital deliverables to the longer-term scientific and infrastructure vision. The full demo collection and original flowcharts remain intact.

`work/` provides a local planner for ten useful job categories. It exports an unfunded proposal, a task compatible with the existing `ComputerWorkTask` parser, and an operator handoff. No source is fetched and no provider or wallet is connected. Every edit invalidates the previous draft. `scripts/pages/work.mjs` owns the accessible presentation; `website/assets/work-model.mjs` supplies categories and validation, and `work.js` handles the browser interaction. Browser QA covers all categories, exact downloads, invalid input, stale drafts, text injection, keyboard use, five widths and the no-JavaScript fallback. `catalog.json` records the route as `workRoute`.

The stable [readiness index](../docs/production/readiness.md), [computer-work guide](../docs/computer-work.md) and [delivery workflow](../docs/MACHINE_LABOR.md) are published as local, source-bound guides. The dated records remain available at their original routes.

The planner's **Save editable draft** and **Open saved editable draft** controls preserve unfinished work locally, including exact entered text. Reloading still clears the form; there is no browser storage or upload. The versioned draft format accepts only the known form fields, with bounded file and field sizes. Opening a draft requires a new review and build before task downloads become available; execution authority and evidence are never imported. Task and proposal exports remain distinct from editable drafts. Custom objectives survive category changes; the explicit suggested-objective button replaces the text only when requested.

## Alpha Mark capital-to-work lab

`experiments/alpha-agi-mark/` connects the original capital-market demo to a useful-work planning journey. Its model compares daily worker slots, independently reviewable slots and exact six-decimal USDC reward-budget slots. The smallest count is a static candidate-capacity bound, not a success or revenue forecast. Provider charges, reviewer fees, rework, disputes and demand are explicitly excluded.

The lab reuses `work-model.mjs` for source validation and compatible task/proposal exports. Preparation acknowledgments enable the operator handoff; every execution, spending and settlement authorization remains false. An edit clears all previous results and disables downloads. No inputs persist across reloads and no source, provider or wallet connection occurs. The native/ERC20 Alpha Mark market remains a separate contract demonstration, linked with its original documentation and diagrams.

`alpha-mark-model.mjs` owns the bounded arithmetic, `alpha-mark.js` owns browser state, and `scripts/pages/alpha-mark.mjs` renders the experience. The homepage and guided tour both link directly to it. Regression checks cover money precision, all capacity bottlenecks, incomplete prerequisites, source boundaries, exact downloads and stale results. Browser QA additionally checks keyboard interaction, text injection, five viewport widths, WCAG A/AA and the readable no-JavaScript path.

```bash
node --test test/pages/alpha-mark.test.mjs
node scripts/pages/alpha-mark-browser-qa.mjs
```

Run the site build first. The complete `site:qa` command also includes the Alpha Mark checks.

## Phase 6 multi-domain expansion lab

`experiments/phase6/` publishes the complete Phase 6 configuration dashboard, its original systems map, a separate configured-domain map and an interactive dispatch-wave planner. All dependencies are bundled locally from the lockfile. The original views for credentials, bridge plans, infrastructure, domain controls and unsigned example calldata remain available. Their metrics are explicitly illustrative; no live provider, identity service, oracle or chain is contacted.

The capacity model reserves one job per worker for one wave, bounded by the configured concurrency limit, shared reviewer minutes and exact six-decimal USDC reward arithmetic. Allocation cycles through configuration order one slot at a time; paused, inactive, experimental, sunset and unconfigured-capacity domains receive no slots. It is a static planning bound, excludes existing in-flight jobs and operating costs, and is not a live priority scheduler or throughput forecast. Every edit or configuration reload invalidates previous exports. Draft inputs remain in memory and disappear on reload.

Five synthetic arithmetic tasks make the handoff reproducible without private data. A task download requires a candidate slot and three operator preparation commitments, then reuses the canonical work-proposal and task schemas. Commitments grant no authority. Actual buyer work belongs in the complete work planner; provider output belongs in the evidence reviewer. OpenClaw gateway dispatch and operator-led ChatGPT Work remain distinct commissioned routes.

`ui/preview-model.mjs` keeps calldata and configuration metrics independently testable. Regression tests compare its encoded calls and telemetry coverage against the actual CLI blueprint for full, minimal, missing-field, experimental, sunset and manual-cadence configurations. Missing telemetry cannot pass a configured floor, absent optional configuration produces no setter, and sunset domains produce only a removal example.

The standalone source is `demo/Phase-6-Scaling-Multi-Domain-Expansion/index.html` with its `ui/` modules. Build the local-only dependencies before serving it:

```bash
node scripts/pages/phase6-build.mjs
python -m http.server 8080 --bind 127.0.0.1 --directory build/phase6
# Open http://127.0.0.1:8080
node --test test/pages/phase6.test.mjs
# After npm run site:build:
node scripts/pages/phase6-browser-qa.mjs
```

The normal website build and QA include this route. Browser checks cover capacity constraints, pauses, exact downloads, operator gating, invalid/stale inputs, configuration reload, keyboard use, responsive layouts, accessibility and both preserved diagram sources. The no-JavaScript page retains the workflow, original map source and source links.
