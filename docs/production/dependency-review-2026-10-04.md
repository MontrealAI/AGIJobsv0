# Dependency remediation — 2026-10-04

This record accompanies the [computer-work readiness update](readiness-2026-10-04.md). It records reproducible dependency maintenance, not a security certification. Existing contracts, token rules, demos and diagram sources remain intact.

## Changes and measured results

The root production audit decreased from **3 critical / 40 high** to **0 critical / 7 high** affected packages. The remaining root counts are 35 moderate and 20 low. All **20 nested npm production lockfiles** report zero critical and zero high findings; Validator Constellation v2 retains five moderate findings. The CULTURE pnpm production workspace reports **zero findings at every severity** after its separate override and lockfile refresh. Counts come from the registry audit service and can change as advisories are published. npm counts affected packages, whereas pnpm's report uses advisory findings; do not add the two together.

- Regenerated compatible npm lockfile resolutions with the pinned Node 22.23.3 / npm 10.8.2 toolchain.
- Replaced vulnerable forced resolutions for `tar`, `protobufjs`, XML parsing, HTTP/multipart handling, WebSocket transport, archive helpers and stylesheet processing. Major-version overrides require the compatibility checks below; they are not treated as harmless metadata edits.
- Updated the Vite/Vitest toolchains and matching coverage packages together, retaining the applications' framework generation.
- Upgraded both CULTURE indexers to Fastify 5, matching CORS/rate-limit plugins and Apollo Server 5. The source API remains compatible; database schema and migration history are preserved.
- Preserved Osaka's actual 16,777,216 transaction gas cap in the large-validator-pool regressions. Explicit gas limits prevent an inflated estimate from rejecting transactions that execute within the cap. The 500-validator pool and reservoir sampling cases still execute fully; no hardfork or gas-limit protection is disabled.

## Unresolved release blockers

| Dependency family | Current limitation | Required resolution |
| --- | --- | --- |
| `braces` 3.0.3 | High-severity advisory GHSA-vfj7-8cjw-p6xm has no patched release available at review time. The root production tree also reports its `chokidar`, `hardhat` and `mocha` dependents. | Reassess the upstream fix and actual reachable paths; validate a supported migration before a production release. |
| `node-forge` 1.4.0 | High-severity advisory GHSA-86w9-cpqp-85rv has no patched release available at review time. `libp2p-crypto` and `web3.storage` remain affected dependents. | Migrate the legacy storage dependency with provider-specific integration and compatibility evidence. |
| Legacy Web3.Storage publishing | The imported `web3.storage` client uses the legacy API retired in January 2024. A lockfile update cannot restore that external service. | Commission a currently supported upload/pinning provider, verify returned CIDs and durable retrieval, and test the complete signing/ENS publication path. Existing optional publishing routes are retained, not represented as commissioned. |

The legacy publishing entry points are `scripts/onebox-static/release.mjs`, `apps/onebox/scripts/publish.mjs` and `apps/onebox-static/scripts/publish.mjs`. Their historical provider/token instructions do **not** establish a working production account. The latter two offer `--skip-web3` for the separate existing publication path; that flag does not itself prove pinning durability or authorize an ENS transaction. The GitHub Pages demo deployment does not depend on these legacy storage APIs.

No audit allowlist was broadened and no finding was suppressed to produce a green report. This maintenance improves the baseline while the listed blockers remain open.

## Reproduce against the exact candidate tree

```bash
npm ci
npm audit --package-lock-only --omit=dev --json
npm run ci:preflight
npm run build:gateway
npm run build:orchestrator
node --test test/scripts/provider-contracts.test.cjs test/scripts/runtime-packaging.test.cjs
node --test apps/orchestrator/dist/apps/orchestrator/__tests__/computerWork.test.js
npm run compile
npm test
npm run release:check-size
```

Enumerate the nested npm projects with `git ls-files '*package-lock.json'` and run `npm audit --package-lock-only --omit=dev --json` in each lockfile's directory. Audit failures must be retained as findings, not rewritten as success. Run `pnpm install --frozen-lockfile` and `pnpm audit --prod --json` separately in `demo/CULTURE-v0`; its pnpm workspace is distinct from the nested npm locks.

**Local verification:** all 583 root contract tests pass, as do 45 computer-work/browser regression tests and 33 provider/runtime/protocol checks. Console typechecking/build/lint, validator UI build/test and Validator Constellation v2 tests/build pass. CULTURE passes all service coverage gates (indexer: 32 tests, 92.94% line coverage; studio: 28 tests, 100% line coverage), script typechecking, quality gates, application builds and its three Hardhat contract tests.

Application compatibility checks include console typechecking/build/lint, validator UI build/tests, Validator Constellation v2 tests/build, CULTURE indexer Prisma generation/build/tests, CULTURE service coverage, and Pages build/browser checks. CI must pass on the exact proposed commit before merge. Real provider integration, independent security review and target-network commissioning remain necessary.

The refreshed Mermaid 11.17.2 runtime is regenerated in all three Kardashev-II offline dashboards; all three artifact/README checks pass. The existing diagram sources are retained. Local deployment gas overrides now respect the EIP-7825 transaction cap as well as the block limit. The three-job ASI Take-Off commissioning run passes with three validators per job, actual local escrow settlement, ten implementation records and fourteen constructor records; its token, work and operator identities remain simulated.

CI logs also exposed malformed runner network allowlists: literal multiline YAML was passed as one DNS name and the hardening agent crashed. All 30 affected allowlists now use folded `host:443` entries with the same authorized hostnames. A regression check validates the parsed YAML values and runs in core CI. Blocking policy remains enabled.

Portal compatibility review also corrected unpublished specification placeholders in all three creation flows, aligned its registry ABI with the compiled contract, and added 22 publication/signature/ABI checks. The real-browser publication fixture verifies exact-byte downloads, acceptance and rejection, draft changes, five languages and mobile layout with zero page errors or publication-panel accessibility violations. No wallet transaction or external provider commissioning is simulated as production approval. CULTURE's added lifecycle test now passes its workspace-specific formatting gate.

## Primary references

- [node-tar security advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw)
- [protobufjs security advisory](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg)
- [fast-xml-parser security advisory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-m7jm-9gc2-mpf2)
- [Fastify 5 migration guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)
- [Web3.Storage legacy API retirement](https://blog.web3.storage/posts/the-data-layer-is-here-with-the-new-web3-storage)

- [StepSecurity endpoint restriction guide](https://docs.stepsecurity.io/start-here/guides/how-to-restrict-network-connections-to-explicitly-allowed-endpoints)
