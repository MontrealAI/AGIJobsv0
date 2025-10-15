# Zenith Sapience – Transcendent Owner Control Matrix

This matrix provides copy/paste commands for the contract owner (or owner
multisig) to supervise every facet of the Transcendent Governance Overview. Each
command references existing scripts – no new executables are introduced.

## 1. Governance & Identity

- **Verify owner supremacy**
  ```bash
  npm run owner:verify-control -- --network hardhat
  ```
- **Render updated topology diagram**
  ```bash
  ASI_GLOBAL_MERMAID_TITLE="Zenith Sapience Transcendent Topology" \
  ASI_GLOBAL_MERMAID_PATH="reports/zenith-sapience-transcendent/governance.mmd" \
  npm run owner:diagram -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/governance.md
  ```
- **Refresh ENS allowlist plan**
  ```bash
  npm run identity:update -- --plan reports/zenith-sapience-transcendent/identity-plan.json
  ```
  Append `--execute` only after reviewing the generated plan.

## 2. System Pause & Emergency Brake

- **Generate pause instructions (dry-run)**
  ```bash
  npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/command-center.md
  ```
  Follow the Markdown instructions to sign the Safe transaction that calls
  `SystemPause.pause()`.
- **Resume operations** – rerun the command centre workflow and choose the resume
  option.

## 3. Thermostat & Incentive Controls

- **Snapshot current parameters**
  ```bash
  npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/parameter-matrix.md
  ```
- **Preview targeted temperature change**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.30 \
    --preview
  ```
- **Escalate to emergency temperature** (requires explicit approval)
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --temperature 0.42 \
    --execute
  ```
- **Restore baseline from config**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts \
    --network hardhat \
    --load config/thermodynamics.json \
    --execute
  ```

## 4. Treasury Direction & Rewards

- **Review current fee split and recipients**
  ```bash
  npx hardhat run --no-compile scripts/v2/owner-dashboard.ts --network hardhat
  ```
- **Preview treasury redirect**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xZENITH-TREASURY-NEW \
    --preview
  ```
- **Execute redirect (post-multisig sign-off)**
  ```bash
  npx hardhat run --no-compile scripts/v2/updateFeePool.ts \
    --network hardhat \
    --treasury 0xZENITH-TREASURY-NEW \
    --execute
  ```

## 5. Mission Operations & Reporting

- **Regenerate Mission Control dossier**
  ```bash
  npm run owner:mission-control -- --network hardhat --format markdown \
    --out reports/zenith-sapience-transcendent/mission-control.md \
    --bundle reports/zenith-sapience-transcendent/mission-bundle \
    --bundle-name zenith-sapience-transcendent
  ```
- **Capture thermodynamics telemetry**
  ```bash
  npm run owner:pulse -- --network hardhat --out reports/zenith-sapience-transcendent/pulse.json
  ```
- **Regenerate parameter matrix**
  ```bash
  npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/parameter-matrix.md
  ```

## 6. Upgrade Planning & Safe Bundles

- **Produce Safe transaction set for upgrades**
  ```bash
  npm run owner:plan:safe -- --output reports/zenith-sapience-transcendent/upgrade-plan.json
  ```
- **Summarise blueprint**
  ```bash
  npm run owner:blueprint -- --network hardhat --out reports/zenith-sapience-transcendent/blueprint.md
  ```

> **Important:** Any command without `--execute` remains a preview. Execute only
> after the multisig quorum has reviewed the generated payloads and artefacts.
