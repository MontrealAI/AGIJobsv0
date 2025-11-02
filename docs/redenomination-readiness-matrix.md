# REDENOMINATION Readiness Matrix

> **Purpose.** Provide an auditable crosswalk between the REDENOMINATION sprint
> objectives and the concrete contracts, scripts, and operations guides that now
> ship in AGI Jobs v0. Use this matrix to prove every requirement remains
> documented, configurable by the contract owner, and verifiable without writing
> code.

For each theme the table lists the contractual or tooling implementation and the
operator command or handbook that double-checks the behaviour. Pair this matrix
with the [Production Readiness Index](production/deployment-readiness-index.md)
when certifying a release.

## 1. Governed Autonomy

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Decentralized governance | All privileged modules inherit `Governable`, forcing calls through a multi-sig/timelock. Deployments can swap in `AGITimelock` to delegate control to a DAO wallet.【F:contracts/v2/Governable.sol†L4-L58】【F:contracts/v2/governance/AGITimelock.sol†L6-L78】 | `npm run owner:verify-control -- --network <network>` produces a Markdown proof that only the governance Safe can mutate parameters, per the [Owner control verification](owner-control-verification.md) workflow. |
| Strict role access & stake | `JobRegistry.submit` requires a verified ENS subdomain and stores the resulting hash before triggering validation; agents/validators must satisfy `IdentityRegistry` checks and staked minimums enforced by `StakeManager`.【F:contracts/v2/JobRegistry.sol†L1894-L1983】【F:contracts/v2/IdentityRegistry.sol†L991-L1068】【F:contracts/v2/StakeManager.sol†L639-L751】 | Run `npm run identity:update -- --network <network>` and `npm run owner:doctor -- --network <network>` to diff ENS roots, stake thresholds, and role minimums against committed config files. |
| Human oversight & safeguards | Emergency pausing and dispute escalation live in `SystemPause` and `DisputeModule`, letting governance halt modules or convene human arbitrators on demand.【F:contracts/v2/SystemPause.sol†L16-L290】【F:contracts/v2/modules/DisputeModule.sol†L221-L356】 | Follow the [Owner control emergency runbook](owner-control-emergency-runbook.md) and capture the simulated report via `npm run pause:test -- --network <network> --json > reports/<network>-pause-verification.json` before incident drills. |
| Ethical & policy enforcement | Governance may delist jobs, rotate ENS roots, or blacklist accounts using dedicated setters within `JobRegistry` and `ReputationEngine`.【F:contracts/v2/JobRegistry.sol†L1100-L1154】【F:contracts/v2/JobRegistry.sol†L2468-L2482】【F:contracts/v2/ReputationEngine.sol†L133-L207】 | Capture approvals inside `docs/owner-control-change-ticket.md` and publish the resulting diffs via `npm run owner:plan -- --network <network>` for audit trails. |

## 2. Verifiable Compute

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Trustless validation | `ValidationModule` orchestrates commit–reveal rounds, enforcing commit/reveal windows and tallying votes before `JobRegistry` finalises results.【F:contracts/v2/ValidationModule.sol†L820-L1430】【F:contracts/v2/JobRegistry.sol†L2000-L2058】 | Execute `hardhat test --no-compile test/e2e/localnet.gateway.e2e.test.ts` or review the [`ci (v2)` / Tests](../.github/workflows/ci.yml) job logs for automated end-to-end coverage. |
| Cryptographic proofs of execution | Agents store `resultHash` + `resultURI` on submission and disputes include `evidenceHash`, providing tamper-evident references to off-chain artefacts.【F:contracts/v2/JobRegistry.sol†L1912-L1999】 | Run `npm run wire:verify -- --network <network>` after deployments to compare stored hashes and URIs against live contract state. |
| On-chain reputation & certificates | Successful jobs mint certificate NFTs via `CertificateNFT.mint`, while `ReputationEngine` tracks scored performance and blacklists.【F:contracts/v2/JobRegistry.sol†L2412-L2416】【F:contracts/v2/modules/CertificateNFT.sol†L10-L138】【F:contracts/v2/ReputationEngine.sol†L82-L212】 | Inspect minted certificates and reputation changes with `npm run owner:dashboard -- --network <network>` to export the current leaderboards. |
| Result audits & spot checks | Governance can escalate jobs into the dispute flow, where additional validators or human arbitrators re-review outcomes with slashing hooks.【F:contracts/v2/ValidationModule.sol†L301-L344】【F:contracts/v2/modules/DisputeModule.sol†L221-L544】 | Trigger `npm run owner:plan:safe -- --network <network>` to queue escalation payloads for multi-sig approval during audit drills. |

