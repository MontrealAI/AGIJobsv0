# Cosmic Omni-Sovereign Symphony Runbook

This runbook sequences the production rollout for the AGI Jobs v0 (v2) global
council. The flow is optimised for executive communications while maintaining
cryptographic rigor.

## 1. Preparation

1. Clone the repository and checkout the release branch.
2. Copy `.env.example` to `.env` and populate RPC URLs, API keys, and the
   production deployer private key (stored in an HSM or secure enclave).
3. Execute `bin/setup.sh` to install dependencies and verify tool versions.
4. Confirm Grafana connectivity by running `bin/bootstrap-dashboard.sh`.

## 2. Pre-flight Verification

1. Run `bin/orchestrate.sh --dry-run` to execute linting, compilation, Hardhat
   tests (`test/v2/GlobalGovernanceCouncil.test.ts`), Foundry fuzzing (optional),
   and to generate a signed execution plan in `logs/execution-plan.json`.
2. Review the generated artefacts with compliance and store them in the
   long-term archive.

## 3. Mainnet Deployment

1. Obtain multi-party approval (record in `logs/approvals.md`).
2. Execute `bin/deploy-mainnet.sh`. The script performs:
   - Gas estimation and risk confirmation.
   - Contract deployment and event logging.
   - Post-deployment verification through Etherscan (if API key provided).
3. Capture the transaction hash and update `logs/mainnet-deployment.json`.

## 4. Post-Deployment Actions

1. Run `bin/seed-governance.sh` to register nations and seed the initial mandate
   according to `config/multinational-governance.json`.
2. Broadcast dashboards and share `docs/briefing-template.md` with each nation.
3. Initiate the real-time data exporters (see `docs/observability-playbook.md`).
4. Schedule a retrospective and ensure runbook updates are versioned.

## 5. Incident Management

- Trigger `bin/pause-governance.sh` if anomalous behaviour is detected.
- Use `bin/export-ledger.sh` to snapshot votes and state for forensic analysis.
- Coordinate cross-nation comms via the contact tree defined in
  `docs/multi-nation-contact-matrix.md`.

## 6. Continuous Improvement

- Submit improvement proposals through the AGI Jobs governance portal.
- Update `config/multinational-governance.json` for parameter changes and commit
  to version control for audit traceability.

