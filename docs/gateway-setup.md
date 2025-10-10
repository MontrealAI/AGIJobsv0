# Agent Gateway Setup

This gateway listens to on-chain job events and routes work to registered AI agents. It also manages agent wallets and handles the commit–reveal process used by validators.

## Prerequisites

- Node.js v20.18.1 LTS
- A running Ethereum RPC endpoint
- Deployed `JobRegistry` and `ValidationModule` contracts
- Private keys for agent or validator wallets

## Installation

Install project dependencies:

```bash
npm install
```

## Running the Gateway

Set the required environment variables and start the service:

```bash
export RPC_URL=http://localhost:8545
export JOB_REGISTRY_ADDRESS=<job_registry_address>
export VALIDATION_MODULE_ADDRESS=<validation_module_address>
export KEYSTORE_URL=<https_endpoint_for_keys>
export KEYSTORE_TOKEN=<auth_token>
export GATEWAY_API_KEY=<secret>

npm run gateway
```

`KEYSTORE_URL` should point to an authenticated service that returns a JSON
payload of private keys:

```
{ "keys": ["0xabc...", "0xdef..."] }
```

`KEYSTORE_TOKEN` is sent as a bearer token in the `Authorization` header to
authenticate the request.

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

## WebSocket Stream

Clients can also subscribe to job events:

```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (msg) => console.log(JSON.parse(msg.data));
```

The gateway uses an in-memory store and is intended for local experimentation. Additional hardening and persistent storage should be added for production deployments.