## 3. Anti-Collusion Validation

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Randomized selection | Committees derive entropy from participant seeds, block randomness, and optional VRF coordinators before weighting by stake.【F:contracts/v2/ValidationModule.sol†L820-L1160】 | `forge test --match-test testSelectValidators --ffi --fuzz-runs 64` exercises weighted sampling and failure modes. |
| Commit–reveal secrecy | Commitments are hashed with salts and reveals revert unless the original digest matches, preventing mid-round collusion.【F:contracts/v2/ValidationModule.sol†L1239-L1427】 | Review `npm run echidna:commit-reveal` results for property-based checks that enforce sealing and reveal ordering. |
| Stake slashing & penalties | Incorrect or missing votes slash stakes and ban validators for configurable windows, routed through `StakeManager`.【F:contracts/v2/ValidationModule.sol†L85-L123】【F:contracts/v2/ValidationModule.sol†L1698-L1729】【F:contracts/v2/StakeManager.sol†L2466-L2681】 | Analyse slashing events via `npm run hamiltonian:report -- --network <network>` which summarises penalty flows alongside thermodynamic incentives. |
| Hierarchical disputes | `DisputeModule` escalates to larger juries or `ArbitratorCommittee` panels using another commit–reveal round to break collusion.【F:contracts/v2/modules/DisputeModule.sol†L356-L544】【F:contracts/v2/ArbitratorCommittee.sol†L10-L170】 | Execute the fork-based dispute scenario `npm run test:fork` to rehearse validator misconduct escalations. |
| Anti-Sybil identity | `IdentityRegistry` enforces ENS, wrapper attestations, and optional Merkle allowlists before validators join committees.【F:contracts/v2/IdentityRegistry.sol†L200-L360】【F:contracts/v2/IdentityRegistry.sol†L991-L1068】 | `npm run identity:update -- --network <network>` outputs any stale ENS proofs or blacklist updates required before new validators onboard. |

## 4. Institutional Observability

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Audit logging | Contracts emit lifecycle events for submissions, votes, disputes, and pauses; off-chain services log correlated IDs for replay.【F:contracts/v2/JobRegistry.sol†L1936-L1964】【F:contracts/v2/SystemPause.sol†L152-L217】【docs/institutional-observability.md†L3-L40】 | Confirm event coverage in the operations vault using `npm run deploy:checklist -- --network <network>` and the associated event diff reports. |
| Real-time dashboards | Prometheus + Grafana dashboards track SLOs, queue depth, and latency across orchestrator, bundler, paymaster, IPFS, and subgraph services.【F:monitoring/prometheus/prometheus.yml†L1-L58】【F:monitoring/grafana/dashboard-agi-ops.json†L1-L33】 | Run `npm run observability:smoke` to ensure scrape jobs, alert routes, and dashboards ship intact before promoting a release. |
| Anomaly detection & alerts | Alertmanager routes warning/critical alerts to Slack and PagerDuty with runbook links; Prometheus rules compute leading indicators.【F:monitoring/prometheus/rules.yaml†L1-L33】【F:monitoring/alertmanager/alerts.yaml†L1-L20】 | Validate alert destinations against secrets inventory using the monitoring section of `docs/owner-control-audit.md`. |
| Performance metrics | Recording rules export p95 onboarding latency, cost per verified operation, and subgraph lag for capacity planning.【F:monitoring/prometheus/rules.yaml†L1-L21】 | Capture monthly capacity reviews in `reports/<network>-economics-baseline.md` after running `THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermodynamics.md npm run thermodynamics:report -- --network <network>`. |

