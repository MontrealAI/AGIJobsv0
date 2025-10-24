# Secrets Rotation & Storage Plan

This guide defines how orchestration operators manage credentials and encryption
keys introduced by the rate-limiting and privacy upgrades.

## Inventory

| Secret | Location | Primary Use |
| --- | --- | --- |
| `ONEBOX_API_TOKEN` / `API_TOKEN` | FastAPI + Express env | Authenticates orchestrator clients |
| `ONEBOX_RELAYER_PRIVATE_KEY` | FastAPI env | Signs blockchain transactions |
| `ONEBOX_RECEIPT_ENCRYPTION_KEY` | Express env | Optional AES-256-GCM encryption for receipts |
| `META_API_RATE_LIMIT_*` | FastAPI env | Configures rate limiting windows |
| `ONEBOX_RATE_LIMIT_*` | Express env | Configures UI rate limiting windows |

## Secure Storage

* **Preferred** – Hardware-backed secret stores (AWS Secrets Manager, HashiCorp
  Vault) with automatic versioning. Keys are injected into deployment manifests
  just-in-time.
* **Fallback** – Kubernetes secrets or `.env` files encrypted with SOPS. Files
  must be committed only to private infrastructure repos.
* **Receipt encryption key** – Store as 32-byte random value (Base64 preferred).
  The same key must be provided to all one-box instances to allow decryption.

## Rotation Cadence

| Secret | Frequency | Trigger |
| --- | --- | --- |
| API tokens | 30 days | Scheduled calendar or suspected leak |
| Relayer key | 45 days | Scheduled; immediately on compromise indicators |
| Receipt encryption key | 90 days | Scheduled or upon breach of storage medium |
| Rate-limit env config | As needed | Traffic pattern changes |

## Rotation Procedure

1. **Stage** – Provision the new secret in the secret manager. For relayer keys,
   pre-fund and pre-authorise on-chain rights where required.
2. **Deploy** – Update the deployment manifest/environment variables. For
   encryption keys, roll out to all instances simultaneously to avoid read
   failures.
3. **Verify** – Run health checks (`/healthz`, `/onebox/plan`) and monitor logs
   for authentication errors.
4. **Revoke** – Remove the previous secret from secret manager, revoke API token
   in downstream systems, and archive audit artefacts.

## Incident Response Hooks

* Maintain a run-book entry for forced rotation, referencing this document.
* For relayer compromise, immediately pause orchestrator execution while new
  keys propagate and re-validate planned runs using the new CSRF+rate limited
  endpoints.
* Audit the receipt store for unauthorized access; if encryption was disabled,
  retroactively enable it and re-pin receipts through the attestation flow.

