# Agent Gateway

The agent gateway bridges on-chain job events to off-chain agents. It watches the `JobRegistry` contract and dispatches jobs to registered agents over WebSocket or HTTP. The gateway also monitors job submissions and validation rounds, scheduling follow-up actions such as finalizing results or cancelling expired jobs.

## Environment Variables

- `RPC_URL` (default `http://localhost:8545`)
- `JOB_REGISTRY_ADDRESS`
- `VALIDATION_MODULE_ADDRESS` (optional)
- `WALLET_KEYS` comma separated private keys managed by the gateway
- `PORT` (default `3000`)
- `BOT_WALLET` address of a managed wallet used for automated finalize/cancel actions (optional)

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

The gateway listens for `JobSubmitted` and validation start events. When the
reveal window closes it calls `ValidationModule.finalize`, and if a job misses
its deadline it invokes `JobRegistry.cancelExpiredJob`. These automated
transactions use the wallet specified by `BOT_WALLET` or the first wallet in
`WALLET_KEYS` if none is provided.

The gateway also exposes helpers for committing and revealing validation
results through REST endpoints:

```
POST /jobs/:id/commit { address, approve }
POST /jobs/:id/reveal { address }
```

See `../examples` for SDK usage in Python and TypeScript.
