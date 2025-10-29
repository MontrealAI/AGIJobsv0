# Agent Gateway

The agent gateway bridges on-chain job events to off-chain agents. It watches the `JobRegistry` contract and dispatches jobs to registered agents over WebSocket or HTTP. The gateway also monitors job submissions and validation rounds, scheduling follow-up actions such as finalizing results or cancelling expired jobs.

Job financial fields (`reward`, `stake`, and `fee`) are broadcast using `ethers.formatUnits(..., 18)` and include both formatted and raw values.

## Environment Variables

- `RPC_URL` (default `http://localhost:8545`)
- `ENS_REGISTRY_ADDRESS` ENS registry used for subdomain minting
- `ENS_REVERSE_REGISTRAR_ADDRESS` reverse registrar contract used to set reverse lookups
- `ENS_OWNER_KEY` private key that controls the parent ENS nodes listed in `config/ens.json`
- `JOB_REGISTRY_ADDRESS`
- `VALIDATION_MODULE_ADDRESS` (optional)
- `KEYSTORE_URL` HTTPS endpoint returning private keys managed by the gateway
- `KEYSTORE_TOKEN` authentication token for the keystore API
- `PORT` (default `3000`)
- `GRPC_PORT` (default `50051`) gRPC interface for agent automation
- `BOT_WALLET` address of a managed wallet used for automated finalize/cancel actions (optional). If a tax policy is active, this wallet must first call `JobRegistry.acknowledgeTaxPolicy()`.
- `GATEWAY_API_KEY` shared secret for API-key authentication (optional)
- `ENERGY_ORACLE_URL` endpoint that accepts telemetry payloads (optional – required for operator rewards)
- `ENERGY_ORACLE_TOKEN` bearer token when publishing telemetry to the oracle (optional)
- `ENERGY_ORACLE_REQUIRE_SIGNATURE` set to `true` to require cryptographic signing of telemetry payloads; when enabled the orchestrator wallet must own an ENS name under `*.a.agi.eth`
- `AUDIT_ANCHOR_INTERVAL_MS` cadence for Merkle anchoring the audit log (default `21600000`, i.e. 6 hours)
- `AUDIT_ANCHOR_MIN_NEW_EVENTS` minimum number of new audit records required before an automated anchor is attempted (default `5`)
- `AUDIT_ANCHOR_START_DELAY_MS` optional delay before the first anchoring cycle begins (default `0`)
- `CERTIFICATE_MFS_PATH` IPFS MFS directory that stores per-job certificate metadata (default `/certificates`)
- `CERTIFICATE_IPNS_KEY` optional IPNS key name used when publishing the certificate metadata directory
- `CERTIFICATE_BASE_URI` base URI passed to `CertificateNFT.setBaseURI`, typically an `ipfs://` or IPNS prefix ending with `/`
- `CERTIFICATE_LOCK_BASE_URI` set to `true` to invoke `CertificateNFT.lockBaseURI()` immediately after deployment

Copy `.env.example` to `.env` and adjust values for your network:

```
cp agent-gateway/.env.example agent-gateway/.env
```

`config/ens.json` defines the parent ENS nodes and resolver addresses for the
registrar helper. The agent factory uses this file together with the
environment variables above to claim `<label>.agent.agi.eth`,
`<label>.club.agi.eth`, or `<label>.a.agi.eth` automatically and verifies the
reverse lookup before persisting an identity file.

## Certificate metadata

When a job submission succeeds the gateway now writes a certificate metadata
document to the configured IPFS node. Each record includes the result hash,
agent signature, deliverable CID/URI, and any SLA reference extracted from the
job spec. The metadata files live under `CERTIFICATE_MFS_PATH` and, when
`CERTIFICATE_IPNS_KEY` is provided, the directory CID is republished via IPNS so
that the on-chain `CertificateNFT` base URI remains stable. Set
`CERTIFICATE_BASE_URI` during deployment to ensure `tokenURI(tokenId)` resolves
to these proofs.

