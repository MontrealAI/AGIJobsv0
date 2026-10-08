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
   - `GATEWAY_API_KEY` – operator credential for selecting managed wallets and privileged gateway actions; keep it with trusted operators.

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

Wallet requests must include `X-Api-Key` or a signature of the current challenge. Fetch the REST challenge via
`GET /auth/challenge`, sign the returned `challenge` field, and send the signature in `X-Signature` with the address in
`X-Address`. The signer must be a wallet managed by this gateway and can act only for that same wallet. The operator API key
can select another managed wallet and is required for agent registration and privileged audit, spawn, employer and quarantine actions.

gRPC clients use `x-api-key` metadata or call `GetAuthChallenge` and send `x-address` plus `x-signature` metadata signing its
returned challenge. HTTP and gRPC use separate nonces, each expiring after five minutes and rotating after successful signature
authentication. Each transport shares one nonce across its clients, so a concurrent client may need to fetch and sign a fresh
challenge after another succeeds. A stale signature
requires a fresh challenge; an authenticated attempt to use another wallet returns HTTP `403` / gRPC `PERMISSION_DENIED`.
See the [complete authentication contract](gateway-setup.md#authentication).

REST and gRPC each limit requests to 240 per transport peer per minute and 2,400 per process per minute, including challenges,
reads and failed authentication. The limits are local to each transport and process; proxy traffic shares the observed proxy
peer quota, and replicas need aggregate ingress limits. Respect REST `429` / gRPC `RESOURCE_EXHAUSTED` retry timing. See
[request budgets](gateway-setup.md#request-budgets).

Optional deliverable attestations use separate `signature` and `signedPayload` fields: the managed wallet signs the decoded
32 bytes of `resultHash` using EIP-191, and `signedPayload` must equal that digest. Incomplete or invalid attestations fail before
transaction or storage side effects. Authenticated requests omitting both fields remain explicitly unsigned. See the
[signing example and gRPC field names](gateway-setup.md#optional-evidence-signatures).

WebSocket clients can connect to `ws://localhost:PORT` to receive push notifications of new jobs. The gRPC service is `agentgateway.v1.AgentGateway`, defined in [`agent_gateway.proto`](../agent-gateway/protos/agent_gateway.proto); its eight RPCs are unary requests, with event streaming provided separately through WebSocket.
WebSocket `register` and `ack` control messages require the operator API key in the handshake headers. Registration must match
an agent ID and wallet previously configured using authenticated `POST /agents`; acknowledgements affect only that socket's
registered agent queue. See the [trusted Node client example](gateway-setup.md#websocket-stream). Public subscribers can still
receive broadcasts, and must not receive the operator key.

For deployment, put the HTTP/WebSocket and plaintext gRPC listeners behind the intended network access controls and TLS termination. Preserve the service's durable storage and reconcile active jobs after a restart as described in [persistence and recovery](gateway-setup.md#persistence-and-recovery).
Run one gateway writer for each private evidence store. SQLite transactions do not coordinate the gateway's in-memory queues,
nonces, timers or transaction decisions across replicas. Back up the complete evidence directory with the gateway stopped,
including legacy records; do not copy only a live database file or delete history as a migration shortcut.
