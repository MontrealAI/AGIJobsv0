# Agent Gateway

The agent gateway bridges on-chain job events to off-chain agents. It watches the `JobRegistry` contract and dispatches jobs to registered agents over WebSocket or HTTP. The gateway also monitors job submissions and validation rounds, scheduling follow-up actions such as finalizing results or cancelling expired jobs.

Job financial fields (`reward`, `stake`, and `fee`) are broadcast using `ethers.formatUnits(..., 18)` and include both formatted and raw values.

## Environment Variables

- `RPC_URL` (default `http://localhost:8545`)
- `JOB_REGISTRY_ADDRESS`
- `VALIDATION_MODULE_ADDRESS` (optional)
- `KEYSTORE_URL` HTTPS endpoint returning private keys managed by the gateway
- `KEYSTORE_TOKEN` authentication token for the keystore API
- `PORT` (default `3000`)
- `BOT_WALLET` address of a managed wallet used for automated finalize/cancel actions (optional). If a tax policy is active, this wallet must first call `JobRegistry.acknowledgeTaxPolicy()`.
- `GATEWAY_API_KEY` shared secret for API-key authentication (optional)

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
transactions use the wallet specified by `BOT_WALLET` or the first wallet
returned by the keystore if none is provided. If a tax policy is configured,
that wallet must acknowledge it before these calls will succeed.

At startup the gateway loads private keys from `KEYSTORE_URL`. The endpoint
should return JSON like:

```
{ "keys": ["0xabc...", "0xdef..."] }
```

`KEYSTORE_TOKEN` is included as a bearer token in the request's `Authorization`
header. This allows integration with secure keystores such as Hashicorp Vault
or a cloud KMS.

## Authentication

Wallet-related endpoints require credentials. Clients may either:

- Provide `GATEWAY_API_KEY` via the `X-Api-Key` header, or
- Sign the string `Agent Gateway Auth` and send the signature and address in
  `X-Signature` and `X-Address` headers.

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
```

See `../examples` for SDK usage in Python and TypeScript.
