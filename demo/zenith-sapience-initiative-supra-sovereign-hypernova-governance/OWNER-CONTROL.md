# Hypernova Owner Control Matrix

This dossier catalogues every adjustable parameter surfaced during the Supra-Sovereign
Hypernova drill. All commands rely on existing repository scripts; no new code paths are
introduced.

## 1. Governance Topology

- **Verify wiring**
  ```bash
  npm run owner:verify-control -- --network hardhat
  ```
- **Render topology diagram**
  ```bash
  ASI_GLOBAL_MERMAID_TITLE="Hypernova Governance Topology" \
  ASI_GLOBAL_MERMAID_PATH="reports/zenith-hypernova/governance.mmd" \
  npm run owner:diagram -- --network hardhat --format markdown --out reports/zenith-hypernova/governance.md
  ```

## 2. System Pause Circuit Breaker

- **Dry-run pause/resume instructions**
  ```bash
  npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-hypernova/command-center.md
  ```
  Follow the generated Safe transaction plan to execute `SystemPause.pause()` or resume.

## 3. Thermodynamic Steering

- **Inspect current parameters**
  ```bash
  npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-hypernova/parameter-matrix.md
  ```
- **Preview emergency temperature increase**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.45 \
    --preview
  ```
- **Execute temperature change (requires explicit confirmation)**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.45 \
    --execute
  ```
- **Restore baseline configuration**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --load config/thermodynamics.json \
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
- **Execute redirect after governance approval**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xTREASURY-NEW \
    --execute
  ```

## 5. Identity & Access

- **Update ENS allowlist snapshot**
  ```bash
  npm run identity:update -- --plan reports/zenith-hypernova/identity-plan.json
  ```
  Inspect the generated diff before applying with `--execute`.

## 6. Validator Operations

- **Rotate validator delegates**
  ```bash
  npm run owner:rotate -- --network hardhat --plan demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/project-plan.json
  ```
- **Trigger dispute rehearsal**
  ```bash
  npm run disputes:sim -- --network hardhat
  ```

## 7. Upgrade Planning

- **Generate Safe transaction bundle**
  ```bash
  npm run owner:plan:safe -- --output reports/zenith-hypernova/upgrade-plan.json
  ```
- **Blueprint review**
  ```bash
  npm run owner:blueprint -- --network hardhat --out reports/zenith-hypernova/blueprint.md
  ```

## 8. Continuous Assurance

- **Mission Control dashboard refresh**
  ```bash
  npm run owner:mission-control -- --network hardhat --format markdown \
    --out reports/zenith-hypernova/mission-control.md \
    --bundle reports/zenith-hypernova/mission-bundle \
    --bundle-name zenith-hypernova
  ```
- **Pulse telemetry snapshot**
  ```bash
  npm run owner:pulse -- --network hardhat --out reports/zenith-hypernova/pulse.json
  ```

> **Reminder:** Every state-changing command demands explicit confirmation (`--execute`).
> Without it, scripts run in preview mode and output Safe transaction data for multisig
> review, keeping the owner in full control.
