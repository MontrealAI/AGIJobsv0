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

Wallet endpoints accept either the operator API key or a nonce-based wallet signature. Supply `GATEWAY_API_KEY` via the
`X-Api-Key` header only from trusted operator clients: it can select any wallet managed by this service. Workers can instead
authenticate as their own managed wallet. To use REST wallet signatures, first fetch the current challenge:

```bash
curl http://localhost:3000/auth/challenge
```

Sign the returned `challenge` field (the static message `Agent Gateway Auth` concatenated with the current nonce) and send it
in `X-Signature`, with the managed wallet address in `X-Address`. The selected request wallet must match that signer. A valid
signature never grants access to a different managed wallet or operator actions. REST `401` responses also include the current
challenge. Challenges expire after five minutes, expose an ISO `expiresAt` timestamp and rotate after successful signature
authentication; fetch and sign a new challenge before retrying an expired or already-used one.
Each transport shares its nonce across clients. One successful signature consumes it, so concurrent callers must fetch and
sign a fresh challenge when authentication fails. Reading an unexpired challenge does not rotate it.

gRPC uses the same credential names in lowercase metadata, but has its own independent nonce. Obtain it using the public
`GetAuthChallenge` RPC; do not reuse the REST nonce:

```bash
grpcurl -plaintext \
  -import-path agent-gateway/protos -proto agent_gateway.proto \
  -d '{}' localhost:50051 agentgateway.v1.AgentGateway/GetAuthChallenge
```

Sign that response's `challenge` string and send `x-address` and `x-signature` metadata with the next request. Its `expires_at`
field carries the expiration timestamp. The same five-minute lifetime and rotation rule apply. Both transports require the
signing address to be present in the configured keystore; public wallet ownership alone does not authorize this gateway.

| Request                                                                                                                                                      | Required authority                                         | Rejection                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A managed-wallet action, including submission, staking, rewards, heartbeat, telemetry, commit or reveal                                                      | That wallet's challenge signature, or the operator API key | Missing, expired, replayed or unknown-wallet credentials: HTTP `401` / gRPC `UNAUTHENTICATED`; selecting another wallet: HTTP `403` / gRPC `PERMISSION_DENIED` |
| `POST /agents`, `/audit/anchors`, `/spawn/blueprints`, `/employer/plans`, `/employer/plans/:planId/launch`, `/employer/jobs`, `/security/quarantine/release` | Operator API key                                           | A wallet-authenticated caller receives HTTP `403`; without valid authentication the response is `401`                                                          |

Configure `GATEWAY_API_KEY` to enable those operator-only routes. Omitting it leaves wallet-scoped signature authentication
available but does not grant any wallet global operator authority. These authentication rules apply to the protected routes;
public discovery and event-stream interfaces still require the deployment's intended network access controls.

## Request budgets

REST and gRPC each enforce 240 requests per transport peer per minute and 2,400 requests per process per minute, before
authentication. Challenges, reads, invalid requests and failed authentication count. The transports have separate in-memory
counters; these are fixed limits with no environment overrides. A restart clears their counters.

REST returns HTTP `429` with `Retry-After` seconds and standard `RateLimit` headers. gRPC returns `RESOURCE_EXHAUSTED` with
`retry-after` seconds in error metadata. Wait for the indicated interval before retrying; obtain a fresh challenge if the previous
one expired or was consumed. These limits bound requests, not a worker's authorized spending or on-chain transaction count.

Peer identity comes from the actual transport connection, not forwarded headers. IPv4-mapped addresses are normalized and
IPv6 addresses are grouped by `/56`; gRPC removes the ephemeral port from its peer address before applying the same grouping. Clients behind a reverse proxy
share the proxy's observed quota. Configure trusted ingress controls and shared aggregate quotas for multi-replica deployments;
adding replicas does not create a shared gateway limiter or coordinate wallet activity.

WebSocket budgets are separate from REST and gRPC:

| WebSocket resource                                         | Per transport peer | Per process      |
| ---------------------------------------------------------- | ------------------ | ---------------- |
| New connections                                            | 60 per minute      | 600 per minute   |
| Active connections                                         | 16                 | 256              |
| Inbound messages, including public/unauthenticated clients | 240 per minute     | 2,400 per minute |

