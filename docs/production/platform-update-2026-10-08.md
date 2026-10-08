# Container, deployment and diagram update — 2026-10-08

This update starts from main commit `5b4cebb309a83a7a6749d8911d8bf96a1921e042`. It preserves the demo collection and diagrams while repairing concrete deployment, container, validator and presentation defects. The goal remains a scalable machine-labor layer for authorized, lawful computer-based work, with reviewable evidence and independent acceptance. The $40T/year opportunity remains a planning assumption, not measured revenue or a guarantee of universal task capability.

## Container coverage

The [container catalog and operations guide](../container-operations.md) cover all 24 Dockerfiles and nine Compose files. Five published images build and run probes on native AMD64 and ARM64 runners. Their existing required check names now also depend on the inventory and all 19 auxiliary images. This addresses the observed ARM64 webapp dependency-installation crash under QEMU without removing ARM support.

Corrections include Compose syntax and build contexts, server commands and ports, deployment-token mapping, browser configuration at build time, persisted gateway state, and Python/native dependencies. Each probe describes its evidence: HTTP startup, actual gateway fixture operation, CLI execution or packaged integration dependencies. Historical packaging probes are not live worker, database, oracle or settlement commissioning.

The gateway probe uses isolated local contracts and an ephemeral local keystore. It checks token metadata, loaded wallets, HTTP/gRPC listeners, non-root execution, a record surviving container recreation, and shutdown. Published architecture candidates must have the same image identity as the images executed and scanned before multi-architecture promotion.

## Deployment and validator correctness

- The on-chain installer accepts nominated two-step ownership before protected setters. Deployment no longer depends on local RPC account impersonation. Missing module references, authorized callers, fee-pool wiring and ownership handoffs are completed and checked.
- Deployment reports read actual on-chain values and distinguish completed ownership from pending acceptance. Existing numeric report fields remain compatible. Unsupported one-click tax/arbitrator combinations stop before mutation and link to the staged procedure.
- The provider-agnostic local lifecycle uses the current domain-bound commitment, six-argument reveal and real chain deadlines. Public-network fixture deployments fail before sending transactions.
- The [validation replacement procedure](../module-upgrade-procedure.md) requires a paused, drained stack and explicitly prepared ownership and wiring. It inspects jobs, rounds and stake locks before broadcasting, verifies the result, and leaves the replacement paused. It does not migrate active rounds or compose multisig transactions.
- The deployment wizard reports Docker failure as failure. It retains recovery instructions and cannot print a successful completion after a failed launch.
- The mainnet workflow produces a read-only deployment candidate with configuration checks, chain observations and compiled-artifact hashes. It is explicitly not a Safe-import transaction bundle or an authorization to deploy. Missing configuration or evidence produces a blocked report.
- The [validator UI](../../apps/validator-ui/README.md) uses the actual v2 contract interface, explicit approval/rejection, authoritative registry and round checks, pre-broadcast recovery records and cross-tab locking. It reconciles on-chain results after reload and refuses automatic resends after uncertainty. A bounded same-origin endpoint serves gateway job/evidence data for independent review.

The follow-up validation uses the same `COMMIT_WINDOW=30m` and `REVEAL_WINDOW=30m` settings as CI. Provider deployment validates amounts, integer bounds and durations before mutation. The wizard and environment generator bind chain IDs and registry addresses to the deployment manifest, check separate server/browser RPC endpoints, and prevent inherited shell settings from silently overriding checked network routing.

The validator proxy constructs its destination from validated operator configuration and a bounded numeric path segment, with origin preservation, redirect rejection and response limits. Its commit module uses typed ESM imports and passes an isolated image-equivalent build. Vitest 4.1.11 fixes the reported development-tool advisories; both full and production-only validator audits report zero findings, and the lockfile installs with the pinned npm version.

## Preserved diagrams and current guidance