## Usage

```
npm run gateway
```

Agents register via REST or WebSocket and receive jobs through WebSocket.
Each dispatched job must be acknowledged with an `ack` message. Pending
jobs are re-sent when a connection is re-established.

The gateway listens for `ResultSubmitted` and validation start events. When the
reveal window closes it calls `ValidationModule.finalize`, and if a job misses
its deadline it invokes `JobRegistry.cancelExpiredJob`. These automated
transactions use the wallet specified by `BOT_WALLET` or the first wallet
returned by the keystore if none is provided. If a tax policy is configured,
that wallet must acknowledge it before these calls will succeed.

When operator telemetry is enabled (`ENERGY_ORACLE_URL` configured) the
gateway batches energy samples and forwards them to the oracle. If
`ENERGY_ORACLE_REQUIRE_SIGNATURE=true` the payload is signed by the
orchestrator wallet, including its ENS name when available, so operators can
provide cryptographically verifiable energy reports for reward claims.

If one of the managed wallets owns a validator ENS identity under
`*.club.agi.eth`, the gateway now participates in commit–reveal validation
automatically. When a managed validator address is selected for a job the
gateway retrieves the submission artifact, verifies the integrity hash, and
commits an approve/reject vote. Reveals are scheduled shortly after the commit
window closes, and validation telemetry is logged for energy/oracle reporting.
The validator state is observable via `GET /validator/assignments`.

At startup the gateway loads private keys from `KEYSTORE_URL`. The endpoint
should return JSON like:

```
{ "keys": ["0xabc...", "0xdef..."] }
```

`KEYSTORE_TOKEN` is included as a bearer token in the request's `Authorization`
header. This allows integration with secure keystores such as Hashicorp Vault
or a cloud KMS.

### Keystore write API

When the agent factory mints a new blueprint wallet it immediately writes the
private key back to the keystore before registering the wallet locally. The
gateway issues a `POST` request to `KEYSTORE_URL` (falling back to `PUT` when a
`405 Method Not Allowed` or `501 Not Implemented` response is returned). The
request includes the bearer token defined by `KEYSTORE_TOKEN` and a JSON body:

```
{
  "privateKey": "0xabc...",
  "address": "0x123...",
  "label": "example-agent",
  "metadata": {
    "blueprintId": "<uuid>",
    "category": "research",
    "ensName": "example-agent.agent.agi.eth"
  }
}
```

Responses **must** use a JSON content type (or an empty body with status `204`)
and return a success status in the 200 range. The gateway treats any other
response as a failure and aborts the clone so operators should ensure the
endpoint durably persists the key before acknowledging the request. The helper
observes the `FETCH_TIMEOUT_MS` window, retries once on transient network or
timeout errors, and logs failures for troubleshooting.

## Authentication

Wallet-related endpoints require credentials. Clients may either:

- Provide `GATEWAY_API_KEY` via the `X-Api-Key` header, or
- Retrieve the current challenge and sign it with a managed wallet.

Signature authentication is nonce-based. Call `GET /auth/challenge` to obtain the
current nonce and challenge payload:

```bash
curl http://localhost:3000/auth/challenge
# { "nonce": "0x...", "message": "Agent Gateway Auth", "challenge": "Agent Gateway Auth0x..." }
```

Sign the `challenge` field (equivalent to concatenating `message` and `nonce`)
and include the result in the headers:

```
X-Address: 0xYourWallet
X-Signature: 0xSignatureOf("Agent Gateway Auth" + nonce)
```

Unauthorized requests also echo the latest challenge so agents can retry
without an additional round-trip.

Example using an API key:

```bash
curl -X POST http://localhost:3000/jobs/1/apply \
  -H 'X-Api-Key: <secret>' \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x..."}'
```

The gateway also exposes helpers for committing and revealing validation
results through REST endpoints. Final payout still requires the employer to
burn their fee share, submit a receipt, confirm the burn, and then call
`acknowledgeAndFinalize` on `JobRegistry` from their own wallet.

