# Zenith Sapience Planetary Operating System – Owner Control Matrix

The AGI Jobs v0 (v2) contracts remain entirely owner-driven. This dossier enumerates every control lever required for the **Zenith Sapience Planetary Operating System** demonstration and links each lever to the existing repository scripts.

---

## 1. Governance Authorities

| Capability | Contract / Script | Description |
| --- | --- | --- |
| Global pause / resume | `SystemPause` via `npm run owner:system-pause` | Immediately halts or resumes all marketplace activity. Requires owner/multisig signatures. |
| Treasury management | `StakeManager`, `JobRegistry`, `RewardEngineMB` via Hardhat tasks | Owner adjusts treasury addresses, reward splits, and slashing parameters. |
| Policy updates | `AGIGovernor` timelock | Proposals queued through quadratic voting with a 7-day delay. |
| Identity enforcement | `IdentityRegistry` via `npm run owner:identity-registry` | Register, update, or revoke ENS-bound identities for agents and validators. |
| Thermostat steering | `scripts/v2/updateThermodynamics.ts` | Adjusts incentive temperatures and validator/agent splits per epoch. |

---

## 2. Parameter Adjustment Workflow

1. Review the latest `reports/zenith-planetary-os/parameter-matrix.md`.
2. Draft changes and capture multisig approvals.
3. Apply updates using:
   ```bash
   npx hardhat run scripts/v2/updateThermodynamics.ts --network <target>
   ```
4. Confirm the resulting deltas in `thermodynamics.json`.
5. Regenerate dashboards:
   ```bash
   npm run owner:parameters -- --network <target> --format markdown --out reports/zenith-planetary-os/parameter-matrix.md
   npm run owner:mission-control -- --network <target> --format markdown --out reports/zenith-planetary-os/mission-control.md --bundle reports/zenith-planetary-os/mission-bundle
   ```
6. Archive artefacts and distribute to stakeholders.

---

## 3. Emergency Pause Runbook

1. Execute `npm run owner:system-pause -- --network <target> --action pause`.
2. Ensure `mission-control.md` reflects `status: paused`.
3. Broadcast pause confirmation to all agent operators.
4. Investigate incident; apply fixes via governance proposals or direct owner calls as appropriate.
5. Resume by executing `npm run owner:system-pause -- --network <target> --action unpause`.
6. Capture the event timeline with `npm run owner:command-center -- --network <target> --format markdown --out reports/zenith-planetary-os/command-center.md`.

---

## 4. Identity & Role Management

- All actors must hold ENS subdomains (e.g., `zenith.os.orchestrator.world.agi.eth`).
- Use `npm run owner:identity-registry -- --network <target> --list` to audit current registry entries.
- To onboard a new agent or validator:
  1. Register the ENS name.
  2. Execute `npm run owner:identity-registry -- --network <target> --set <ens> <address> <role>`.
  3. Update the relevant section of `project-plan.json` and circulate to stakeholders.
- To revoke access: call the same script with `--clear` and ensure the change is mirrored in mission dashboards.

---

## 5. Treasury & Budget Oversight

- Budget allocations are defined in `project-plan.json`. Changes require council approval.
- Treasury address overrides are performed via Hardhat tasks in `scripts/v2`. Use `npx hardhat run scripts/v2/setTreasury.ts --network <target> --treasury <address>` when re-pointing the treasury.
- For slashing or reward adjustments, operate `RewardEngineMB` functions via the provided CLI wrappers or Hardhat scripts. Document every change in `command-center.md`.

---

## 6. Timelock Governance Operations

- Proposals are constructed off-chain, then submitted with the `AGIGovernor` front-end or CLI.
- Required quorum: 23% of total voting power.
- Proposal threshold: 1,750,000 $AGIALPHA equivalent.
- Execution delay: 7 days. During this window, the SystemPause remains available for emergency intervention.
- Post-execution, regenerate `mission-control.md` and `summary.md` to capture the new system state.

---

## 7. Compliance & Audit Trail

- Ensure every owner action is reflected in `command-center.md`. The deterministic demo scripts append entries when they detect owner CLI invocations.
- Hash artefacts (`summary.md`, `mission-control.md`, `thermodynamics.json`) using `npm run audit:hash -- reports/zenith-planetary-os` and store hashes on-chain or in the audit ledger.
- Review the GitHub Actions artefacts from `.github/workflows/demo-zenith-sapience-planetary-os.yml` for immutable CI traces.

---

With these controls, the owner maintains absolute authority over the Zenith Sapience Planetary Operating System while benefiting from the autonomous intelligence of the AGI Jobs v0 (v2) stack.