The source audit renders tracked Markdown fences, standalone Mermaid files and static Mermaid blocks in HTML directly with the locked renderer, without the website's legacy repair adapters. Syntax corrections preserve the diagrams' substantive nodes, relationships, labels and historical measurements. A file containing two complete graphs is split into two linked diagrams so both can render.

Relevant generators are corrected alongside their reports. Historical simulations are not rerun or relabelled as current measurements. Where a report is listed in a checksum manifest, additive presentation-correction metadata retains the original digest and immutable source commit while recording the corrected presentation's digest. Existing unrelated historical mismatches remain explicitly identified rather than certified.

The [computer-work guide](../computer-work.md) reflects the checked official OpenClaw and OpenAI guidance, including desktop-session prerequisites and code-driven computer interaction. Runtime capabilities depend on the selected platform, permissions and commissioning. The repository does not invent an undocumented ChatGPT Work API or treat arbitrary screen-based work as automatically authorized or reliably solved.

## Verification and release boundary

Local validation compiled **267 Solidity files**, passed **745 contract/integration tests**, and passed the production bytecode-size gate, both service builds, **64 compiled runtime/provider/packaging checks** and **71 release/deployment regression checks**. Validator UI verification passed **8 real-contract tests**, **6 unit tests**, a production build and a browser smoke journey. Workflow validation passed actionlint, formatting, the 24 core and nine companion context checks, and all 23 required CI-summary dependencies.

The website builds **76 demo pages, 345 guides and 267 diagrams**. Its **55 model/site tests**, **41 main browser check groups** and the separate Phase 8, Business 3, OmniSovereign, Meta Alpha, Hypernova, Huxley-Gödel, program-synthesis and CULTURE browser journeys passed. The direct source gate rendered **504 static Mermaid sources**; one server-template target is explicitly inventoried separately. Runtime-generated diagrams require their application-specific checks. These counts describe the tested source, not every possible external renderer or deployed configuration.

Initial PR CI exposed additional packaging and generated-fixture defects. Follow-up changes preserve storage source files in Docker contexts, load attestation source explicitly, install native build prerequisites, use an available pinned Node image, provide an isolated local RPC fixture for the Meta API readiness probe, and repair the two historical inline diagram bundles alongside their sources. The first run passed Pages, six native image builds and 13 auxiliary images; these are partial results, not approval of the revised container set.

Use the exact PR commit's CI results and the emitted Pages/container evidence for integrated results. Reproduce the website and original-source checks with the [website guide](../../website/README.md); it includes the separate frozen CULTURE installation. Contract, deployment and validator regressions exercise actual local contracts. All compilation and runtime checks use the pinned repository toolchain. Bundled no-compile implementation bytecode is regenerated from the compiled contracts and checked for exact ABI/bytecode equality. Migration tests construct fresh stacks so unrelated full-suite network resets cannot invalidate their snapshots.

The [October 8 dependency audit](dependency-audit-2026-10-08.json) covered 22 production lockfiles: 21 passed the severity gate, while the root retained **0 critical, 7 high, 36 moderate and 22 low** findings. The snapshot records the dirty source state and exact manifest/lock hashes; raw registry responses remain reproducible through the release audit command. The existing `braces` and `node-forge` chains and retired Web3.Storage routes require supported remediation or migration. No advisory is waived.

No public-chain deployment, paid task, release signature or live worker commissioning is performed by this update. The local workspace has no Docker daemon; actual image builds and probes require the CI runners or an operator's Docker host. Successful site and test results do not override the separate production dependency audit, signing, security review, buyer acceptance and commissioning gates in [current readiness](readiness.md).

Browser recovery records are unencrypted and do not promise operating-system durability. Other validator services retain the separate recovery limitations documented in the readiness index. The current contract's opaque commitment entry point does not provide epoch-bound rejection of a transaction mined across an administrative round reset. These limitations require deliberate deployment and protocol work; they are not hidden by successful UI tests.
