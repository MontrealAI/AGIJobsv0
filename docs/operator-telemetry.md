# Operator Telemetry Service

The operator telemetry service runs alongside the agent gateway to publish
per-job energy metrics to the on-chain `EnergyOracle` contract. Metrics are
sourced from `storage/telemetry/telemetry-queue.json`, formatted as EIP-712
attestations, signed by the configured orchestrator wallet and submitted
through `agent-gateway/operator.ts` using `ethers`.

## Features

- Converts raw `EnergySample` records into `EnergyOracle.Attestation` structs.
- Uses deterministic nonce handling against the contract `nonces` mapping to
  avoid duplicate submissions.
- Applies exponential backoff when the RPC endpoint is unavailable and refreshes
  the signer connection automatically on recoverable failures.
- Validates signatures with a `staticCall` before broadcasting transactions to
  prevent wasting gas on rejected payloads.
- Persists queued samples to disk so work completed while the service is
  offline is submitted once connectivity is restored.
- Ships with a PM2 helper script and Docker/Compose configuration for
  production use.

## Prerequisites

- Node.js 20.18.1
- Access to the keystore service that returns orchestrator private keys.
- RPC endpoint for the network hosting the `EnergyOracle` contract.
- Deployed contract addresses for the gateway (JobRegistry, ValidationModule,
  EnergyOracle).

## Configuration

All configuration is supplied via environment variables. Defaults are applied
when omitted.

| Variable | Description |
| --- | --- |
| `RPC_URL` | JSON-RPC endpoint used by the gateway (default `http://localhost:8545`). |
| `ENERGY_ORACLE_RPC_URL` | Optional RPC override used when sending attestations. Falls back to `RPC_URL` when empty. |
| `ENERGY_ORACLE_ADDRESS` | Address of the deployed `EnergyOracle` contract (required for contract submission). |
| `JOB_REGISTRY_ADDRESS` | Address of the `JobRegistry` contract (required by the wallet loader). |
| `VALIDATION_MODULE_ADDRESS` | Address of the `ValidationModule` contract (required). |
| `DISPUTE_MODULE_ADDRESS` | Address of the dispute module (optional). |
| `KEYSTORE_URL` | HTTPS endpoint returning a JSON payload `{ "keys": [...] }` with private keys used by the gateway. |
| `KEYSTORE_TOKEN` | Optional bearer token sent to the keystore. |
| `ORCHESTRATOR_WALLET` | Address of the wallet authorised to attest energy metrics. Defaults to the automation wallet when omitted. |
| `TELEMETRY_FLUSH_INTERVAL_MS` | Interval between flush cycles (default `60000`). |
| `TELEMETRY_MAX_RETRIES` | Retry attempts for contract submissions (default `5`). |
| `TELEMETRY_RETRY_DELAY_MS` | Base delay for exponential backoff (default `2000`). |
| `TELEMETRY_DEADLINE_BUFFER_SEC` | Additional signature validity window in seconds (default `3600`). |
| `TELEMETRY_EPOCH_DURATION_SEC` | Epoch duration used to bucket attestations (default `86400`). |
| `TELEMETRY_ENERGY_SCALING` | Multiplier applied to energy scores before conversion to integers (default `1`). |
| `TELEMETRY_VALUE_SCALING` | Multiplier applied to efficiency scores before conversion to integers (default `1_000_000`). |
| `TELEMETRY_ROLE` | Role identifier supplied in the attestation payload (default `2`). |
| `ENERGY_ORACLE_URL` | Optional HTTP ingestion endpoint. Used only when the contract address is not configured. |
| `ENERGY_ORACLE_TOKEN` | Bearer token for the HTTP endpoint (optional). |

The orchestrator wallet must be authorised on the EnergyOracle contract via
`setSigner`. Private keys are loaded from the keystore at start-up and remain in
memory only.

## Running locally

Compile the TypeScript sources and start the telemetry loop:

```bash
npm run build:gateway
node agent-gateway/dist/agent-gateway/operator.js
```

The service reads any queued telemetry samples, signs them and calls
`EnergyOracle.verify`. Successful submissions log the job ID, signer address,
nonce and transaction hash. Failures are retried with exponential backoff using
`TELEMETRY_MAX_RETRIES` and `TELEMETRY_RETRY_DELAY_MS`. If the connection drops
mid-transaction the operator checks the receipt before retrying, ensuring that
already-mined attestations are not sent twice.

## PM2 supervision

`scripts/start-telemetry.sh` builds the gateway and manages a PM2 process named
`operator-telemetry`:

```bash
./scripts/start-telemetry.sh
pm2 logs operator-telemetry
```

Running the script again issues `pm2 restart operator-telemetry --update-env`,
so environment changes are picked up automatically. Use `pm2 save` if you want
PM2 to relaunch the process on host reboot.

## Docker deployment

A dedicated container definition is available in `agent-gateway/Dockerfile`. It
installs dependencies, compiles the TypeScript output and sets the entrypoint to
`node agent-gateway/dist/agent-gateway/operator.js`. Build the image with:

```bash
docker build -f agent-gateway/Dockerfile -t agijobs/operator-telemetry .
```

and run it by mounting persistent storage for the telemetry queue and energy
logs:

```bash
docker run -d --name operator-telemetry \
  -v /srv/agijobs/storage:/app/storage \
  -v /srv/agijobs/logs:/app/logs:ro \
  -e RPC_URL=https://rpc.example \
  -e ENERGY_ORACLE_RPC_URL=https://rpc.example \
  -e ENERGY_ORACLE_ADDRESS=0xOracle \
  -e JOB_REGISTRY_ADDRESS=0xJobRegistry \
  -e VALIDATION_MODULE_ADDRESS=0xValidationModule \
  -e KEYSTORE_URL=https://keystore.example/keys \
  -e KEYSTORE_TOKEN=changeme \
  -e ORCHESTRATOR_WALLET=0xSigner \
  agijobs/operator-telemetry
```

## Docker Compose

`deployment-config/operator-telemetry.yml` provides a ready-to-adjust Compose
service definition. Update the environment variables with the deployed contract
addresses, keystore information and RPC URLs, then run:

```bash
cd deployment-config
docker compose -f operator-telemetry.yml up -d --build
```

The service mounts `../storage` and `../logs` from the host by default; adjust
these paths to match your deployment layout.

## Operational notes

- Telemetry samples are persisted in `storage/telemetry/telemetry-queue.json`.
  The queue is truncated only after the corresponding attestation has been
  accepted on-chain.
- `EnergySample` fields are converted to contract fields as follows:
  `energyEstimate` → `energy`, `cpuTimeMs`/`gpuTimeMs` → `uPre`/`uPost`, and
  `efficiencyScore` → `value` (after scaling). Degeneracy defaults to `1` unless
  provided via sample metadata.
- Nonces are fetched lazily from the contract and cached per agent; nonce
  reservations survive retries until a signature failure occurs, preventing
  races when the service restarts mid-flight.
- When neither `ENERGY_ORACLE_ADDRESS` nor `ENERGY_ORACLE_URL` are set the
  service persists telemetry locally and logs a warning every flush cycle. Set
  at least one of these targets for production usage.
- Use `DEBUG=agent-telemetry` (or a process manager specific setting) to enable
  verbose logging while diagnosing connectivity issues.
