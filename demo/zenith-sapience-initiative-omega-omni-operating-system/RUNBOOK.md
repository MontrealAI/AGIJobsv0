# Omega Omni Operating System Runbook

This runbook converts the Omega Omni Operating System demo into a copy/paste ritual for non-technical stewards. Every command is already bundled into `package.json` or the Hardhat/Foundry toolchain; simply follow the checklists in order.

## 1. Prepare the Console (≈10 minutes)

1. **Clone & bootstrap**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm install
   ```
2. **Copy environment template**
   ```bash
   cp deployment-config/oneclick.env.example deployment-config/oneclick.env
   ```
   Populate RPC URLs, private keys, and telemetry webhooks as documented in `docs/owner-control-master-checklist.md`.
3. **Verify toolchain integrity**
   ```bash
   npm run ci:verify-toolchain
   npm run ci:verify-signers
   ```
   These scripts confirm that Node.js, Foundry, and signer manifests match the locked versions expected by CI.

## 2. Stage the Contracts (≈15 minutes)

1. **Compile**
   ```bash
   npm run compile
   ```
   Generates Solidity artefacts and TypeScript constants required by the demos.
2. **Render control surface**
   ```bash
   npm run owner:surface -- --network localhost --out runtime/omega-surface.md
   npm run owner:doctor -- --network localhost --json --out runtime/omega-doctor.json
   ```
   These baseline reports mirror the production change-management workflow.
3. **Launch local devnet**
   ```bash
   npx hardhat node --hostname 0.0.0.0
   ```
   Keep this terminal open; subsequent steps assume RPC access at `http://127.0.0.1:8545`.

## 3. Execute the Demo (≈30 minutes)

1. **Deploy via one-click stack**
   ```bash
   npm run deploy:oneclick:auto -- --network localhost --deployment-output runtime/omega-oneclick.json
   ```
   The script wraps `scripts/v2/oneclick-stack.ts` to deploy the core protocol, stake manager, fee pool, and thermostat in a single transaction plan.
2. **Prime identity registry**
   ```bash
   npm run identity:update -- --network localhost --json | tee runtime/omega-identity.json
   ```
   Syncs ENS metadata to the deployed `IdentityRegistry` using the manifests under `config/identity-registry.*.json` and captures the summary to `runtime/omega-identity.json`.
3. **Run the ASI take-off loop**
   ```bash
   npm run demo:asi-takeoff:local
   ```
   Executes `demo/asi-takeoff/bin/asi-takeoff-local.sh`, which spins up the orchestrator planner, posts jobs, settles rewards, and emits aurora artefacts under `reports/`.
4. **Replay the flagship Zenith governance scenario**
   ```bash
   npm run demo:zenith-sapience-initiative:local
   ```
   Exercises the planetary governance scripts in `demo/zenith-sapience-initiative-global-governance/bin/` to prove cross-contract integration.

## 4. Governance Oversight (≈20 minutes)

1. **Render mission dashboards**
   ```bash
   npm run owner:dashboard -- --network localhost --out runtime/omega-dashboard.md
   npm run owner:diagram -- --network localhost --out runtime/omega-governance.mmd
   ```
   Produces markdown and Mermaid artefacts summarising contract state and governance topology.
2. **Generate action bundle**
   ```bash
   npm run owner:command-center -- --network localhost --out runtime/omega-command.json
   npm run owner:update-all -- --network localhost --json | tee runtime/omega-plan.json
   ```
   Review both outputs before applying any changes. Append `--execute` to `owner:update-all` once approvals are recorded.
3. **Pause and resume drill**
   ```bash
   npx hardhat run --no-compile scripts/v2/pauseTest.ts --network localhost -- --json > runtime/omega-pause-audit.json
   ```
   Validates governance access to `SystemPause`. Follow the step-by-step commands in `docs/system-pause.md` to call `pauseAll()` and `unpauseAll()` from your multisig or Hardhat console.
4. **Emergency tabletop**
   ```bash
   npm run incident:tabletop
   ```
   Walks through the pre-scripted incident-response simulation to ensure the team can triage disputes, slashing events, or oracle failures.

## 5. Assurance Envelope (≈25 minutes)

1. **Run linting and unit tests**
   ```bash
   npm run lint:ci
   npm test
   ```
2. **Run Foundry fuzzing**
   ```bash
   forge test
   ```
3. **Verify coverage and access control**
   ```bash
   npm run check:coverage
   npm run check:access-control
   ```
4. **Capture observability artefacts**
   ```bash
   npm run observability:smoke > runtime/omega-observability.log
   ```
   Captures metrics probe results to `runtime/omega-observability.log` for archival alongside governance artefacts.

## 6. Archive & Sign-Off

1. **Bundle artefacts**
   ```bash
   tar -czf runtime/omega-bundle.tar.gz runtime/*.md runtime/*.json reports/**/*
   ```
2. **Compute checksums**
   ```bash
   shasum -a 256 runtime/omega-bundle.tar.gz > runtime/omega-bundle.tar.gz.sha256
   ```
3. **Record governance annotation**
   Open the generated dashboards and mission reports, add executive summaries to your change log, and file the checksum references as immutable audit entries.

Following this runbook ensures the Omega Omni Operating System demo can be executed, paused, retuned, and audited by a single operator without writing code.
