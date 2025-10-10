# One-Click Deployment Guide

This guide walks through the new "one-click" experience for provisioning AGI Jobs v0. The workflow packages every off-chain
component into container images, automates contract deployment, applies secure defaults, and documents the final configuration
so operators can launch safely with minimal manual steps.

## Key Capabilities at a Glance

### Containerized All-in-One Package

- **Pre-built services** – Every off-chain component (orchestrator, APIs, agent/validator gateways, notification collector,
  employer & validator front-ends, paymaster supervisor, mock bundler, etc.) ships with a hardened Dockerfile and is wired
  together through [`compose.yaml`](../../compose.yaml). For Kubernetes adopters, the Compose file translates cleanly to Helm or
  Kustomize using the provided environment variables.
- **Single command bootstrapping** – `npm run deploy:oneclick:auto` optionally invokes `docker compose up` with the generated
  `.env`, so non-technical operators can go from repository clone to a running stack with a single terminal command.
- **Environment-driven configuration** – Containers read secrets and runtime endpoints from `deployment-config/oneclick.env`.
  Operators do not touch per-service config files; updating RPC URLs, API tokens, or contract addresses is achieved by editing
  environment variables only.
- **Consistent volumes** – Compose volumes (for orchestrator history, gateway storage, notification audit logs, etc.) ensure
  state persists across restarts and remain compatible with local development, staging, and production servers.

### Automated Network Configuration

- **Declarative JSON plans** – Deployment parameters (governance multisig, staking economics, ENS roots, validator timing) live
  in `deployment-config/*.json`. The helper scripts load these files and execute the necessary Hardhat tasks without manual
  Solidity interaction.
- **Scripted orchestration** – `npm run deploy:oneclick` deploys the entire contract suite, links modules, seeds ENS data, and
  exports a canonical address book (`deployment-config/latest-deployment.json`). Optional flags let operators skip Compose or
  inject network-specific overrides while still relying on the same automation entry point.
- **Namehash helpers & verification** – CLI helpers compute ENS namehashes and validate configuration before a single
  transaction is broadcast, reducing the likelihood of typo-driven downtime.

### Secure Default Settings

- **Paused by default** – The deployment script toggles `SystemPause.pauseAll()` immediately after module wiring so operators
  must explicitly unpause through governance when they are ready to go live.
- **Conservative limits** – Initial job caps, validator commit/reveal windows, dispute horizons, and stake requirements are
  enforced from the `secureDefaults` block in the JSON config. The provided templates favour short horizons and low ceilings so
  a new network launches in a tightly controlled state.
- **Treasury-first slashing** – `StakeManager` defaults to routing 90% of slashed stakes to the treasury and the remaining 10%
  to the employer, with `validatorSlashRewardPct` disabled. Adjust `treasurySlashPct`, `employerSlashPct`, and
  `validatorSlashRewardPct` in `deployment-config/*.json` before running `npm run deploy:oneclick` if you prefer a 100% treasury
  configuration.
- **Allowlist bootstrapping** – Configuration files capture optional agent/validator allowlists, but the one-click deployment
  does **not** seed them automatically. After contracts are live, sync the desired entries via
  `npm run identity:update -- --network <network>` (or run `scripts/v2/updateIdentityRegistry.ts`) using the
  `config/identity-registry*.json` files so the `IdentityRegistry` reflects your intended allowlists.

### Clear Deployment Guide & Support

- **Non-technical documentation** – Step-by-step walkthroughs in
  [`docs/owner-control-non-technical-guide.md`](../owner-control-non-technical-guide.md),
  [`docs/operations_guide.md`](../operations_guide.md), and the detailed sections below mirror every command emitted by the
  automation scripts, complete with screenshots/log samples.
- **Wizard & prompts** – The deployment wizard verifies the `deployment-config/oneclick.env` file exists, runs
  `npm run deploy:oneclick` under the hood, rewrites the environment file with the emitted addresses, and can trigger Docker
  Compose for you. It expects governance signers, RPC URLs, and other required inputs to already be populated in the config
  files before you launch it, surfacing prompts only for confirmation.
- **Auditable artefacts** – Address books, `.env` files, and Compose overrides are generated automatically and stored under
  version control-friendly paths so operators can file change tickets, share bundles with auditors, or restore systems quickly.

## Prerequisites

1. **Node.js 20.18.1** – install dependencies and run the deployment scripts.
2. **Docker 24+** – build and run the container stack.
3. **Hardhat environment variables** – export a deployer private key (`PRIVATE_KEY`) and Ethereum RPC URL (`HARDHAT_NETWORK`
   or `--network` flag). The deployer must control the governance multisig or temporary owner address defined in your config.
4. **AGIALPHA token** – on production networks the canonical token must already exist. For testing, use Sepolia or a fork.

## Step 1: Prepare configuration

Prefer a guided experience? Run the wizard once you have Node.js and Docker installed:

```bash
npm run deploy:oneclick:wizard -- --config deployment-config/sepolia.json --network sepolia
```

The wizard first checks that `deployment-config/oneclick.env` is present (copying from
the bundled template if necessary), runs the full `npm run deploy:oneclick` flow,
rewrites the environment file with the emitted addresses, and optionally launches
`docker compose` for you. Provide `--yes --compose` to accept all prompts
automatically; add `--env <path>` or `--compose-file <path>` when customising secrets
or Kubernetes translations. Ensure `deployment-config/deployer.sample.json` (or your
environment-specific copy) and `deployment-config/oneclick.env` already contain the
governance, RPC, and credential values the wizard will validate.

