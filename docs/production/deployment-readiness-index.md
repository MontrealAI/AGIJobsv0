# AGI Jobs v2 Production Readiness Index

> **Audience:** Executive sponsors, operations leads, compliance reviewers, and contract owners who must certify that AGI Jobs v2 is deployable on short notice without writing Solidity.
>
> **Goal:** Provide a single, always-current launch dashboard that maps every readiness artifact (tests, CI, configuration, owner controls, and incident tooling) to the command or document that proves it is green. Pair this index with the [α-AGI meta-agentic readiness audit](../asi-meta-agentic-readiness.md) when certifying meta-agentic and evolutionary capabilities.

---

## 1. Readiness scoreboard

| Capability | What must be green | Primary evidence | Independent verification |
| --- | --- | --- | --- |
| **CI v2 enforcement** | `ci (v2)` summary plus fan-out jobs required on `main` | [`docs/v2-ci-operations.md`](../v2-ci-operations.md) checklist | Branch protection API probe:<br>`gh api repos/:owner/:repo/branches/main/protection --jq '{required_status_checks: .required_status_checks.contexts}'` |
| **Smart contract quality gates** | Hardhat unit tests, Foundry fuzz, coverage ≥ 90 % | `npm test` → `coverage` → `forge test` sequence | Inspect the latest run under **Actions → ci (v2)** and download `coverage-lcov` |
| **Deployment manifests** | `config/*.json` (and per-network overrides) synced with deployed addresses | `npm run deploy:checklist -- --network <network>` | Compare `deployment/deployment-<network>.json` with [docs/deployment-addresses.md](../deployment-addresses.md) |
| **Owner control authority** | Governance keys can mutate every adjustable parameter | `npm run owner:doctor -- --network <network>` | Run `npm run owner:verify-control -- --network <network>` and file the Markdown proof in `reports/` |
| **Pause & recovery drills** | SystemPause wiring proves the owner can halt/unhalt every module | `npm run pause:test -- --network <network> --json` (simulated) | Manual spot check on Etherscan `SystemPause` write tab using hardware wallet |
| **Economics calibration** | Thermodynamic constants, fee splits, burn percentages match governance policy | `THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/<network>-thermodynamics.md npm run thermodynamics:report -- --network <network>` | Cross-verify with finance-approved baseline in `reports/<network>-economics-baseline.md` |
| **External observability** | Telemetry exporters, SLO dashboards, alerting integrations online | `npm run observability:smoke` (verifies Prometheus scrape jobs, Alertmanager routes, Grafana dashboards) | Confirm dashboard URLs listed in [`docs/institutional-observability.md`](../institutional-observability.md) respond with 200 |

> **Triple verification rule:** Do not mark a row green until the command succeeds **and** a second human has countersigned the independent verification evidence in the ops vault.

---

## 2. Rapid inspection commands

Run these commands whenever assessing release readiness. They produce machine-readable artefacts that auditors can replay.

```bash
# 1. Sync dependencies and regenerate deterministic artefacts
git fetch origin
npm ci
npm run compile

# 2. Execute the CI-equivalent stack locally
npm run format:check
npm run lint:ci
npm test
npm run coverage
forge test -vvvv --ffi --fuzz-runs 256

# 3. Confirm production manifests align with on-chain state
npm run deploy:checklist -- --network mainnet
npm run owner:doctor -- --network mainnet --strict
npm run owner:plan -- --network mainnet > reports/mainnet-owner-plan.csv
npm run owner:plan:safe -- --network mainnet

# 3b. Prove thermodynamics calibration
THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/mainnet-thermodynamics.md npm run thermodynamics:report -- --network mainnet

# 4. Validate emergency controls
npm run pause:test -- --network mainnet --json > reports/mainnet-pause-verification.json
```

Store every generated report under `reports/` with a timestamped suffix. If any command exits non-zero, log the failure in `docs/owner-control-change-ticket.md` and block release until resolved.

Archive both the human-readable console log and the JSON artefact from `pause:test`. The JSON report captures module ownership,
pauser assignments, and simulated pause/unpause probes so auditors can replay the evidence without rerunning the command.

---

## 3. Non-technical launch script

