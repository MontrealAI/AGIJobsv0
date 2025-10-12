# External Audit & Final Verification Playbook

> **Audience.** Release managers, security leads, and contract owners preparing AGI Jobs v2 for external audit certification and production deployment.
>
> **Outcome.** Every checklist item from the "Recommended Next Coding Sprint: External Audit & Final Verification" mandate is executable with one command or referenced runbook, producing audit-grade artefacts for non-technical reviewers.

## 1. Audit Preparation & Code Freeze

1. **Automated readiness sweep.** Launch `npm run audit:final -- --full` to chain the freeze guard, branch-protection verification, owner control proof, and dossier export into a single, auditable run. Use `npm run audit:final -- --with-owner-check` or `npm run audit:final -- --with-dossier` to run individual heavy steps, and `npm run audit:final -- --dry-run` to preview commands without executing them. Each invocation now writes `reports/audit/final-readiness.json` with commit metadata, options, and per-step results so auditors can diff successive runs without scraping console output.【F:scripts/audit/final-readiness.ts†L1-L305】【F:package.json†L10-L101】
2. **Lock the freeze branch.** Run `npm run audit:freeze` from a clean checkout of `main` to enforce branch parity, clean working tree, and upstream synchronisation. Configure a different branch with `AUDIT_FREEZE_BRANCH=<branch>` or bypass branch enforcement only when mirroring the audit staging branch (`AUDIT_FREEZE_ALLOW_BRANCH=1`).【F:scripts/audit/check-freeze.js†L1-L86】【F:package.json†L10-L101】
3. **Capture the dossier.** Execute `npm run audit:dossier` to export the Slither report, coverage snapshots, dependency audits, and structured logs into `reports/audit` for hand-off to auditors.【F:docs/AUDIT_DOSSIER.md†L3-L92】【F:package.json†L10-L101】
4. **Freeze documentation pointers.** Update the change ticket with the dossier hash and link to the owner audit evidence (`npm run owner:audit -- --network <net>`). Follow the archival flow in the owner audit guide to prevent drift.【F:docs/owner-control-audit.md†L26-L114】
5. **Pause new feature work.** Announce a code-freeze window referencing this playbook. Only emergency fixes with accompanying audit artefacts may merge until auditors sign off.

## 2. Support Auditors & Issue Remediation

* **On-call triage.** Keep the security & governance team on a shared channel with the auditors. Provide the [audit dossier](../AUDIT_DOSSIER.md) and the owner control atlas for protocol architecture context.【F:docs/AUDIT_DOSSIER.md†L3-L206】【F:docs/owner-control-atlas.md†L1-L210】
* **Fast-turn patches.** Treat every audit finding as high severity. Patch using small, reviewable PRs, regenerate the dossier, and attach owner audit outputs to the remediation ticket for a tamper-evident trail.【F:docs/owner-control-change-ticket.md†L1-L119】
* **Regression coverage.** Extend Foundry/Hardhat property tests or add targeted unit tests for each remediation. Re-run `npm run coverage:report` to prove no invariant regressions.【F:test/README.md†L1-L120】【F:package.json†L10-L101】

## 3. Formal Verification of Critical Invariants (Optional)

* **Instrument invariants.** Apply Scribble or Verx annotations around staking, treasury, and pause flows. The invariants documented in the property-based testing suite offer the baseline specification.【F:contracts/v2/StakeManager.sol†L1-L400】【F:contracts/v2/SystemPause.sol†L1-L250】
* **Traceability.** Archive the verification proofs beside the audit dossier. Cross-reference the invariant IDs in the change ticket to make the assurance evidence easy to audit.【F:docs/owner-control-audit.md†L92-L114】

## 4. Testnet Deployment & Dry-Run

1. **Deploy the audited artefacts.** Follow the mainnet deployment runbook on Sepolia/Goerli using the documented scripts (`npm run deploy:oneclick` or `npm run migrate:sepolia`). Capture emitted addresses in the deployment manifest.【F:docs/RUNBOOK.md†L4-L83】【F:docs/deployment-production-guide.md†L118-L158】【F:package.json†L10-L101】
2. **Exercise owner control.** Walk through the owner command centre (`npm run owner:command-center -- --network <net>`), pause/unpause flows (`npm run pause:test`), and parameter updates to demonstrate complete owner authority with audit trails.【F:docs/owner-control-parameter-playbook.md†L1-L86】【F:package.json†L10-L101】【F:contracts/v2/SystemPause.sol†L1-L250】
3. **Scenario validation.** Reproduce the dispute, validation, and staking flows using the orchestrator and CLI scripts. Log results in `reports/<network>/` and attach them to the release verification summary.【F:docs/release-explorer-verification.md†L21-L110】【F:docs/production-deployment-handbook.md†L204-L208】

## 5. Post-Audit Hardening & Sign-Off

* **Configuration parity.** Compare multisig, timelock, and treasury addresses against the governance manifests before mainnet promotion. Use `npm run owner:verify-control` to confirm on-chain state matches the approved configuration.【F:package.json†L10-L101】【F:docs/owner-control-verification.md†L3-L88】
* **Monitoring updates.** Run `npm run monitoring:validate` and refresh the sentinel dashboards to ensure alerts cover any new runtime checks recommended by auditors.【F:package.json†L10-L101】【F:monitoring/prometheus/rules.yaml†L1-L33】
* **Final approval.** Once auditors clear all findings, lift the code freeze via a signed change-ticket entry and tag the release with the manifest, dossier, and verification outputs bundled for institutional compliance.【F:docs/release-manifest.md†L3-L86】【F:docs/owner-control-zero-downtime-guide.md†L47-L206】

---

By following this playbook the protocol team guarantees an auditable, repeatable pathway from code-freeze to post-audit hardening, matching institutional expectations for production readiness.