Want a single command with no prompts? Use the non-interactive wrapper, which simply
forwards any flags to the wizard but defaults to launching Docker Compose in detached
mode:

```bash
npm run deploy:oneclick:auto -- --config deployment-config/sepolia.json --network sepolia
```

Add `--attach` to stream Compose logs or `--no-compose` if you only need the deployment
artifacts.

1. Review `deployment-config/oneclick.env`, which ships with conservative defaults suitable for local testing. Update RPC URLs,
   API tokens, and address placeholders once contracts have been deployed.

2. Customise `deployment-config/deployer.sample.json` and commit a copy (for example
   `deployment-config/sepolia.json`). Key fields:

   | Field | Description |
   | --- | --- |
   | `network` | Hardhat network key (e.g. `sepolia`, `mainnet`). |
   | `governance` | Address that will control the deployed contracts. |
   | `econ` | Economic parameters for fees, burn, staking, and dispute windows. |
   | `secureDefaults` | Launch-time safety rails (pause state, job caps, validator timing). |
   | `output` | Path that will receive the generated address book (defaults to `deployment-config/latest-deployment.json`). |

## Step 2: Deploy and secure contracts

Run the orchestrated deployment helper. The script prompts for confirmation, executes the Hardhat deployment, and applies the
secure defaults defined in the config file (pause switches, capped rewards, and minimal validator windows).

```bash
npm run deploy:oneclick -- --config deployment-config/sepolia.json --network sepolia --yes
```

Outputs:

- `docs/deployment-addresses.json` – canonical address book (updated in-place).
- `deployment-config/latest-deployment.json` (or the configured `output`) – copy for operators and automation tooling.
- Console log showing each governance action (pausing, job caps, validator windows).

## Step 3: Configure the runtime environment

Update `deployment-config/oneclick.env` with the addresses from `latest-deployment.json`. You can do this automatically with
the helper script:

```bash
npm run deploy:env -- --input deployment-config/latest-deployment.json
```

The script copies values from the deployment artefacts into the environment file while preserving existing comments and
settings. The key variables consumed by the containers are:

- `JOB_REGISTRY`, `STAKE_MANAGER_ADDRESS`, `VALIDATION_MODULE_ADDRESS`, `DISPUTE_MODULE_ADDRESS`, `REPUTATION_ENGINE_ADDRESS`
- `SYSTEM_PAUSE_ADDRESS` (used to unpause later)
- `FEE_POOL_ADDRESS` (lets off-chain services inspect burn/treasury splits)
- `IDENTITY_REGISTRY_ADDRESS` (enables ENS and manual allowlist management tooling)
- `AGIALPHA_TOKEN`, `AGIALPHA_DECIMALS`
- `ONEBOX_API_TOKEN`, `GATEWAY_API_KEY`, `ONEBOX_RELAYER_PRIVATE_KEY`

Commit the updated `.env` file (excluding secrets) or store it in your secrets manager.

## Step 4: Launch the container stack

The entire off-chain stack – orchestrator, meta API, agent/validator gateway, Alpha bridge, notification service, mock AA
providers, and both front-ends – now ships as a Docker Compose bundle.

```bash
docker compose --env-file deployment-config/oneclick.env up --build
```

Services exposed:

| Service | Port | Description |
| --- | --- | --- |
| `meta-api` | 8000 | FastAPI router exposing `/onebox/*` and `/meta-orchestrator` endpoints. |
| `orchestrator` | 8080 | Express orchestrator with policy guardrails and One-Box UX API. |
| `agent-gateway` | 8090 | Agent & validator gateway with telemetry, audit anchoring, and notification hooks. |
| `alpha-bridge` | 50052 | gRPC bridge proxying AGI-Alpha planning endpoints. |
| `notifications` | 8075 | Minimal notification capture service writing JSONL audit logs. |
| `validator-ui` | 3000 | Validator dashboard (Next.js). |
| `enterprise-portal` | 3001 | Employer / enterprise front-end. |
| `bundler`, `paymaster-supervisor`, `attester` | 4337 / 4000 / 7000 | Mock AA infrastructure for local testing. |
| `anvil` | 8545 | Optional local EVM node for rapid iteration. |

Volumes persist orchestrator run history, gateway logs, and notification audit trails under `orchestrator_state`,
`orchestrator_logs`, `gateway_storage`, `gateway_logs`, and `notification_logs`.

## Step 5: Post-launch checklist

1. **Verify pause state** – contracts start paused. After double-checking settings, call `SystemPause.unpauseAll` via your
   governance multisig to go live.
2. **Update `.env` with production URLs** – point front-ends to your public domain.
3. **Scale beyond Docker Compose** – optional: translate `compose.yaml` into Kubernetes manifests (the services use distinct
   Dockerfiles with environment-driven configuration).
4. **Document addresses** – store `latest-deployment.json` in your secrets vault or ops repo for incident response.

## Troubleshooting

- **Deployment fails fetching AGIALPHA decimals** – ensure you target a network where the canonical token is deployed (mainnet /
  Sepolia) or deploy a mock token at that address for private forks.
- **Services crash on missing addresses** – double-check `deployment-config/oneclick.env` matches the generated address book.
- **Notification service** – notifications persist in `notification_logs` volume as JSON lines; mount the volume or use the
  `/notifications` endpoint for inspection.

With these pieces in place the "one-click" workflow takes you from zero to a fully wired stack with safe defaults in a single
command, ready for further tuning via the governance scripts in `scripts/v2`.