```
POST /jobs/:id/commit { address, approve }
POST /jobs/:id/reveal { address }
GET  /health
GET  /efficiency
GET  /efficiency/:agent[?category=categoryKey]
GET  /telemetry/insights[?limit=10&includeJobs=true&jobsPerAgent=5]
GET  /telemetry/insights/:agent[?includeJobs=true&jobLimit=5]
GET  /telemetry/insights/:agent/jobs/:jobId
GET  /jobs/:id[?includeContributors=false&includePrimary=false]
GET  /jobs/:id/contributors[?includePrimary=false&address=0x...]
GET  /opportunities/backtest[?limit=200&minConfidence=0.3&maxAgeHours=48]
GET  /opportunities[?limit=25]
GET  /opportunities/:jobId
GET  /audit/anchors[?limit=25]
POST /audit/anchors { force?, minNewEvents? }
```

The `/efficiency` endpoints expose thermodynamic efficiency analytics derived
from training records and runtime telemetry. `GET /efficiency` returns the
computed leaderboard for every managed agent, while `GET /efficiency/:agent`
provides an individual breakdown. When a `category` query parameter is
present, the gateway responds with the metrics for that specialised domain –
for example, `validation` or a custom agent discipline. ENS names can be used
in place of raw addresses and are resolved automatically before lookup.

The `/telemetry/insights` family exposes the raw energy telemetry rollups that
power the efficiency engine. `GET /telemetry/insights` returns the global view
of agent runtime costs ordered by total energy consumption. Clients can request
`includeJobs=true` to attach the heaviest jobs per agent (optionally limited by
`jobsPerAgent`). The `:agent` variant narrows the response to a single agent,
and `/telemetry/insights/:agent/jobs/:jobId` retrieves the stored metrics for a
specific job execution. ENS names are accepted for the agent parameter and are
resolved to the corresponding address automatically.

The `/opportunities` endpoints expose the orchestrator's bidding forecasts.
`GET /opportunities` returns the most recent opportunity assessments (newest
first) while `GET /opportunities/:jobId` retrieves the stored forecast for a
specific job identifier. Forecasts include the orchestrator's recommended
agent, projected thermodynamic efficiency, expected net reward, and any
actions—such as staking adjustments—that were suggested when the job was
evaluated.

`GET /opportunities/backtest` analyses those forecasts against the recorded job
outcomes and telemetry to produce calibration metrics. The report surfaces
agent-level accuracy, reward and energy error distributions, and coverage
statistics so the orchestrator can refine bidding heuristics and continuous
learning routines.

The `/audit/anchors` endpoints manage the Merkle anchoring cadence for the
gateway's structured audit log. `GET /audit/anchors` returns the recorded
anchors (newest last) alongside scheduler telemetry, while the authenticated
`POST /audit/anchors` route forces an anchor cycle or adjusts the minimum
number of new events required for that cycle. Anchoring requests sign the
Merkle root with the orchestrator wallet so downstream auditors can verify
lineage without trusting the gateway.

## gRPC API

For autonomous agents that prefer a binary protocol, the gateway exposes a
gRPC service on `GRPC_PORT`. The protobuf definition lives at
`agent-gateway/protos/agent_gateway.proto` and includes RPCs for submitting
deliverables (`SubmitResult`), streaming heartbeats and Alpha-AGI telemetry
(`RecordHeartbeat`/`RecordTelemetry`), querying the full job context
(`GetJobInfo`, including contributor summaries for multi-agent workflows and a `contributorCount` hint), and orchestrating staking or reward claims
(`EnsureStake`/`GetStake`/`AutoClaimRewards`).

Each RPC expects the caller to authenticate with a managed wallet, mirroring
the REST API. That makes it straightforward to plug multi-agent orchestrators
directly into the gateway without additional transport glue, while still
capturing telemetry, contributor signatures, and on-chain proofs end to end.

See `../examples` for SDK usage in Python and TypeScript.