Incoming WebSocket payloads are limited to 64 KiB. A depleted connection/message budget attempts a close with code `1013`
before parsing or mutating application state; unauthorized or mismatched control messages attempt `1008`. The transport is
then terminated immediately, so a peer ignoring the close handshake cannot retain resources; clients may observe an abrupt
close. Protocol errors, including oversized frames, terminate only that client rather than crashing the gateway. Closing a
socket releases active capacity, but reconnecting does not reset the peer's message budget. WebSocket peer identity uses the
TCP address with IPv4-mapped normalization and IPv6 `/56` grouping, without trusting forwarded headers. Proxy sharing and
replica-wide ingress limits apply here too.

## Registering Agents

An operator can register an agent's HTTP endpoint to receive job notifications:

```bash
curl -X POST http://localhost:3000/agents \
  -H "X-Api-Key: $GATEWAY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"id":"agent1","url":"http://localhost:4000/job","wallet":"0xYourWallet"}'
```

Replace the wallet placeholder with a valid Ethereum address. The agent `id` must be a nonblank string of at most 256 characters
without ASCII control characters. An optional `url` must be an absolute HTTP(S) URL of at most 2,048 characters without embedded
credentials; local HTTP worker endpoints remain supported. Invalid registration input returns HTTP `400` before changing the
dispatch registry. Register only endpoints commissioned for your deployment.

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

| Interface                                  | Identity proof                                                                                      | Evidence metadata                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| HTTP apply, legacy submit and deliverables | `proofBytes`: array of `0x`-prefixed 32-byte hex words; a legacy packed hex string is also accepted | Deliverables accepts a `proof` JSON object    |
| gRPC `SubmitResult`                        | `proof_bytes`: legacy packed hex string, retaining protobuf field 8                                 | `proof_json`: JSON object encoded as a string |

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

The gRPC schema is [`agentgateway.v1.AgentGateway`](../agent-gateway/protos/agent_gateway.proto). All eight methods are unary;
they cover authentication challenges, submission, heartbeats, telemetry, job information, staking and reward claims. For example, with `grpcurl` installed
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

### Optional evidence signatures

The HTTP and gRPC examples above omit content attestations. They are authenticated submissions with no evidence `signature`;
the gateway does not generate one or mark the evidence as signed. Request authentication and the registry transaction establish
wallet authority. A content signature is an additional attestation to the submitted digest, compatible with certificate metadata.

For a signed HTTP deliverable, supply `resultHash`, `signedPayload` and `signature`. `signedPayload` must be the exact 32-byte
hex digest in `resultHash`, not a JSON object, arbitrary message or URL. Sign its decoded bytes with the same managed wallet
selected by the request. This ethers v6 helper constructs the fields without sending a transaction:

```javascript
import { getBytes, isHexString } from 'ethers';

async function attestResult(wallet, resultHash) {
  if (!isHexString(resultHash, 32))
    throw new Error('resultHash must be bytes32');
  return {
    resultHash,
    signedPayload: resultHash,
    signature: await wallet.signMessage(getBytes(resultHash)),
  };
}
```

Merge those fields into the authenticated deliverable request alongside `address`, `resultUri` and `proofBytes`. The caller
must compute and verify the digest for the actual evidence format; signing the hash of a URL does not authenticate fetched file
bytes. `signMessage(getBytes(resultHash))` produces an EIP-191 signature over 32 bytes; signing the hex string as text produces
a different signature and is rejected. For gRPC use `result_hash`, `signed_payload` and `signature` with the same digest and
signature values. If you also provide `digest` on either interface, it must equal `resultHash` for an attested submission.

Omit both `signature` and `signedPayload` (`signed_payload` in gRPC) for unsigned evidence. An incomplete pair, malformed
signature, different signer, mismatched payload or conflicting attested digest returns HTTP `400` / gRPC `INVALID_ARGUMENT`
before tax acknowledgement, result submission or evidence writes. This attestation does not establish job acceptance, payment
or correctness of the underlying work; independent reviewers still evaluate the evidence and its job-specific requirements.

## WebSocket Stream

Clients can subscribe to public job events without dispatch-control credentials:

```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

To register a dispatch socket, first configure its agent ID and wallet using the authenticated `POST /agents` example above.
Then use a trusted Node client with the operator API key in its WebSocket handshake headers:

```javascript
import WebSocket from 'ws';

const apiKey = process.env.GATEWAY_API_KEY;
if (!apiKey)
  throw new Error('GATEWAY_API_KEY is required for dispatch control');
