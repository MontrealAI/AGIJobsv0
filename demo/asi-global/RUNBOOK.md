# ASI Global Take-Off RUNBOOK

This runbook mirrors the deterministic `npm run demo:asi-global` pipeline while allowing
operators to inspect intermediate states on a disposable local chain.

## Prerequisites

- Node.js 22.23.3, npm 10.8.2, and (optionally) Foundry's `anvil`.
- No funded wallet or provider credentials are needed by this disposable local launcher.
- Follow [the local walkthrough](README.md#run-the-local-mission) first; reviewed live deployments use the production runbooks.

## Procedure

1. **Start the stack**
   ```bash
   npm ci
   npm run demo:asi-global:local
   ```
   The helper script launches Anvil (or Hardhat) on `127.0.0.1:8545`, deploys the
   protocol defaults, executes the Aurora/one-box drill, and renders the global report
   bundle to `reports/localhost/asi-global`.

2. **Review artefacts**
   - `receipts/mission.json` and `receipts/jobs/<slug>/` – actual local job lifecycle and settlement receipts
   - `mission-control.md` – Governance dashboard with mermaid call graph
   - `command-center.md` – Parameter control plane with risk posture
   - `parameter-matrix.md` – Update commands for every adjustable subsystem
   - `governance.mmd` – Live Mermaid diagram for embedding in dashboards

3. **Governance exercises**
   The local helper has stopped its node by the time it returns. These advanced
   commands require a separately managed local deployment; use the retained
   `receipts/governance.json` to inspect the completed local governance drill.
   - Run `npm run owner:verify-control -- --network localhost` to confirm the owner can
     pause, resume, and retune incentives.
   - Execute `npm run owner:parameters -- --network localhost --format markdown` to
     verify the contract owner can update role weights, thermostat targets, and
     StakeManager policies.

4. **Shut down**
   The helper stops only the node it started. Press Ctrl+C in its terminal to interrupt it. Choose another `DEMO_PORT` if a different service occupies 8545; do not stop unrelated nodes.

## Notes

- The runbook never modifies production deployments.  It only touches ephemeral local
  chains.
- All scripts are idempotent; re-running them overwrites previous artefacts.
- The deployment and mission receipts record the modules that actually ran. Thermostat adjustments are reported as skipped when that optional module is not deployed.
- Review `demo/asi-global/project-plan.json` to adapt the scenario with new regions or
  governance policies without changing any code.
