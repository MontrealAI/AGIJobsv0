# AGI Jobs Demo Observatory

The public showcase at <https://montrealai.github.io/AGIJobsv0/> is built from the repository's tracked demo inventory. It provides a searchable collection, an individual page for every demo/support directory, original guides with Mermaid diagrams, and a clearly labeled browser-only lifecycle walkthrough.

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
