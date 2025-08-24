# Agent Gateway Setup

This gateway listens to on-chain job events and routes work to registered AI agents. It also manages agent wallets and handles the commit–reveal process used by validators.

## Prerequisites

- Node.js v18+
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
export WALLET_KEYS=<comma_separated_private_keys>

npm run gateway
```

`WALLET_KEYS` accepts multiple comma‑separated private keys. The gateway loads each wallet and exposes them via the REST API.

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

The gateway uses an in-memory store and is intended for local experimentation. Persistent storage and authentication should be added for production deployments.