## 5. One-Click Deployment & Secure Defaults

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Containerised stack | `scripts/v2/oneclick-stack.ts` invokes the deployment wizard and optional Docker Compose bundle for a push-button rollout.【F:scripts/v2/oneclick-stack.ts†L1-L88】 | Execute `npm run deploy:oneclick:auto -- --network <network>` from the non-technical runbook and archive the generated compose + env files. |
| Automated network configuration | `deploy:oneclick:wizard` and `deploy:env` generate per-network manifests, addresses, and Safe payloads without manual edits.【F:scripts/v2/oneclick-wizard.ts†L1-L220】【F:scripts/v2/generate-oneclick-env.ts†L1-L160】 | Store the resulting JSON bundles in `reports/` and cross-check with `docs/production/nontechnical-mainnet-deployment.md`. |
| Secure defaults | Default configs pause modules, enforce validator minimums, and require tax acknowledgement before submissions, reducing launch risk.【F:contracts/v2/JobRegistry.sol†L1934-L1975】【F:contracts/v2/ValidationModule.sol†L85-L123】 | Use `npm run owner:surface -- --network <network>` to review the parameter surface before unpausing live jobs. |
| Deployment guides | Dedicated playbooks walk non-technical operators through mainnet launch, Safe approvals, and rollback drills.【F:docs/production/nontechnical-mainnet-deployment.md†L1-L120】【F:docs/production/v2-institutional-deployment-blueprint.md†L1-L140】 | Attach signed checklists from the runbooks to `docs/owner-control-change-ticket.md` as part of each go-live review. |

## 6. User Experience & Documentation

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Owner console & guided workflows | The owner console exposes configuration forms, live policy panels, and validator receipts so non-technical operators can steer deployments without raw RPC calls.【F:apps/console/src/App.tsx†L1-L63】 | Use `npm run webapp:e2e` to validate the guided flows and archive resulting Cypress screenshots for sign-off. |
| Conversational agent UX blueprint | The chat-style interaction model for employers, agents, and validators is documented end-to-end, covering prompts, validation steps, and escalation hooks.【F:docs/chat-interface-architecture.md†L1-L140】 | Share the [agentic quickstart](AGENTIC_QUICKSTART.md) with pilot users and capture feedback in `docs/owner-control-change-ticket.md`. |
| Role-specific help center | Dedicated guides for employers, agents, and validators plus the owner control handbook document every workflow with checklists and diagrams.【F:docs/user-guides/README.md†L1-L40】【F:docs/owner-control-handbook.md†L1-L160】 | Run `npm run docs:verify` to lint links and record documentation updates under `docs/owner-control-change-ticket.md`. |

## 7. Testing, Security & Assurance

| Requirement | Implementation evidence | Verification artifacts |
| --- | --- | --- |
| Extensive automated tests | CI compiles contracts, runs Hardhat/Foundry suites, checks ABIs, coverage, gas snapshots, and E2E workflows on every PR.【F:.github/workflows/ci.yml†L1-L118】 | Confirm the **CI summary** badge is green and inspect stored artefacts per the [CI v2 operations guide](v2-ci-operations.md). |
| Security drills & audits | The security handbook enumerates multisig transfers, emergency procedures, and audit vectors, with runbooks for replaying fork drills and dispute escalations.【F:SECURITY.md†L1-L60】【F:docs/security/audit-test-vectors.md†L1-L120】 | Execute `npm run test:fork` quarterly and log outcomes plus remediation tasks in `docs/owner-control-audit.md`. |
| Static analysis & dependency checks | Security guidelines list mandatory Slither, Foundry, and audit-ci commands to keep dependencies patched and bytecode analysed.【F:SECURITY.md†L28-L66】 | Run `audit-ci --config ./audit-ci.json` and attach reports to the release ticket before tagging. |
| Economic & load simulations | Thermodynamic operations docs and Monte Carlo scripts stress test reward splits, burn percentages, and validator behaviour before mainnet pushes.【F:docs/thermodynamics-operations.md†L1-L140】【F:simulation/montecarlo.py†L1-L45】 | Store simulation outputs in `reports/<date>-thermodynamics.csv` alongside governance approvals. |
| Ongoing security monitoring | Alertmanager routes and emergency owner scripts provide live alerting and rapid pause capabilities for incidents.【F:monitoring/alertmanager/alerts.yaml†L1-L20】【F:scripts/v2/ownerEmergencyRunbook.ts†L1-L220】 | Document each incident response rehearsal in `docs/owner-control-emergency-runbook.md` with timestamps and participants. |

---

Maintaining this matrix alongside the existing readiness artefacts guarantees
that future contributors can verify REDENOMINATION goals remain satisfied before
any production deployment.
