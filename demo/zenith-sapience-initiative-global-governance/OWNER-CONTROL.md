# Zenith Sapience Owner Control Matrix

This dossier catalogues every adjustable parameter surfaced during the Zenith
Sapience Initiative. All commands leverage existing scripts; no bespoke code is
introduced.

## 1. Governance Topology

- **Verify wiring**
  ```bash
  npm run owner:verify-control -- --network hardhat
  ```
- **Render topology diagram**
  ```bash
  ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Owner Topology" \
  ASI_GLOBAL_MERMAID_PATH="reports/zenith-sapience/governance.mmd" \
  npm run owner:diagram -- --network hardhat --format markdown --out reports/zenith-sapience/governance.md
  ```

## 2. System Pause Circuit Breaker

- **Dry-run pause** (prints the Safe transaction plan)
  ```bash
  npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-sapience/command-center.md
  ```
  Follow the generated instructions inside the report to issue `SystemPause.pause()`.
- **Resume** – same command as above; choose the resume action.

## 3. Thermostat & Incentive Steering

- **Inspect current parameters**
  ```bash
  npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-sapience/parameter-matrix.md
  ```
- **Raise global temperature (dry-run)**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.30 \
    --preview
  ```
- **Apply emergency temperature** (requires explicit confirmation)
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.42 \
    --execute
  ```

## 4. Treasury & Rewards

- **Review fee splits and recipients**
  ```bash
  npx hardhat run --no-compile scripts/v2/owner-dashboard.ts --network hardhat
  ```
- **Preview fee redirect**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xTREASURY-NEW \
    --preview
  ```
- **Execute redirect** (after council approval)
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xTREASURY-NEW \
    --execute
  ```

## 5. Identity & Access

- **Update ENS allowlist snapshot**
  ```bash
  npm run identity:update -- --plan reports/zenith-sapience/identity-plan.json
  ```
  Review the plan before running with `--execute`.

## 6. Upgrade Planning

- **Generate Safe transaction bundle**
  ```bash
  npm run owner:plan:safe -- --output reports/zenith-sapience/upgrade-plan.json
  ```
- **Blueprint review**
  ```bash
  npm run owner:blueprint -- --network hardhat --out reports/zenith-sapience/blueprint.md
  ```

## 7. Continuous Assurance

- **Mission Control dashboard refresh**
  ```bash
  npm run owner:mission-control -- --network hardhat --format markdown \
    --out reports/zenith-sapience/mission-control.md \
    --bundle reports/zenith-sapience/mission-bundle \
    --bundle-name zenith-sapience
  ```
- **Pulse telemetry snapshot**
  ```bash
  npm run owner:pulse -- --network hardhat --out reports/zenith-sapience/pulse.json
  ```

> **Reminder:** all state-changing commands require explicit `--execute`. Without it, the
> scripts run in preview mode, emitting signed transaction payloads for multisig review.
