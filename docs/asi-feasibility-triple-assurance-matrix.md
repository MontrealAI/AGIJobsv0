# ASI Feasibility Triple-Assurance Matrix

> **Purpose:** Provide an institutional-grade control matrix that triple-checks every
> pillar from *Achieving ASI with Meta-Agentic Program Synthesis and α-AGI
> Architecture* against on-chain enforcement, operational guardrails, and
> reproducible verification commands. Use this document together with the
> verification suite and owner-control playbooks before approving production
> changes.

---

## 1. Control matrix

| Pillar | Smart-contract enforcement | Operational guardrail | Verification command |
| --- | --- | --- | --- |
| **Collective second-order intelligence** | Orchestrator endpoints expose a planner → simulator → runner flow that the sovereign agent and humans can supervise in real time.【F:docs/orchestration.md†L1-L28】 | Continuous-learning pipeline records every execution, sandbox, and identity update so reviewers can audit emergent behaviour before redeploying agents.【F:docs/continuous-learning.md†L1-L74】 | `npm run onebox:server` (launch the orchestrator) plus `curl -sS localhost:8080/onebox/plan` / `simulate` / `execute` – archive the transcript alongside `storage/learning/records.jsonl`. |
| **Open-ended self-improvement** | JobRegistry governance setters allow the owner to swap validation, dispute, reputation, and audit modules without redeploying the marketplace, keeping the evolution loop configurable.【F:contracts/v2/JobRegistry.sol†L1091-L1166】 | Owner control guides walk non-technical staff through dry runs, Safe bundles, and audit logging whenever parameters or modules change.【F:docs/owner-control-non-technical-guide.md†L1-L170】 | `npm run owner:wizard -- --network <network>` followed by `npm run owner:wizard -- --network <network> --execute --receipt reports/<network>/owner-wizard.json` – countersign the diff in the change ticket. |
| **Decentralised compute & fault tolerance** | SystemPause lets governance halt or resume every pausable module in a single call and refuses miswired modules.【F:contracts/v2/SystemPause.sol†L15-L199】 | Node operator runbook provides browser-only instructions for pausing sponsored operations, topping up gas, and exporting receipts so operators can enforce throttles without CLI access.【F:docs/node-operator-runbook.md†L1-L52】 | `npm run pause:test -- --network <network> --json > reports/<network>-pause.json` – confirm the JSON captures pause/unpause proofs and store it with the operator log. |
| **Economic drive & alignment** | RewardEngineMB exposes governance-only setters for role shares, μ, κ, treasury, and oracle wiring, enabling thermodynamic tuning under owner control.【F:contracts/v2/RewardEngineMB.sol†L150-L231】 | Thermodynamics playbooks mandate reporting and baseline comparisons before modifying incentives, keeping finance and governance in sync.【F:docs/thermodynamics-operations.md†L1-L120】 | `THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermo.md npm run thermodynamics:report -- --network <network>` – diff against the finance baseline and attach both artefacts. |
| **Governance & safety guardrails** | SystemPause plus module ownership hand-offs ensure only the governance address can pause, update modules, or refresh pausers.【F:docs/system-pause.md†L1-L90】 | Owner control verification suite enforces triple-signoff (doctor → verify-control → command-center) before executing privileged calls.【F:docs/asi-feasibility-verification-suite.md†L12-L86】 | `npm run owner:doctor -- --network <network> --strict --json > reports/<network>-owner-doctor.json` followed by `npm run owner:verify-control -- --network <network> > reports/<network>-owner-proof.md`. |
| **Production CI enforcement** | Branch protection requires the full `ci (v2)` context set plus companion workflows so regressions surface on every PR.【F:docs/v2-ci-operations.md†L1-L132】 | Production readiness index mandates triple verification and artefact retention for every CI run and deployment rehearsal.【F:docs/production/deployment-readiness-index.md†L1-L120】 | `gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}' > reports/branch-protection.json` – include the JSON in the release ticket with the latest green workflow URL. |
| **Owner authority over parameters** | JobRegistry, StakeManager, and related modules guard setters with `onlyGovernance`, keeping tax, treasury, stake, and identity configuration under explicit owner control.【F:contracts/v2/JobRegistry.sol†L471-L620】【F:contracts/v2/JobRegistry.sol†L1091-L1166】 | Owner configurator playbook documents how to encode, batch, and audit setter calls without Solidity expertise.【F:docs/owner-control-parameter-playbook.md†L1-L63】 | `npm run owner:parameters -- --network <network> > reports/<network>-parameter-matrix.md` – ensure the output matches intended policy before merging configuration PRs. |

> **Triple verification rule:** For every row, collect (1) command output, (2) independent reviewer signature, and (3) external evidence (Etherscan link, Safe bundle, or dashboard screenshot). No change reaches production until all three artifacts are recorded in the governance vault.

---

## 2. Multi-angle validation workflow

1. **Static analysis sweep** – Run `npm run lint:ci`, `npm test`, `npm run coverage`, and `forge test -vvvv --ffi --fuzz-runs 256` locally before opening a PR. These commands mirror the CI v2 fan-out described in the operations guide so discrepancies surface early.【F:docs/v2-ci-operations.md†L52-L111】
2. **Operational drills** – Execute the owner doctor, pause test, and thermodynamics report commands for the target network. Archive every JSON/Markdown artefact under `reports/<network>/` with timestamps. Cross-reference the readiness index to confirm each capability is green before sign-off.【F:docs/production/deployment-readiness-index.md†L1-L120】
3. **Owner change rehearsal** – Use the owner wizard or configurator workflow in dry-run mode, then replay in execute mode only after stakeholders countersign the diff, following the non-technical guide’s zero-downtime pattern.【F:docs/owner-control-non-technical-guide.md†L64-L170】
4. **External verification** – Probe branch protection contexts through the GitHub CLI, verify SystemPause wiring on-chain (Etherscan or Safe transaction simulation), and attach screenshots or attestations to the change ticket. These third-party checks close the loop between source control, runtime controls, and governance evidence.

---

## 3. Escalation and remediation

- If any verification command fails, immediately log the console output, generated artefacts, and timestamp in `docs/owner-control-change-ticket.md`. Follow the escalation procedure in the verification suite before attempting another run.【F:docs/asi-feasibility-verification-suite.md†L97-L156】
- Trigger `SystemPause.pauseAll()` or `npm run owner:emergency -- --network <network>` when production safety is at risk. Resume only after the triple assurance matrix returns to green for the affected pillars.【F:docs/system-pause.md†L52-L78】【F:docs/asi-feasibility-verification-suite.md†L112-L149】

---

## 4. Maintenance expectations

- Update this matrix whenever new modules, governance flows, or CI jobs are added. Pair edits with the documentation maintenance playbook to ensure review, approvals, and audit logging stay synchronized.【F:docs/documentation-maintenance-playbook.md†L1-L52】
- During quarterly audits, auditors must replay one verification command per pillar, capture independent evidence, and countersign the artefact bundle. Record the audit in `docs/owner-control-change-ticket.md` with links to the generated reports and screenshots.

By enforcing triple-verification across contracts, operations, and external attestations, this matrix keeps AGI Jobs v0 aligned with the ASI feasibility roadmap while ensuring the contract owner retains absolute, documented control over every critical parameter.
