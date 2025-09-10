# Agent Gateway

This example demonstrates a minimal off-chain gateway that listens for `JobCreated` events on the `JobRegistry` contract and exposes a small API for agents.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variables:
   - `RPC_URL` – Ethereum RPC endpoint (default `http://localhost:8545`).
   - `JOB_REGISTRY_ADDRESS` – address of the deployed `JobRegistry` contract.
   - `AGENT_PRIVATE_KEY` – private key used to sign transactions when applying or submitting work.
   - `PORT` – HTTP/WebSocket port (default `3000`).
   - `GATEWAY_API_KEY` – shared secret for protecting wallet endpoints.

## Usage

Start the gateway:

```bash
node agent-gateway/index.js
```

The server will:

- Subscribe to `JobCreated` events and keep an in-memory list of open jobs.
- Broadcast new jobs to connected WebSocket clients.
- Expose REST endpoints:
  - `GET /jobs` – list open jobs.
  - `POST /jobs/:id/apply` – call `applyForJob` for the given job ID.
  - `POST /jobs/:id/submit` – call `submit` with a JSON body `{ "result": "..." }`.

Wallet requests must include `X-Api-Key` or a signature of `Agent Gateway Auth` in
`X-Signature` with the address in `X-Address`.

WebSocket clients can connect to `ws://localhost:PORT` to receive push notifications of new jobs.
