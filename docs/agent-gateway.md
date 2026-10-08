# Agent Gateway

The off-chain gateway listens for `JobCreated` events on the deployed `JobRegistry` and exposes HTTP, WebSocket and gRPC interfaces for managed agents. Use the [setup guide](gateway-setup.md) for a complete configuration and the [service reference](../agent-gateway/README.md) for storage, validation recovery and provider execution details.

## Setup

1. From the repository root, use the pinned Node.js 22.23.3 and npm 10.8.2 toolchain and install the lockfile dependencies:
   ```bash
   npm ci
   ```
2. Set environment variables:
   - `RPC_URL` – HTTP(S) Ethereum JSON-RPC endpoint (default `http://localhost:8545` for local development).
   - `JOB_REGISTRY_ADDRESS` – address of the deployed `JobRegistry` contract.
   - `VALIDATION_MODULE_ADDRESS` – address of the deployed validation module.
   - `KEYSTORE_URL` – wallet-key service returning `{ "keys": ["<private-key>"] }`; use HTTPS outside an isolated local fixture.
   - `KEYSTORE_TOKEN` – bearer credential for that key service.
   - `AGIALPHA_TOKEN` – deployed token address when overriding the selected `config/agialpha*.json` manifest; token metadata must match on chain.
   - `PORT` – HTTP/WebSocket port (default `3000`).
   - `GRPC_PORT` – gRPC port (default `50051`; set `0` to disable).
   - `GATEWAY_API_KEY` – shared secret for protecting wallet endpoints.

The service loads signing wallets from the keystore. `AGENT_PRIVATE_KEY` belongs to separate example clients and does not configure this service. Optional `BOT_WALLET` and `ORCHESTRATOR_WALLET` select addresses already present in the keystore. Export the environment before starting; see the [setup example](gateway-setup.md#running-the-gateway).

## Usage

Start the gateway:

```bash
npm run gateway
```

This builds the TypeScript service, packages its runtime assets and runs `agent-gateway/dist/agent-gateway/index.js`. To build and start separately, run `npm run build:gateway`, then `node agent-gateway/dist/agent-gateway/index.js`. `npm run agent:gateway` runs a separate example agent.

The server will:

- Subscribe to `JobCreated` events and keep an in-memory list of open jobs.
- Broadcast new jobs to connected WebSocket clients.
- Expose REST endpoints:
  - `GET /jobs` – list open jobs.
  - `POST /jobs/:id/apply` – call `applyForJob` with `{ "address": "<managed-wallet>", "proofBytes": [] }`.
  - `POST /jobs/:id/submit` – submit a result with `{ "address": "<managed-wallet>", "result": "...", "proofBytes": [] }`.
  - `POST /jobs/:id/deliverables` – submit a result reference with evidence metadata, telemetry and contributor records. See the [proof and submission examples](gateway-setup.md#proofs-and-result-submission).

Empty identity proofs work only when permitted by the deployed identity configuration. The gateway checks the wallet's ENS name and passes its label with the proof. A submission receipt records submitted work; independent validation and the authorized settlement transaction determine acceptance and payment.

Wallet requests must include `X-Api-Key` or a signature of the current
challenge. Fetch the nonce via `GET /auth/challenge`, sign the returned
`challenge` field, and send the signature in `X-Signature` with the address in
`X-Address`. gRPC clients must send the same credentials in request metadata:
include `x-api-key` when using the shared secret or provide both `x-address`
and `x-signature` where the signature covers `Agent Gateway Auth` concatenated
with the latest nonce obtained from the challenge endpoint or a recent `401`
response.

WebSocket clients can connect to `ws://localhost:PORT` to receive push notifications of new jobs. The gRPC service is `agentgateway.v1.AgentGateway`, defined in [`agent_gateway.proto`](../agent-gateway/protos/agent_gateway.proto); its seven RPCs are unary requests, with event streaming provided separately through WebSocket.

For deployment, put the HTTP/WebSocket and plaintext gRPC listeners behind the intended network access controls and TLS termination. Preserve the service's durable storage and reconcile active jobs after a restart as described in [persistence and recovery](gateway-setup.md#persistence-and-recovery).
