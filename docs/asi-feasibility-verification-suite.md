# ASI Feasibility Verification Suite

> **Audience:** Release management, governance, and contract owners who must certify that AGI Jobs v0 (contracts v2) satisfies every pillar from *Achieving ASI with Meta-Agentic Program Synthesis and α‑AGI Architecture* before approving production rollout.
>
> **Goal:** Provide an executable checklist that pairs each feasibility requirement with concrete commands, artefacts, and independent verification paths so non-technical signers can prove the platform is production-ready and owner-controlled.

---

## 1. How to use this suite

1. Clone the repository on an audited workstation and install dependencies:
   ```bash
   git fetch origin
   npm ci
   npm run compile
   ```
2. Run the **core readiness battery** (mirrors CI v2) and archive the console output:
   ```bash
   npm run format:check
   npm run lint:ci
   npm test
   npm run coverage
   forge test -vvvv --ffi --fuzz-runs 256
   npm run docs:verify
   ```
3. Generate ownership, thermodynamics, and pause artefacts for the target network:
   ```bash
   npm run owner:doctor -- --network <network> --strict --json > reports/<network>-owner-doctor.json
   npm run owner:verify-control -- --network <network> > reports/<network>-owner-proof.md
   npm run pause:test -- --network <network> --json > reports/<network>-pause.json
   THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermodynamics.md npm run thermodynamics:report -- --network <network>
   ```
4. File every generated artefact in the operations vault and capture a screenshot of the most recent green `ci (v2)` run on `main`.
5. Have an independent reviewer replay at least one command per pillar and countersign the results (triple-verification rule).

---

## 2. Pillar-by-pillar verification

| Feasibility pillar | Primary proof | Supporting documentation | Independent verification |
| --- | --- | --- | --- |
| **Collective second-order intelligence** | Exercise the orchestrator endpoints with `apps/orchestrator/onebox-server.ts` and capture the planner → simulator → executor transcript. | [`docs/orchestration.md`](orchestration.md) details the meta-agent workflow; [`docs/continuous-learning.md`](continuous-learning.md) maps the learning artefacts. | Inspect the generated `records.jsonl` and verify agents/validators in the transcript own ENS identities via `IdentityRegistry`. |
| **Open-ended self-improvement** | Run the continuous learning refresh: `node scripts/continuous-learning/replay.js --network <network>` (or per runbook) and append the diff to the audit log. | [`docs/continuous-learning.md`](continuous-learning.md) outlines the cloning/retraining loop and command surface. | Confirm `cloneEligibleAgents` and retrain scripts updated manifests in `storage/` and that the audit ticket records hashes of new bundles. |
| **Decentralised compute & fault tolerance** | Execute the node operator smoke test: `npm run observability:smoke` and `npm run pause:test -- --network <network>`. | [`docs/node-operator-runbook.md`](node-operator-runbook.md) explains registration; [`docs/system-pause.md`](system-pause.md) covers global halts. | On-chain, confirm `SystemPause` owns every module and pauser keys match `owner:doctor` output. |
| **Economic drive & alignment** | Generate thermodynamics and reward reports using the commands above, and diff against the finance-approved baseline. | [`docs/thermodynamics-operations.md`](thermodynamics-operations.md) and [`docs/reward-settlement-process.md`](reward-settlement-process.md) document the energy oracle, thermostat, and RewardEngineMB configuration. | Verify the resulting report matches `config/thermodynamics.json` and that `RewardEngineMB` setters remain restricted to the owner via `owner:verify-control`. |
| **Governance & safety guardrails** | Produce `reports/<network>-owner-proof.md` via `npm run owner:verify-control` and ensure it lists multisig/timelock ownership across all modules. | [`docs/system-pause.md`](system-pause.md) and [`docs/owner-control-non-technical-guide.md`](owner-control-non-technical-guide.md) provide emergency and change-management workflows. | Cross-check timelock delay, pauser assignments, and governance Safe signers against the change ticket referenced in `docs/owner-control-change-ticket.md`. |
| **Owner authority over parameters** | Run `npm run owner:parameters -- --network <network>` to export the full control matrix. | [`docs/owner-control-parameter-playbook.md`](owner-control-parameter-playbook.md) explains each setter and guard. | Replay a sample parameter change in dry-run mode (`npm run owner:plan -- --network <network> --dry-run`) and verify Safe bundles capture every call. |
| **Production CI enforcement (v2)** | Confirm the latest `ci (v2)` run is green and branch protection enforces the five contexts. | [`docs/v2-ci-operations.md`](v2-ci-operations.md) documents the workflow, job names, and remediation playbooks. | Run `gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'` and attach the JSON proof. |

> **Note:** Treat any warning in the owner, pause, or thermodynamics commands as a release blocker until cleared by governance.

---

## 3. Artefact retention checklist

| Artefact | Location | Retention policy |
| --- | --- | --- |
| CI run screenshot + URL | Ops vault (image + link) | 2 years |
| `reports/<network>-owner-doctor.json` | Repository `reports/` folder | Until superseded + 1 year |
| `reports/<network>-owner-proof.md` | Repository `reports/` folder | Until next governance rotation |
| `reports/<network>-pause.json` | Repository `reports/` folder | Rolling 4 quarters |
| `reports/<network>-thermodynamics.md` | Repository `reports/` folder | Rolling 8 quarters |
| Change ticket references | `docs/owner-control-change-ticket.md` | Permanent |

Archive artefacts in Git LFS or encrypted object storage when file sizes exceed repository policies. Always cross-link artefacts to the active governance ticket for traceability.

---

## 4. Escalation protocol

1. If any verification step fails, immediately record the failure, console output, and timestamp in `docs/owner-control-change-ticket.md`.
2. Trigger `npm run owner:emergency -- --network <network>` to print the latest emergency stop instructions and Safe transactions.
3. Notify the Validator Council using the escalation tree in [`docs/system-pause.md`](system-pause.md) and halt new job intake until the remediation checklist is complete.
4. Resume the verification suite from step 1 once fixes land on `main` and the `ci (v2)` workflow returns to green.

---

## 5. Maintenance expectations

- Update this suite whenever new scripts, modules, or governance requirements change the verification flow.
- Cross-reference updates against [`docs/documentation-maintenance-playbook.md`](documentation-maintenance-playbook.md) to ensure review, approvals, and change tickets are logged.
- During audits, reviewers must confirm that the suite version hash matches the commit included in the release candidate tag.

Keeping this verification suite current guarantees that institutional reviewers, regulators, and the contract owner can reproduce deployment evidence on demand while maintaining total control over the AGI Jobs platform.
