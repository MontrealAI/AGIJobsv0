# Celestial Archon Owner Control Matrix

This dossier enumerates every adjustable parameter exposed during the Celestial
Archon demonstration. Each command is an existing AGI Jobs v0 (v2) script —
no bespoke tooling required.

## 1. Governance Topology

- **Verify wiring**
  ```bash
  npm run owner:verify-control -- --network hardhat
  ```
- **Render topology diagram**
  ```bash
  ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Celestial Archon Topology" \
  ASI_GLOBAL_MERMAID_PATH="reports/zenith-celestial-archon/governance.mmd" \
  npm run owner:diagram -- --network hardhat --format markdown --out reports/zenith-celestial-archon/governance.md
  ```

## 2. System Pause Circuit Breaker

- **Dry-run pause/resume flow**
  ```bash
  npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-celestial-archon/command-center.md
  ```
  Follow the generated plan to invoke `SystemPause.pause()` or `SystemPause.resume()`.

## 3. Thermostat & Incentive Steering

- **Inspect current parameters**
  ```bash
  npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-celestial-archon/parameter-matrix.md
  ```
- **Raise global temperature (dry-run)**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.36 \
    --preview
  ```
- **Apply emergency temperature**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.48 \
    --execute
  ```

## 4. Treasury & Rewards

- **Review fee splits and recipients**
  ```bash
  npx hardhat run --no-compile scripts/v2/owner-dashboard.ts --network hardhat
  ```
- **Preview treasury redirect**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xTREASURY-NEW \
    --preview
  ```
- **Execute redirect (after multisig approval)**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xTREASURY-NEW \
    --execute
  ```

## 5. Identity & Access Management

- **Update ENS/Identity registry snapshot**
  ```bash
  npm run identity:update -- --plan reports/zenith-celestial-archon/identity-plan.json
  ```
  Inspect the generated plan before invoking with `--execute`.

## 6. Upgrade Planning & Safeguards

- **Generate Safe transaction bundle**
  ```bash
  npm run owner:plan:safe -- --output reports/zenith-celestial-archon/upgrade-plan.json
  ```
- **Blueprint review**
  ```bash
  npm run owner:blueprint -- --network hardhat --out reports/zenith-celestial-archon/blueprint.md
  ```

## 7. Continuous Assurance

- **Refresh Mission Control dashboard**
  ```bash
  npm run owner:mission-control -- --network hardhat --format markdown \
    --out reports/zenith-celestial-archon/mission-control.md \
    --bundle reports/zenith-celestial-archon/mission-bundle \
    --bundle-name zenith-celestial-archon
  ```
- **Pulse telemetry snapshot**
  ```bash
  npm run owner:pulse -- --network hardhat --out reports/zenith-celestial-archon/pulse.json
  ```

> **Reminder:** all state-changing commands require explicit `--execute`. Without
> it, scripts emit preview payloads for multisig review, preserving owner
> supremacy at every checkpoint.
