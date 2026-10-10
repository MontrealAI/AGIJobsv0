# Current production readiness

This is the stable entry point for deployment status. Dated reports describe the exact checks and limitations observed at the time; they are not perpetual production certifications.

## What can be used now

The public website provides the complete preserved demo collection, guided experiences, original diagrams, browser workbenches and a local job planner. The repository supplies executable local-chain workflows and an operator-admitted OpenClaw computer-work adapter. These capabilities require their documented environments and have distinct evidence boundaries.

The [local evidence reviewer](../EVIDENCE_REVIEW.md) checks delivered artifact integrity against the original task and records an unsigned reviewer assessment. It does not authenticate provider provenance or satisfy independent acceptance by itself. The adapter rejects malformed UTF-8, invalid Unicode strings and text artifacts exceeding 128,000 UTF-8 bytes.

The [container operations guide](../container-operations.md) identifies every maintained and historical Dockerfile, its startup probe, and the additional setup needed for live operation. The [validator review console](../../apps/validator-ui/README.md) supports an explicit human verdict, current round deadlines, and private browser recovery records; browser storage and downloaded backups are unencrypted. Neither a successful health check nor a structurally valid delivery establishes acceptance of the work.

## SUCCESSOR Ω release candidate

The [SUCCESSOR Ω local guide](../successor/README.md) adds compiled missions, executable discovery, signed evaluation mechanics, durable state and portable knowledge. The public/local missions are synthetic rehearsals. The new mission-bound computer-work route and action broker refuse live dispatch; legacy admitted computer-work behavior is preserved. A local signed fixture is not I3 independent proof, and export/restoration grants no authority.

Read the [acceptance matrix](../successor/acceptance-matrix.md) and [security review](../successor/security-review.md) before commissioning this subsystem. Its current local verification does not clear any existing production gate below.
## Current deployment tooling

Use the [staged Hardhat guide](../deployment-v2-agialpha.md) for new deployments and the [plain-language coordinator guide](nontechnical-mainnet-deployment.md) for review. The current script validates public-network configuration and compiler evidence before transactions, commits the resolved plan on its coordinator, and hands off all eight managed modules paused. Submitted transactions and recovery checkpoints are retained in a private report and append-only journal. Tax metadata is installed before ownership transfer; explorer failures and pending governance actions remain explicit.

This does not retrofit existing coordinators or migrate deployed state. Historical direct coordinator entrypoints keep their unpaused behavior; use the supported script for a new paused deployment. Only governance may authorize unpausing after the gates below.

## What a live deployment still needs

| Gate | Evidence needed |
| --- | --- |
| Release trust | Authorized maintainer signing identities and verified release artifacts |
| Merge enforcement | Active repository rules requiring the intended checks and review policy, verified against GitHub configuration |
| Security | Independent review, current dependency findings resolved or explicitly assessed, and validated provider configuration |
| Worker commissioning | An isolated real runtime with verified permissions, account selection, action/network policy, spending limits, stop behavior and representative success/rejection cases |
| Independent acceptance | Reviewers qualified for the work category, conflict disclosures, reproducible checks and actual buyer acceptance |
| Network commissioning | Correct token/chain/addresses, deployment and ownership verification, identity/tax/stake prerequisites, monitored settlement and tested recovery |
| Recovery | Reconciled uncertain actions, durable dispatch/settlement journals and a validated procedure for lost validator reveal secrets |

The `agent:validator` rehearsal example now persists private, deployment-scoped reveal secrets before broadcasting and reconciles retained records after restart. Its explicit fixed decision is a rehearsal input, not an independent content assessment; see the [validator quickstart](../AGENTIC_QUICKSTART.md). The [reviewed validator service](../../apps/validator/README.md) now uses the current domain-bound protocol, exact round/specification/result review admission, pre-broadcast private records and restart reconciliation. Its structural evaluator cannot authorize a vote. Other validator paths still require separate recovery commissioning: `apps/orchestrator/service.ts` retains an in-memory commit map and gateway validators use a separate persisted-record format. These changes do not retrofit or certify those separate paths. Computer-work evidence requires independent acceptance and is not automatically approved by structural validation. Legacy Web3.Storage publishing routes also remain dependent on a retired provider API until migrated and commissioned. The static GitHub Pages site does not use that API.

The current contract commit entry point accepts an opaque hash without an expected-round argument. Client-side scope checks protect saved secrets and refuse inconsistent reveals, but they do not provide contract-level isolation for a transaction that mines across an administrative round reset. Reconcile in-flight transactions before reset/reselection; complete epoch-bound transaction rejection requires a separately versioned protocol change and deployment review. This update does not certify that mempool boundary.

The production release workflow enforces `npm run release:audit-dependencies` before publishing release artifacts. It audits all tracked npm and pnpm production lockfiles, preserves raw registry responses and exact input hashes, and fails on critical/high findings, malformed responses or unavailable audit evidence. A passing website deployment does not bypass this release gate. The current root findings require supported upstream fixes or a tested migration; forcing incompatible dependency versions is not remediation.

## Verification records

- [Container, deployment and diagram update, 2026-10-08](platform-update-2026-10-08.md): current changes and validation boundaries.
- [Platform and website update, 2026-10-07](platform-update-2026-10-07.md): earlier integration, dependency refresh and validation scope.
- [Computer-work correctness and remaining gates](readiness-2026-10-04.md).
- [Dependency maintenance and legacy provider limitations](dependency-review-2026-10-04.md).
- [Original production readiness record](readiness-2026-10-03.md).
- [Reproducible production rehearsal](rehearsal.md).
- [Fixed implementations and staged deployment](fixed-implementations.md).

Use current CI results for the exact candidate commit and rerun the documented checks when dependencies or deployment settings change. Do not infer production authorization from local simulation receipts, self-signed fixture evidence or a successful website deployment.
