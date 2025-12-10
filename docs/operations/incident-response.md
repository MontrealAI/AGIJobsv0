# Incident Response Playbooks

This runbook codifies the response procedures that the AGI Jobs owner team must
follow for production incidents. It is designed so a non-technical operator can
orchestrate mitigations while coordinating with engineering, security, and
stakeholder teams. Every step references existing tooling and scripts already in
this repository to ensure responses are deterministic and auditable.

## Roles & Responsibilities

| Role | Primary responsibilities |
| ---- | ------------------------ |
| **Incident Commander (IC)** | Owns overall response, declares severity, tracks progress, approves recovery. |
| **Owner Console Operator** | Executes on-chain mitigations using the owner console scripts in `scripts/v2`. |
| **Security Liaison** | Interfaces with external partners (exchanges, auditors, monitoring providers) and coordinates disclosures. |
| **Comms Lead** | Manages internal and external communications, prepares stakeholder updates, coordinates with legal. |

> ℹ️ **Staffing rule:** The IC and Owner Console Operator must be different
> individuals to guarantee dual-control on privileged operations.

## Severity Levels

1. **SEV-0 Critical** – Active loss of funds, protocol integrity compromised, or
   admin key compromise. Requires immediate pause and global notification.
2. **SEV-1 High** – High likelihood of loss (e.g., critical vulnerability with
   no exploit yet), major subsystem outage, or monitoring alert showing
   anomalous slashing / treasury drain.
3. **SEV-2 Medium** – Degraded performance, delayed job finalization, or limited
   validator participation without user loss.
4. **SEV-3 Low** – Cosmetic issues, documentation gaps, or monitoring noise.

The IC must document the severity decision in the shared incident channel and in
`reports/incident-log.md` (create if missing).

## Core Response Flow

1. **Detect & Confirm** – Validate the alert from Forta, Defender Sentinel, or
   internal dashboards. Pull transaction hashes, block numbers, and triggered
   monitor IDs.
2. **Stabilize** – Decide whether to pause affected contracts or modules. For
   SEV-0/SEV-1 incidents, execute the Pauser playbook immediately.
3. **Communicate** – Page the on-call bridge (Slack + PagerDuty), notify the
   multisig signers, and publish a short status message in the public status
   page. Keep updates every 15 minutes for SEV-0/1 incidents.
4. **Remediate** – Apply the relevant runbook (below). Ensure every on-chain
   transaction is executed through the documented scripts for reproducibility.
5. **Recover** – Once mitigations are confirmed, coordinate sign-off with all
   responders and transition to a post-incident review within 48 hours.

## Runbook: Pausing & Circuit Breakers

**Objective:** Stop protocol activity to contain impact.

1. IC assigns Owner Console Operator and confirms severity.
2. Operator runs `npm run owner:emergency` to generate the pause transaction
   bundle for all critical modules (StakeManager, JobRegistry, FeePool,
   Thermostat, Router). This script outputs JSON instructions and Safe payloads.
3. If the Gnosis Safe is used, load the bundle and ensure at least the required
   quorum signs. Otherwise, execute via the owner EOA in order:
   - `npx hardhat run --no-compile scripts/v2/pauseTest.ts --network <network>`
   - `npx hardhat run --no-compile scripts/v2/updateRewardEngine.ts --pause`
4. Confirm pause events via `npm run owner:dashboard` and by checking emitted
   `Paused` logs in the explorer.
5. Update monitoring runbooks to silence expected alerts.

## Runbook: Owner / Multisig Key Compromise

1. Trigger SEV-0.
2. Execute the Pausing runbook.
3. Run `npm run owner:rotate` to rotate governance ownership to the designated
   backup Safe (the script outputs proposed transactions and target addresses).
4. Use `npm run owner:plan:safe` to regenerate role assignments and distribute
   to signers. Require at least two independent confirmations of new control.
5. Coordinate with infrastructure team to rotate API keys, RPC credentials, and
   revoke compromised hardware wallet access.
6. Publish an initial disclosure within one hour, outlining impact and next
   steps. Escalate to legal/compliance as needed.

## Runbook: Critical Vulnerability Discovered (Unexploited)

1. Classify as SEV-1 (upgrade to SEV-0 if exploitation is imminent).
2. Convene war room and run Pausing runbook if the vulnerability affects live
   funds or allows governance bypass.
3. Execute `npm run owner:doctor` and `npm run owner:audit` to baseline
   current configuration and detect unexpected drifts.
4. Draft patch in an isolated branch. Run full CI (including fuzz and invariants)
   and capture the SBOM + provenance artifact.
5. Deploy fix using `npm run deploy:oneclick:wizard` or the targeted upgrade
   script, depending on scope. Verify on Etherscan automatically via the
   release workflow.
6. Resume operations only after: (a) multisig approval, (b) monitoring alerts
   return to normal, (c) post-remediation tests pass.

## Runbook: User Funds At Risk / Job Escrow Failure

1. Treat as SEV-0 if loss is possible; otherwise SEV-1.
2. Pause StakeManager and JobRegistry using the Pausing runbook.
3. Use `npx hardhat run --no-compile scripts/v2/ownerControlSurface.ts` to list
   all active escrows and validator locks.
4. For each affected job ID, execute
   `npx hardhat run --no-compile scripts/v2/updateAllModules.ts --job <id> --force-refund`
   to refund employers and agents when safe.
5. Coordinate with dispute moderators to resolve any outstanding arbitrations.
6. Resume modules gradually and monitor `FeePool` for abnormal withdrawals.

## Monitoring & Verification Checklist

- Subscribe to OpenZeppelin Defender Sentinel alerts for:
  - `pause()` / `unpause()` events
  - Ownership transfers (`OwnershipTransferred`)
  - `setFeePool`, `setGovernance`, `setTaxPolicy`
- Deploy Forta bots (or equivalent) to flag:
  - Sudden drops in total stake (`StakeManager.totalStakes`)
  - Large `FeePool.reward` transfers
  - Unexpected treasury updates
- After every incident, archive logs, RPC traces, and Safe transaction hashes in
  `reports/incidents/<YYYY-MM-DD>-<name>/`.

## Post-Incident Review Template

Within 48 hours of resolution, complete a PIR covering:

1. **Summary** – What happened, timelines, severity.
2. **Root Cause** – Technical and organizational factors.
3. **Mitigations** – Fixes applied, follow-up tasks with owners and deadlines.
4. **Detection Gaps** – Monitoring or alerting improvements required.
5. **Lessons Learned** – Updates to runbooks, simulations, or training needed.

Store the PIR in the incident archive alongside dashboards and logs. Track
follow-up tasks in the engineering backlog with explicit owners and due dates.

## Tabletop Exercises

Run at least one tabletop per quarter covering:

- Pausing and owner rotation scenario
- FeePool reward drain scenario
- Large-scale validator slashing incident

Document outcomes and improvements in `reports/incident-tabletop.md`.

Maintaining rehearsed, script-driven responses is critical for institutional
trust. Review and update this runbook alongside every tagged release.