1. Print the [Non-Technical Mainnet Deployment Runbook](nontechnical-mainnet-deployment.md) and the [Production Deployment Handbook](../production-deployment-handbook.md).
2. Check the CI scoreboard: open GitHub → **Actions → ci (v2)** and confirm the latest run on `main` shows ✅ for **CI summary** and all downstream jobs.
3. Verify branch protection using the GitHub UI (Settings → Branches) **and** the CLI command listed above.
4. From an audited workstation:
   - Run `npm run owner:surface -- --network mainnet` and read the diff aloud with the governance signer.
   - Execute `npm run owner:doctor -- --network mainnet --strict`. Treat any ⚠ as a stop sign until cleared.
   - Export Safe payloads with `npm run owner:plan:safe -- --network mainnet` and circulate for multi-signature approval.
5. Execute the chosen deployment path (Truffle wizard or Etherscan) following [v2 Institutional Deployment Blueprint](v2-institutional-deployment-blueprint.md). Record every transaction hash.
6. Post-deployment, immediately run:
   - `npm run owner:verify-control -- --network mainnet`
   - `npm run wire:verify -- --network mainnet`
   - `THERMO_REPORT_FORMAT=markdown THERMO_REPORT_OUT=reports/mainnet-thermodynamics.md npm run thermodynamics:report -- --network mainnet`
7. Upload artefacts (CSV plans, Safe bundle JSON, reports, and CI screenshots) to the governance document vault. Only then announce go-live.

---

## 4. Continuous assurance cadence

| Cadence | Task | Owner | Evidence |
| --- | --- | --- | --- |
| **Daily** | Review `ci (v2)` run results and remediate failures before 12:00 UTC | Release captain | Link to passing run in ops log |
| **Weekly** | Run `npm run owner:audit -- --network mainnet --out reports/mainnet-owner-audit-<date>.md` | Governance steward | Markdown audit file stored in `reports/` |
| **Monthly** | Rotate signer list and verify against `config/identity-registry.json` | Identity manager | Signed PDF from [owner-control-change-ticket.md](../owner-control-change-ticket.md) |
| **Quarterly** | Full disaster-recovery rehearsal using [docs/disaster-recovery.md](../disaster-recovery.md) | SRE lead | Completed checklist scanned to compliance share |
| **After every change** | Update `docs/deployment-addresses.md` and rerun `npm run deploy:checklist` | Deployment engineer | Commit referencing change ticket |

Document each cadence completion inside the operations tracker and attach supporting artefacts. Missing evidence = not done.

---

## 5. Owner control authority snapshot

Ensure the contract owner retains complete control by confirming the following functions are callable exclusively by the owner (via Safe or hardware wallet):

- `SystemPause.setOperator`, `SystemPause.triggerGlobalPause`, `SystemPause.releaseGlobalPause`.
- `JobRegistry.setFeePct`, `JobRegistry.setTreasury`, `JobRegistry.setEscrowStake`.
- `FeePool.setBurnPct`, `FeePool.setTreasury`, `FeePool.setTreasuryAllowlist`.
- `StakeManager.setMinimumStake`, `StakeManager.setTreasuryAllowlist`, `StakeManager.setTreasury`.
- `RewardEngineMB.setRoleShare`, `RewardEngineMB.setThermostat`, `RewardEngineMB.setEnergyOracle`.
- `EnergyOracle.setSigner`, `EnergyOracle.setQuorum`, `RandaoCoordinator.setWindow`.

Cross-reference [`docs/owner-control-index.md`](../owner-control-index.md) and [`docs/owner-control-parameter-playbook.md`](../owner-control-parameter-playbook.md) for execution detail. If any setter reverts, pause deployments immediately and escalate to governance.

---

### Change log discipline

- Update this index whenever a new module, workflow, or control surface is introduced.
- Link all documentation edits to a tracked change ticket inside `docs/owner-control-change-ticket.md`.
- Run `npm run docs:lint` (if available) or a Markdown linter before merging documentation-only changes to keep formatting consistent.

Maintaining this index alongside the existing runbooks guarantees that the repository stays deployable by non-technical operators while satisfying institutional governance requirements.
