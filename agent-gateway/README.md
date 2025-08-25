# Agent Gateway

The agent gateway bridges on-chain job events to off-chain agents. It watches the `JobRegistry` contract and dispatches jobs to registered agents over WebSocket or HTTP.

## Environment Variables

- `RPC_URL` (default `http://localhost:8545`)
- `JOB_REGISTRY_ADDRESS`
- `VALIDATION_MODULE_ADDRESS` (optional)
- `WALLET_KEYS` comma separated private keys managed by the gateway
- `PORT` (default `3000`)

Copy `.env.example` to `.env` and adjust values for your network:

```
cp agent-gateway/.env.example agent-gateway/.env
```

## Usage

```
npm run gateway
```

Agents register via REST or WebSocket and receive jobs through WebSocket.
Each dispatched job must be acknowledged with an `ack` message. Pending
jobs are re-sent when a connection is re-established.

The gateway also exposes helpers for committing and revealing validation
results through REST endpoints:

```
POST /jobs/:id/commit { address, approve }
POST /jobs/:id/reveal { address }
```

See `../examples` for SDK usage in Python and TypeScript.
