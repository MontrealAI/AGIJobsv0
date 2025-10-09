# α-AGI Meta-Agentic Readiness Audit

> **Audience:** Program leads, protocol owners, and institutional reviewers certifying that the AGI Jobs α-AGI stack satisfies the meta-agentic and evolutionary requirements described in the “Achieving ASI with Meta-Agentic Program Synthesis and α-AGI Architecture” roadmap.
>
> **Goal:** Map each ASI-enabling condition to concrete repository artefacts, double-signature verification commands, and fallback evidence so non-technical stakeholders can assert—without code changes—that the platform is deployable, observable, and controllable at scale.

---

## 1. Condition-to-Evidence Matrix

| Condition (roadmap clause) | Primary implementation evidence | Verification path A (command) | Verification path B (independent cross-check) |
| --- | --- | --- | --- |
| **Collective second-order intelligence** | Orchestrator planner/runner (`orchestrator/planner.py`, `orchestrator/runner.py`) and chat/ICS bridge (`apps/orchestrator`, `agent-gateway/`). | `npm run onebox:server` → open the console at <http://127.0.0.1:4173> and execute a planner trace; archive the resulting plan JSON under `reports/<date>-planner.json`. | Inspect `storage/org-policies.json` and `apps/orchestrator/diagrams/*.md` to confirm role routing and escalation trees reflect current governance approvals; countersign by attaching SHA-256 hashes to the ops vault. |
| **Open-ended self-improvement (Evolutionary Program Synthesis loop)** | Agent gateway scripts (`examples/agentic/v2-agent-gateway.js`, `examples/agentic/v2-validator.js`), Monte Carlo evaluator (`simulation/montecarlo.py`), and orchestrator state store (`orchestrator/state.py`). | `npm run agent:gateway` followed by `node examples/agentic/metrics.js` to record candidate agent metrics; store the metrics snapshot in `reports/agentic/` with a timestamp. | Run `python simulation/montecarlo.py > reports/<date>-montecarlo.txt` and compare the printed “Best parameters” section against the most recent archived run to confirm progressive improvement. |
| **Quality/diversity archive for evolved agents** | Planner simulation ledger (`storage/orchestration-ledger.json`), validator metrics exporter (`examples/agentic/metrics.js`), and append-only audit log (`shared/auditLogger.ts`). | `npm run owner:atlas -- --network <network> --out reports/<network>-atlas.md` to snapshot all registered agent archetypes and routing weights. | `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/anchor-logs.ts --log-dir storage/audit --dry-run > reports/<date>-audit-anchor.json` (verify that each unique `agentVariant` recorded in orchestration receipts matches an entry in the atlas report). |
| **Unlimited scaling via decentralized α-AGI Nodes** | Platform registry + router contracts (`contracts/v2/platform`), alpha bridge service (`services/alpha-bridge/`), and node registration scripts (`scripts/v2/updatePlatformRegistry.ts`). | `npm run platform:registry:inspect -- --network <network> --format markdown --out reports/<network>-platform-registry.md` to prove operator stakes and capacities. | Independently call `GET /metrics` on each node’s exporter (see `services/alpha-bridge/README.md`) and capture Prometheus samples; compare node counts with the registry inspection report. |
| **Economic drive & alignment** | Reward engine (`contracts/v2/RewardEngineMB.sol`), thermodynamic reports (`scripts/v2/thermodynamicsReport.ts`), and incentive documentation (`docs/thermodynamic-incentives.md`). | `THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermo.md npm run thermodynamics:report -- --network <network>` to confirm Gibbs free-energy budgeting. | Cross-check payout coefficients with governance-approved baselines stored in `reports/<network>-economics-baseline.md`; require written acknowledgement from the finance signatory recorded in the change ticket. |
| **Governance and safety** | Owner control toolkit (`scripts/v2/owner*.ts`), SystemPause contract (`contracts/v2/SystemPause.sol`), observability smoke checks (`scripts/observability-smoke-check.js`). | `npm run owner:mission-control -- --network <network> --out reports/<network>-mission.md` followed by `npm run pause:test -- --network <network> --json > reports/<network>-pause.json`. | Review the GitHub Actions `ci (v2)` summary (link in README badge) and verify branch protection contexts via `gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'`; attach screenshots and CLI output to the audit record. |

> **Triple-verification mandate:** Each row must be evidenced by (1) the direct command output, (2) an independent artefact cross-check, and (3) manual countersignature in the governance document vault before a readiness status is marked ✅.

---

## 2. Operational Drill Sequence

Follow this playbook monthly or before any production release. The sequence aligns planner evolution, decentralized compute, and on-chain control with institutional expectations.

1. **Synchronise deterministic artefacts**
   - `git fetch origin && git status` (record the commit hash in the readiness log).
   - `npm ci && npm run compile` (regenerates Solidity constants and ABI caches).
   - Independent validation: run `node scripts/ci/check-abi-diff.js` and compare against the previous `coverage-lcov` artefact stored under `reports/`.
2. **Exercise the meta-agent loop**
   - Launch the orchestrator sandbox: `npm run onebox:server`.
   - In a separate shell, run `npm run agent:gateway` to boot the agent execution harness.
   - Trigger a synthetic workload via the planner UI; download the execution receipt JSON.
   - Alternative verification: copy `storage/orchestration-ledger.json` into `reports/<date>-orchestration-ledger.json` and confirm the run includes distinct agent `variantId` entries.
3. **Score evolutionary progress**
   - Execute `python simulation/montecarlo.py > reports/<date>-montecarlo.txt` (script prints burn/fee sweep results and the optimal configuration).
   - Independently locate the optimisation summary with `rg "Best parameters" -n reports/<date>-montecarlo.txt` and verify the reported `burn_pct`/`fee_pct` pair against the previous archive.
   - Compare with the latest record (create or update `reports/evolution-log.md`) and annotate whether the optimisation improved or held steady.
