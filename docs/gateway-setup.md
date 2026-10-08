# Agent Gateway Setup

This gateway listens to on-chain job events and routes work to registered AI agents. It also manages agent wallets and handles the commit–reveal process used by validators.

## Prerequisites

- Node.js v22.23.3 LTS
- npm 10.8.2 and the repository lockfile
- A running HTTP(S) Ethereum JSON-RPC endpoint
- Deployed `JobRegistry` and `ValidationModule` contracts
- An authenticated keystore containing the authorized agent or validator wallet keys
- Token configuration matching the deployment and the required [ENS identity setup](ens-identity-setup.md)

## Installation

Install project dependencies from the repository root:

```bash
npm ci
```

## Running the Gateway

Replace the placeholders with your deployment values, export the required environment variables and start the service:

```bash
export RPC_URL=http://localhost:8545
export JOB_REGISTRY_ADDRESS='0xYourJobRegistryAddress'
export VALIDATION_MODULE_ADDRESS='0xYourValidationModuleAddress'
export AGIALPHA_TOKEN='0xYourDeployedTokenAddress'
export KEYSTORE_URL='https://your-keystore.example/keys'
export KEYSTORE_TOKEN='replace-with-keystore-credential'
export GATEWAY_API_KEY='replace-with-gateway-credential'
export PORT=3000
export GRPC_PORT=50051

npm run gateway
```

`npm run gateway` runs `npm run build:gateway` and then `node agent-gateway/dist/agent-gateway/index.js`. The build packages the
configuration and protobuf assets with the compiled service. For a prebuilt deployment, run the latter Node command after
building. Export configuration into the process environment; the service does not automatically load an arbitrary `.env` file.
`npm run agent:gateway` is a separate example client, not the service startup command.

`AGIALPHA_TOKEN` overrides the token address from the selected `config/agialpha*.json` manifest. Select a network manifest with
`AGIALPHA_NETWORK` or `NETWORK`; decimals, symbol and name must match the deployed token or startup fails. Optional
`STAKE_MANAGER_ADDRESS` and `DISPUTE_MODULE_ADDRESS` enable their associated integrations. Set `GRPC_PORT=0` to disable gRPC.

`KEYSTORE_URL` should point to an authenticated service that returns a JSON
payload of private keys:

```json
{ "keys": ["<authorized-private-key-1>", "<authorized-private-key-2>"] }
```

`KEYSTORE_TOKEN` is sent as a bearer token in the `Authorization` header to
authenticate the request.

The gateway must load at least one valid key. Optional `BOT_WALLET` and `ORCHESTRATOR_WALLET` select addresses already present
in this response; otherwise automation uses the first loaded wallet and orchestration uses the automation wallet.
`AGENT_PRIVATE_KEY` does not configure service wallets. Use HTTPS for the keystore outside isolated local fixtures; the current
loader accepts both HTTP and HTTPS. The gateway's own HTTP/WebSocket and gRPC listeners use plaintext transports, so deployment
should provide TLS termination and the intended network access controls.

## Authentication

Wallet endpoints are protected by either an API key or a nonce-based signed
message. Clients can supply the shared secret set in `GATEWAY_API_KEY` via the
`X-Api-Key` header. To use wallet signatures, first fetch the current
challenge:

```bash
curl http://localhost:3000/auth/challenge
```

Sign the `challenge` field (the static message `Agent Gateway Auth`
concatenated with the current nonce) and send the result alongside the wallet
address using `X-Signature` and `X-Address` headers. Unauthorized responses
also include the latest challenge so agents can immediately retry after
signing.

## Registering Agents

Agents may register an HTTP endpoint to receive job notifications:

```bash
curl -X POST http://localhost:3000/agents \
  -H 'Content-Type: application/json' \
  -d '{"id":"agent1","url":"http://localhost:4000/job","wallet":"0xYourWallet"}'
```

## Workflow

1. When a `JobCreated` event is emitted, the gateway broadcasts it over WebSocket and POSTs the job payload to every registered agent.
2. Agents can interact with the registry through the gateway using managed wallets:
   - `POST /jobs/:id/apply` – apply for a job
   - `POST /jobs/:id/submit` – submit a result
   - `POST /jobs/:id/commit` – validators commit to a validation decision
   - `POST /jobs/:id/reveal` – reveal the committed decision

Each request must include the wallet address in the JSON body, e.g. `{ "address": "0x..." }`.

For work requiring independent review, the worker submits its deliverable and evidence, selected validators evaluate it, and
the configured validation module records the result. Settlement is a separate authorized `JobRegistry.finalize(jobId)` (or
`acknowledgeAndFinalize(jobId)`) transaction after contract requirements are satisfied. A submission receipt or worker-reported
`success` value is not an acceptance decision or proof of payment. The gateway's validation-finalization timer does not replace
that settlement transaction. See the [registry interface](../contracts/v2/interfaces/IJobRegistry.sol).

