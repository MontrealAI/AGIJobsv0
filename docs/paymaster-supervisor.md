# Paymaster Supervisor

The paymaster supervisor is a lightweight service that brokers ERC-4337 sponsorships. It
watches `config/paymaster.yaml`, enforces per-organisation budgets, and proxies signing
requests to a remote KMS/HSM.

## Running the service

```bash
uvicorn paymaster.supervisor.process:create_app --reload --factory
```

The factory loads the YAML configuration, wires a KMS-backed signer, and exposes a FastAPI
application with:

- `POST /v1/sponsor` – request sponsorship for a user operation.
- `GET /healthz` and `GET /readyz` – surface balance-aware health status.
- `GET /metrics` – Prometheus metrics (`sponsored_ops_total` and
  `rejections_total{reason}`) describing sponsorship outcomes.

## Configuration schema (`config/paymaster.yaml`)

```yaml
chain_id: 11155111                  # EVM chain ID the paymaster is deployed on
paymaster_address: "0x…"          # Paymaster smart contract address
balance_threshold_wei: 500000000000000000  # Minimum balance required to sponsor
max_user_operation_gas: 2500000           # Aggregate gas limit allowed per userOp
default_daily_cap_wei: 100000000000000000 # Optional fallback spend cap per org
reload_interval_seconds: 2                # Poll interval for config hot reload
orgs:
  engineering:
    daily_cap_wei: 200000000000000000     # Override cap for a specific org
whitelist:
  - target: "0x…"                  # Contract address eligible for sponsorship
    selectors:
      - "0x12345678"               # Optional 4-byte method selectors for the target
```

### Request contract

`POST /v1/sponsor` expects:

```json
{
  "userOperation": { /* standard ERC-4337 user operation */ },
  "context": {
    "org": "engineering",         // Identifier checked against org caps
    "estimated_cost_wei": "100000000000000" // Gas cost estimate used for budgeting
  }
}
```

The supervisor merges this context with any defaults provided when the client was
constructed (`AA_PAYMASTER_CONTEXT` in the orchestrator). Method whitelisting is based on
the 4-byte selector found in the user operation calldata; an empty selector list means the
entire contract is allowed.

### Signing

The supervisor never stores private keys. Instead, it computes a deterministic digest of
the user operation and forwards it to a signer implementing `paymaster.supervisor.signers.Signer`.
Use `KMSSigner` to plug a cloud KMS/HSM implementation and supply a client object that exposes a
`sign(key_id, message, digest)` coroutine. A deterministic `LocalDebugSigner` is provided for
local development and testing.

### Environment variables

The supervisor automatically selects a signer based on the environment:

- `PAYMASTER_KMS_KEY_URI` (required for production) – full Google Cloud KMS
  crypto key version resource used for sponsorship signatures.
- `PAYMASTER_KMS_REGION` – optional region hint; when set, the client connects to
  `<region>-kms.googleapis.com` unless `PAYMASTER_KMS_ENDPOINT` overrides it.
- `PAYMASTER_KMS_ENDPOINT` – optional custom endpoint for private service
  connect or emulators.
- `PAYMASTER_KMS_DIGEST` – digest algorithm used when calling KMS (defaults to
  `sha256`).
- `PAYMASTER_LOCAL_SIGNER_SECRET` – development override that forces the
  in-process deterministic signer.

If no KMS key URI is configured the application falls back to the local debug signer.

### Hot reloading

Every `reload_interval_seconds`, the supervisor checks for modifications to the YAML file
and reloads it if necessary. Changes take effect without restarting the process and budget
trackers reset when a new configuration is applied.