4. **Validate decentralized node readiness**
   - `npm run platform:registry:inspect -- --network <network>` to extract stake-weighted routing tables.
   - Independently query each node exporter: `curl -s https://<node-host>/metrics | grep agijobs_node_capacity` and attach outputs.
   - Record any discrepancy as a ⚠️ in `docs/institutional-observability.md` per the observability checklist.
5. **Governance control check**
   - `npm run owner:verify-control -- --network <network> --strict --json --out reports/<network>-verify.json`.
   - Independently execute `npm run owner:dashboard -- --network <network> --format markdown --out reports/<network>-dashboard.md`.
   - Require sign-off from the governance Safe signers (initials, timestamp) appended to the dashboard report.
6. **Emergency readiness**
   - `npm run pause:test -- --network <network> --json > reports/<network>-pause.json`.
   - Independently confirm via block explorer write tab for `SystemPause` that the pauser address matches the Safe signer list; screenshot for compliance.

Archive all artefacts in `reports/<YYYY-MM-DD>/` and link the directory in the change ticket (`docs/owner-control-change-ticket.md`).

---

## 3. Owner Authority & Parameter Control

The contract owner retains the ability to modify every relevant configuration without redeploying contracts. Use the following dual-path validation before and after any parameter adjustment:

| Module | Primary setter command | Independent assurance |
| --- | --- | --- |
| `JobRegistry` | `npm run owner:update-all -- --network <network> --only jobRegistry --execute` | Confirm via Etherscan write tab (`setFeePct`, `setTreasury`, `setEscrowStake`) signed with the governance Safe; attach transaction hashes to `reports/<network>-jobregistry-setters.md`. |
| `StakeManager` | `npm run owner:update-all -- --network <network> --only stakeManager --execute` | Run `npm run owner:surface -- --network <network>` and confirm the `minimumStake` matches the intended value; countersign by diffing against `reports/<network>-surface-previous.md`. |
| `RewardEngineMB` / `Thermostat` | `npm run owner:update-all -- --network <network> --only rewardEngine thermostat --execute` | Execute `npm run thermodynamics:report -- --network <network>` and compare role share percentages; record approval in finance change log. |
| `EnergyOracle` | `npm run owner:update-all -- --network <network> --only energyOracle --execute` | Run `npm run owner:dashboard -- --network <network> --format markdown --out reports/<network>-dashboard.md` and verify the `EnergyOracle` signer table matches the intended configuration; attach the diff against the previous dashboard report. |
| `SystemPause` | `npm run pause:test -- --network <network> --json` | Manually trigger `triggerGlobalPause` on a staging network and record the revert/receipt; screenshot block explorer UI. |

> **Note:** Every `owner:update-all` invocation supports `--safe` to emit a Gnosis Safe transaction bundle. Always capture both the simulated diff and the Safe payload even if executing directly via hardware wallet.

---

## 4. Risk Register & Mitigations

| Risk | Detection hook | Mitigation |
| --- | --- | --- |
| **Evolutionary regressions** – new agent variants perform worse than previous generation. | `simulation/montecarlo.py` run reports a negative delta in mean fitness compared with `reports/evolution-log.md`. | Roll back to the last archived agent policy from `storage/org-policies.json`; rerun the Monte Carlo harness before re-enabling auto-promotion. |
| **Node pool imbalance** – decentralized α-AGI nodes drift below quorum or concentrate stake. | `npm run platform:registry:inspect` shows <3 active nodes or a single operator with >50% routing weight. | Invoke `platform:registry:update` to rebalance stakes; governance may temporarily increase validator counts via `ValidationModule.setParameters`. |
| **Governance drift** – Safe signers or timelock address outdated. | `npm run owner:verify-control -- --network <network>` emits ❌ entries. | Execute `npm run owner:rotate -- --network <network>` and capture receipts; update `config/owner-control.json` before re-running verification. |
| **Observability gaps** – exporter downtime or missing telemetry. | `npm run observability:smoke` exits non-zero. | Follow `docs/institutional-observability.md` remediation checklist; block deployments until exporters report HTTP 200 and Alertmanager acknowledges restored routes. |
| **Emergency pause failure** – pause script cannot reach contracts. | `npm run pause:test` returns transport error or missing permissions. | Validate RPC endpoints, rotate pauser credentials, and re-run the test on a fork via `hardhat node --fork`; do not process jobs until resolved. |

Record all identified risks and mitigations in `reports/<YYYY-MM-DD>/risk-register.md` for auditability.

---

## 5. Change Control Expectations

1. **Documentation alignment** – Whenever a new tool, contract, or module is introduced, update this audit alongside:
   - [`docs/production/deployment-readiness-index.md`](production/deployment-readiness-index.md)
   - [`docs/owner-control-master-checklist.md`](owner-control-master-checklist.md)
   - [`docs/institutional-observability.md`](institutional-observability.md)
2. **CI gating** – Branch protection on `main` must require the five `ci (v2)` contexts. See [`docs/ci-v2-branch-protection-checklist.md`](ci-v2-branch-protection-checklist.md) for the enforcement script.
3. **Artefact retention** – Archive every verification output under `reports/` with timestamped directories. Governance auditors must be able to replay any readiness claim from stored artefacts alone.
4. **Non-technical execution** – Provide step-by-step instructions in change tickets referencing the commands above; assume the executor uses a hardware wallet and cannot modify Solidity.

Maintaining this audit as the canonical bridge between the ASI roadmap and the codebase guarantees that meta-agentic, evolutionary, and decentralized controls stay provably aligned with institutional deployment requirements.
