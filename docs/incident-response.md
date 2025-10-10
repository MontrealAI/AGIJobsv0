# Incident Response Playbook

> This playbook operationalises the AGI Jobs v0 (v2) security posture for institutional
> operators. It assumes a non-technical incident commander can follow the checklist to
> protect users, pause protocol activity, and coordinate recovery without deploying new
> code. All steps can be executed with the existing owner tooling shipped in this repo.

## 1. Roles & responsibilities

| Role | Primary contact | Backup | Responsibilities |
| --- | --- | --- | --- |
| Incident Commander (IC) | Head of Operations | Security Lead | Owns end-to-end response, declares severity, authorises escalations. |
| Technical Lead (TL) | Lead Protocol Engineer | On-call Engineer | Performs blockchain triage, executes pause / upgrade actions through the owner command suite. |
| Communications (COMMS) | Head of Comms | Legal Lead | Owns stakeholder comms, publishes notices, coordinates with exchanges & regulators. |
| Forensics (FORENSICS) | Security Engineer | External IR Retainer | Captures on-chain / off-chain evidence, preserves artefacts for post-mortem. |
| Treasury (TREASURY) | Finance Lead | Multi-sig Signers | Executes asset freezes, reroutes funds, approves emergency spends. |

Store contact info and secondary channels (Signal, phone) in the encrypted `operations`
password vault referenced in `docs/operations_guide.md`.

## 2. Severity matrix

| Severity | Definition | Required actions |
| --- | --- | --- |
| SEV-1 | Active loss of funds or takeover of admin keys. | Immediate pause, safe-mode execution, regulator notification within 24h. |
| SEV-2 | Critical vulnerability with potential loss of funds, no active exploit. | Pause affected modules, publish pre-incident advisory, initiate hotfix track. |
| SEV-3 | Degraded service (e.g., subgraph lag, oracle delay). | Keep protocol live, initiate remediation ticket, monitor closely. |
| SEV-4 | False positive or informational alerts. | Document and close, verify monitoring calibration. |

The IC declares severity within 10 minutes using evidence from monitoring/alerts and the
`owner:surface` script.

## 3. Activation trigger checklist

1. Incoming alert from Forta, Defender Sentinel, or custom dashboards.
2. Suspicious governance action detected in Safe transaction queue.
3. Public disclosure of vulnerability touching protocol dependencies.
4. Internal detection (e.g., failing invariant tests, abnormal coverage drop).

The first responder pages the IC via the incident paging channel. The IC starts an
incident log (Notion/Google Doc) using the `docs/owner-control-change-ticket.md`
template.

## 4. Immediate containment

1. **Snapshot state** – Run `npm run owner:snapshot` to capture live configuration,
   validator sets, and treasury routing. Store output in `reports/incidents/<date>`. Ensure
   the file is committed to the incident drive, not the git repo.
2. **Assess pause necessity** – TL evaluates whether the threat affects the JobRouter or
   StakeManager. If yes, execute `npm run owner:emergency` and follow prompts to submit a
   Safe transaction bundle. Use multisig or timelock override as described in
   `docs/owner-control-emergency-runbook.md`.
3. **Secure keys** – Validate hardware wallet custody. For suspected key compromise,
   rotate multisig signers immediately using `npm run owner:rotate` (requires preloaded
   Safe bundle).
4. **Notify stakeholders** – COMMS publishes a holding statement to community channels,
   emphasising that contracts may be paused while investigation occurs.

## 5. Investigation workflow

1. **On-chain trace** – Use `scripts/v2/ownerControlDoctor.ts` to inspect module health.
   For SEV-1/2, export contract events around the timeframe and archive them in the
   incident drive.
2. **Log & metric capture** – Pull Prometheus snapshots (`monitoring/alerts.yaml`) and any
   subgraph traces involved.
3. **Forensic bundle** – FORENSICS prepares a package containing:
   - Transaction hashes
   - State diffs (before/after pause)
   - Relevant ABI JSONs (from `reports/artifacts/latest`)
   - Validator responses
4. **Root cause analysis** – TL documents the bug class, reproduction steps, and
   recommended fix. Cross-reference with invariant and fuzzing suites to confirm test
   coverage gap.

## 6. Remediation & recovery

1. **Patch development** – Use a locked-down branch with branch protection overrides
   approved by IC and TL only. Run full CI plus `npm run ci:verify-toolchain` before
   proposing the fix.
2. **Safe-mode operations** – If user withdrawals need to continue while paused, utilise
   the paymaster fallback or manual settlement scripts (`scripts/v2/manual-settlement.ts`).
3. **Upgrade execution** – Deploy hotfix via `scripts/v2/oneclick-stack.ts` in dry-run
   mode first, then the production network with pre-reviewed parameters. Immediately
   verify contracts on Etherscan (CI release workflow does this automatically).
4. **Gradual unpause** – Use staged unpause: first `JobRouter`, then `StakeManager`, then
   ancillary modules, confirming invariants via Foundry tests between each stage.

## 7. Communication timeline

| Time | Action |
| --- | --- |
| +0 min | COMMS posts initial acknowledgement. |
| +15 min | Publish pause status & expected next update. |
| +60 min | Release preliminary findings or confirm investigation ongoing. |
| +24 h | Deliver full incident bulletin with mitigations in progress. |
| Post-resolution | Publish post-mortem and diff for redeployed contracts, referencing SBOM & provenance artefacts. |

All external statements should reference the signed release artefacts (`release.yml`
outputs) to reassure users that binaries are authentic.

## 8. Post-incident checklist

- [ ] Post-mortem published within 5 business days.
- [ ] Invariant tests / fuzzing extended to cover the regression.
- [ ] Monitoring rules tuned to prevent repeat alert fatigue.
- [ ] Treasury reconciled and any compensations executed.
- [ ] Lessons learned incorporated into `docs/owner-control-master-checklist.md`.
- [ ] Update `docs/toolchain-locks.md` if new tooling was introduced during the response.

## 9. Tabletop exercise guidance

Conduct quarterly tabletop drills covering:

1. Compromised validator causing fraudulent job settlements.
2. Governance key loss requiring Safe signer rotation.
3. Chain reorganisation requiring redeployment of oracle attestations.

Record outcomes, improvement actions, and track them in the compliance register.

---

Maintaining this playbook – and re-certifying it after every major release – satisfies the
monitoring and incident-response requirements of the institutional readiness checklist.
