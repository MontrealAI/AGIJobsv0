# Operator Telemetry Service

The operator telemetry service aggregates per-job energy metrics from the
orchestrator logs and submits attestations to the on-chain `EnergyOracle`
contract or an HTTP ingestion API. It keeps the oracle informed about the
energy efficiency of agents so the reward engine can settle payouts using
accurate data.

## Features

- Scans `logs/energy/<agent>/<jobId>.json` files produced by the orchestrator.
- Computes attestation payloads with deterministic nonce handling.
- Submits attestations to either the EnergyOracle contract (via ethers.js) or a
  configurable API endpoint.
- Retries transient failures with exponential backoff and automatically
  recovers from RPC disconnects.
- Persists progress in `storage/operator-telemetry-state.json` (or a custom
  location) to avoid duplicate submissions.
- Container image and PM2 configuration for production-grade supervision.

## Prerequisites

- Node.js 20 or later.
- Access to the orchestrator energy logs directory.
- A signer key that is authorised on the EnergyOracle contract (for contract
  mode) or recognised by the API (for API mode).
- RPC endpoint for the target chain when submitting to the contract.

## Configuration

All behaviour is controlled with environment variables. Values shown below are
defaults if the variable is omitted.

| Variable                        | Description                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TELEMETRY_MODE`                | `contract` or `api`. If omitted the service picks `contract` when `ENERGY_ORACLE_RPC_URL` is set, otherwise `api`. |
| `ENERGY_LOG_DIR`                | Directory containing energy logs (default `logs/energy`).                                                          |
| `ENERGY_ORACLE_ADDRESS`         | Deployed EnergyOracle contract address (required).                                                                 |
| `ENERGY_ORACLE_SIGNER_KEY`      | Private key for the authorised oracle signer (required).                                                           |
| `ENERGY_ORACLE_RPC_URL`         | JSON-RPC endpoint (required in `contract` mode).                                                                   |
| `ENERGY_ORACLE_API_URL`         | HTTP endpoint (required in `api` mode).                                                                            |
| `ENERGY_ORACLE_API_TOKEN`       | Optional bearer token for API mode.                                                                                |
| `ENERGY_ORACLE_CHAIN_ID`        | Chain ID used for typed-data signatures. Required when RPC is not available (API mode).                            |
| `TELEMETRY_POLL_INTERVAL_MS`    | Delay between scan cycles. Default `10000`.                                                                        |
| `TELEMETRY_MAX_RETRIES`         | Submission attempts before surfacing an error. Default `5`.                                                        |
| `TELEMETRY_RETRY_DELAY_MS`      | Base delay for exponential backoff (ms). Default `2000`.                                                           |
| `TELEMETRY_DEADLINE_BUFFER_SEC` | Signature validity window in seconds. Default `3600`.                                                              |
| `TELEMETRY_EPOCH_DURATION_SEC`  | Epoch length used to bucket attestations. Default `86400`.                                                         |
| `TELEMETRY_ENERGY_SCALING`      | Multiplier applied to energy score before converting to integers. Default `1`.                                     |
| `TELEMETRY_VALUE_SCALING`       | Multiplier applied to efficiency when populating `value`. Default `1_000_000`.                                     |
| `TELEMETRY_ROLE`                | Role identifier supplied in attestations. Defaults to `2` (operators).                                             |
| `TELEMETRY_STATE_FILE`          | Persistent state file. Default `storage/operator-telemetry-state.json`.                                            |
| `TELEMETRY_MAX_BATCH`           | Maximum attestations per polling cycle. Default `20`.                                                              |

The service also honours any environment variables exported in the PM2 config
or container runtime.

## Running locally

Install dependencies and build the TypeScript output once:

```bash
npm ci
npx tsc -p apps/operator/tsconfig.json
```

Then launch the telemetry loop (contract mode example):

```bash
TELEMETRY_MODE=contract \
ENERGY_LOG_DIR=/path/to/logs \
ENERGY_ORACLE_ADDRESS=0xOracle \
ENERGY_ORACLE_RPC_URL=https://rpc.example \
ENERGY_ORACLE_SIGNER_KEY=0xabcdef... \
node apps/operator/dist/telemetry.js
```

To run without compiling ahead of time you can use `ts-node`:

```bash
npx ts-node apps/operator/telemetry.ts
```

## Docker deployment

A production container is available via `apps/operator/Dockerfile`. Build and
run it by mounting the log directory and persisting the telemetry state:

```bash
docker build -f apps/operator/Dockerfile -t agijobs/operator-telemetry .

docker run -d --name operator-telemetry \
  -v /srv/operator/logs:/data/logs \
  -v /srv/operator/state:/data/state \
  -e TELEMETRY_MODE=contract \
  -e ENERGY_ORACLE_ADDRESS=0xOracle \
  -e ENERGY_ORACLE_RPC_URL=https://rpc.example \
  -e ENERGY_ORACLE_SIGNER_KEY=0xabcdef... \
  agijobs/operator-telemetry
```

Container logs expose submission progress and retry attempts. Override
`TELEMETRY_MODE` and related variables to switch to API submission.

## PM2 supervision

A ready-to-use configuration is provided at `apps/operator/pm2.config.js`. After
building the TypeScript output run:

```bash
npx tsc -p apps/operator/tsconfig.json
pm2 start apps/operator/pm2.config.js --env production \
  --update-env -- \
  TELEMETRY_MODE=contract \
  ENERGY_ORACLE_ADDRESS=0xOracle \
  ENERGY_ORACLE_RPC_URL=https://rpc.example \
  ENERGY_ORACLE_SIGNER_KEY=0xabcdef...
```

PM2 will restart the process automatically on crash. Update environment
variables with `pm2 restart operator-telemetry --update-env` when configuration
changes.

## systemd (optional)

For environments using `systemd`, create a unit file similar to the example
below:

```ini
[Unit]
Description=AGIJobs Operator Telemetry
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/agijobs
Environment=TELEMETRY_MODE=contract
Environment=ENERGY_LOG_DIR=/opt/agijobs/logs/energy
Environment=ENERGY_ORACLE_ADDRESS=0xOracle
Environment=ENERGY_ORACLE_RPC_URL=https://rpc.example
Environment=ENERGY_ORACLE_SIGNER_KEY=0xabcdef...
ExecStart=/usr/bin/node apps/operator/dist/telemetry.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Reload systemd and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agijobs-operator-telemetry.service
```

## Operational notes

- The service persists the most recent attestation timestamp per job and the
  nonce state (API mode) to avoid double submissions.
- Retries are exponential: failures wait `TELEMETRY_RETRY_DELAY_MS * 2^(n-1)`
  before the next attempt.
- When the RPC endpoint is unavailable the nonce provider refreshes from the
  contract on the next cycle, ensuring the service recovers cleanly.
- In API mode, `TELEMETRY_STATE_FILE` must live on persistent storage so nonce
  counters survive restarts.
- Enable verbose logs by setting `DEBUG=operator-telemetry` (or use process
  manager level logging).