## Proofs and result submission

The on-chain identity argument is a Merkle proof represented as `bytes32[]`. It is separate from a deliverable's evidence metadata:

| Interface | Identity proof | Evidence metadata |
| --- | --- | --- |
| HTTP apply, legacy submit and deliverables | `proofBytes`: array of `0x`-prefixed 32-byte hex words; a legacy packed hex string is also accepted | Deliverables accepts a `proof` JSON object |
| gRPC `SubmitResult` | `proof_bytes`: legacy packed hex string, retaining protobuf field 8 | `proof_json`: JSON object encoded as a string |

For packed encoding, concatenate the 64 hex digits of each proof word after a single `0x` prefix. `[]` (HTTP) or `"0x"` (either
interface) denotes an empty proof. Use the actual proof required by the deployed identity registry; an empty proof is valid only
when that configuration permits it. The gateway checks the managed wallet's ENS name and passes its first label to the contract.
Malformed words or partial packed words are rejected before submission. For older HTTP deliverable clients, a string `proof` is
also accepted as packed identity proof when `proofBytes` is absent; use the explicit fields above for new integrations.

For an identity configuration that accepts an empty proof, these authenticated HTTP requests apply and then submit a referenced
deliverable. Replace the wallet and job ID with the authorized assigned worker and an actual job; fund its transaction fees and
complete required staking/identity configuration first.

```bash
curl --fail-with-body -X POST http://localhost:3000/jobs/42/apply \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xYourManagedWalletAddress","proofBytes":[]}'

curl --fail-with-body -X POST http://localhost:3000/jobs/42/deliverables \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xYourManagedWalletAddress","resultUri":"https://your-evidence.example/jobs/42/result.json","proofBytes":[],"proof":{"reviewUri":"https://your-evidence.example/jobs/42/review.json"}}'
```

The deliverables response includes `tx`, `method: "submit"`, `resultHash` and the recorded deliverable. Supply a 32-byte hex
`resultHash` when your workflow commits to a particular digest; when omitted, the helper hashes the result reference string,
not the bytes fetched from that reference. Reviewers must verify the referenced content and the workflow's integrity checks.

The gRPC schema is [`agentgateway.v1.AgentGateway`](../agent-gateway/protos/agent_gateway.proto). All seven methods are unary;
they cover submission, heartbeats, telemetry, job information, staking and reward claims. For example, with `grpcurl` installed
and the gateway running locally, the equivalent result submission is:

```bash
grpcurl -plaintext \
  -import-path agent-gateway/protos -proto agent_gateway.proto \
  -H "x-api-key: $GATEWAY_API_KEY" \
  -d '{"job_id":"42","wallet_address":"0xYourManagedWalletAddress","result_uri":"https://your-evidence.example/jobs/42/result.json","proof_bytes":"0x","proof_json":"{\"reviewUri\":\"https://your-evidence.example/jobs/42/review.json\"}"}' \
  localhost:50051 agentgateway.v1.AgentGateway/SubmitResult
```

`-plaintext` is for this local listener; use the appropriate TLS connection through your deployment's proxy. gRPC returns
`tx_hash` and `submission_method: "submit"`. REST `finalize` and the gRPC `finalize` field remain accepted compatibility
preferences but do not bypass validation or trigger settlement. Explicit `finalizeOnly: true` / `finalize_only: true` is rejected
with HTTP `400` / gRPC `INVALID_ARGUMENT`; malformed identity proofs and invalid result hashes use the same client-error codes.
The nonexistent `finalizeJob(jobId, resultRef)` registry call is not used.

## WebSocket Stream

Clients can also subscribe to job events:

```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

## Persistence and recovery

The gateway keeps live job and agent indexes, pending deliveries and timers in memory. Deliverable, heartbeat and telemetry
records are file-backed under `storage/deliverables`; employer plans are stored under `storage/employer/plans` and loaded on
startup. These locations are relative to the runtime package: source execution uses repository-root `storage`, while the compiled
service uses `agent-gateway/dist/storage`. The container path is `/app/agent-gateway/dist/storage`; mount a durable writable volume
owned by the service user. Validator commitments can use a separate absolute `VALIDATION_STORAGE_DIR` with the strict private
directory permissions described in the [service reference](../agent-gateway/README.md#private-validator-state).

File persistence does not provide distributed locking across gateway instances or a checkpointed replay of missed job events.
After a restart, reconcile active jobs and wallet transactions with canonical chain state, re-register external agents as needed,
and recover pending work before resuming execution. Keep commitment records and reveal salts private and preserve them during
recovery. Run the [production rehearsal](production/rehearsal.md) and verify restart, provider failure, independent acceptance and
settlement against the intended deployment before commissioning it.
