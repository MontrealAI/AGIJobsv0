# ASI Global Take-Off RUNBOOK

This runbook mirrors the deterministic `npm run demo:asi-global` pipeline while allowing
operators to inspect intermediate states on a local fork.

## Prerequisites

- Node.js 20.x, npm, and (optionally) Foundry's `anvil`.
- An environment variable `PRIVATE_KEY` seeded with a funded dev account when running
  against real RPC endpoints (not required for Hardhat/Anvil).

## Procedure

1. **Start the stack**
   ```bash
   npm install
   npm run demo:asi-global:local
   ```
   The helper script launches Anvil (or Hardhat) on `127.0.0.1:8545`, deploys the
   protocol defaults, executes the Aurora/one-box drill, and renders the global report
   bundle to `reports/localhost/asi-global`.

2. **Review artefacts**
   - `receipts/dry-run.json` – Job lifecycle replay
   - `mission-control.md` – Governance dashboard with mermaid call graph
   - `command-center.md` – Parameter control plane with risk posture
   - `parameter-matrix.md` – Update commands for every adjustable subsystem
   - `governance.mmd` – Live Mermaid diagram for embedding in dashboards

3. **Governance exercises**
   - Run `npm run owner:verify-control -- --network localhost` to confirm the owner can
     pause, resume, and retune incentives.
   - Execute `npm run owner:parameters -- --network localhost --format markdown` to
     verify the contract owner can update role weights, thermostat targets, and
     StakeManager policies.

4. **Shut down**
   The helper script automatically terminates the local node.  If you need to stop it
   manually, run `pkill -f "[a]nvil"` or `pkill -f "hardhat node"`.

## Notes

- The runbook never modifies production deployments.  It only touches ephemeral local
  chains.
- All scripts are idempotent; re-running them overwrites previous artefacts.
- Review `demo/asi-global/project-plan.json` to adapt the scenario with new regions or
  governance policies without changing any code.