const agent = { id: 'agent1', wallet: '0xYourWallet' };
const ws = new WebSocket('ws://localhost:3000', {
  headers: { 'X-Api-Key': apiKey },
});
ws.on('open', () => ws.send(JSON.stringify({ type: 'register', ...agent })));
ws.on('message', (data) => console.log(JSON.parse(data.toString())));
```

Replace the wallet placeholder with the same address used during HTTP registration. A `register` message cannot create an
unregistered agent or change its configured wallet. After safely accepting a dispatched job, send an `ack` message with the
socket's registered `id` and that `jobId`; it can remove work only from that agent's pending queue. Unauthenticated control
messages cannot register dispatch routes or acknowledge jobs. Browser clients cannot set these handshake headers through the
native WebSocket constructor; keep the operator credential in a trusted server client and use the public subscriber example
for browser views. Use `wss://` through your deployment's TLS endpoint.

## Persistence and recovery

The gateway keeps live job and agent indexes, pending deliveries and timers in memory. Deliverable, heartbeat and telemetry
records are file-backed under `storage/deliverables`; employer plans are stored under `storage/employer/plans` and loaded on
startup. These locations are relative to the runtime package: source execution uses repository-root `storage`, while the compiled
service uses `agent-gateway/dist/storage`. The container path is `/app/agent-gateway/dist/storage`; mount a durable writable volume
owned by the service user. Validator commitments can use a separate absolute `VALIDATION_STORAGE_DIR` with the strict private
directory permissions described in the [service reference](../agent-gateway/README.md#private-validator-state).

New deliverable, heartbeat and telemetry records are written to `storage/deliverables/deliverables.sqlite`. Prepared SQL
statements store each record and its large telemetry payload in one transaction; memory indexes update after commit. Existing
private JSONL journals and UUID-named telemetry files remain read-only sources alongside the database. Startup reads both old
and new records; it does not delete, rewrite or automatically migrate history. Payload `path` values remain opaque locators:
the gateway checks the database first, then legacy files. A new locator need not correspond to a standalone file.

The store validates plain JSON before submission side effects. Each serialized record or payload is limited to 1 MiB, with
nesting depth at most 32 and at most 16,384 visited values. Submission inputs have a 960 KiB preflight limit, reserving 64 KiB
for generated receipt metadata. Telemetry up to 8 KiB can remain inline; larger accepted payloads are stored in the same SQLite
transaction. Each record kind has a 64 MiB budget for new record/payload JSON plus historical JSONL bytes; old standalone
payload files remain outside the database. A separate 256 MiB SQLite
page limit includes payloads, indexes and database overhead. These fixed limits are independent of transport limits and have
no environment overrides. Cycles, getters, custom object prototypes and non-finite numbers are rejected.

Deliverable directories must be private (`0700`), and database/legacy files must be private regular files (`0600`) owned by the
service user. Symlinks, hard-linked files and unsafe existing paths are rejected. For an existing store, stop the gateway,
preserve a backup, verify ownership and correct permissions before restarting; the service does not silently repair permissions.
Run one gateway writer per evidence store: SQLite transactions do not synchronize live queues, nonces, timers or transaction
decisions between gateway replicas.

Back up the entire deliverables directory with the gateway stopped, including `deliverables.sqlite`, any SQLite recovery
sidecars and all legacy journals/payloads. SQLite uses `DELETE` journal mode and `synchronous=FULL`, with no persistent WAL.
Do not copy only a live database file or delete a recovery sidecar to force startup. Preserve and test recovery from the complete
backup before resuming work. Limits do not trigger automatic truncation or deletion; plan retention before reaching them.

Readiness checks verify a SQLite write transaction and available record/database budgets but do not reserve disk space.
Readiness conservatively requires 2 MiB plus one byte of remaining per-kind capacity and 4 MiB of effective database-page
capacity, including reusable free pages. It can reject a submission before a hard storage cap is reached.
Storage failures use `DELIVERABLE_STORAGE_*` codes. A final persistence failure can still follow a confirmed on-chain submission,
so reconcile its receipt before retrying; SQLite does not make blockchain and local writes one atomic operation. Stored JSON
escapes HTML delimiters while retaining decoded values. Its text remains untrusted: never execute it or serve the private
evidence volume as web content.

File persistence does not provide distributed locking across gateway instances or a checkpointed replay of missed job events.
After a restart, reconcile active jobs and wallet transactions with canonical chain state, re-register external agents as needed,
and recover pending work before resuming execution. Keep commitment records and reveal salts private and preserve them during
recovery. Run the [production rehearsal](production/rehearsal.md) and verify restart, provider failure, independent acceptance and
settlement against the intended deployment before commissioning it.
