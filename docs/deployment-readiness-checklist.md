# AGI Jobs v0 Deployment Readiness Checklist

This checklist condenses the operational knowledge required to take the AGI Jobs v0 orchestrator to production at scale. It mirrors the planner → simulator → runner pipeline that powers the `/onebox` endpoints and highlights the owner controls that must be verified before any launch.

## 1. Pipeline Integrity

- **Planner** (`POST /onebox/plan`)
  - Confirms that free-form requests are normalised into `JobIntent` payloads, generates a deterministic plan hash, records a receipt, and reports any missing fields for user clarification.  
    _Reference:_ `plan()` implementation and `_detect_missing_fields()` logic. 【F:routes/onebox.py†L1783-L1841】【F:routes/onebox.py†L1438-L1512】
- **Simulator** (`POST /onebox/simulate`)
  - Replays policy checks, budget calculations, deadline caps, and status lookups without touching the chain.  
  - Returns structured risk and blocker codes, and blocks execution with HTTP 422 when policy or data requirements are unmet.  
    _Reference:_ `simulate()` safeguards and policy enforcement helpers. 【F:routes/onebox.py†L1840-L2035】【F:routes/onebox.py†L1514-L1673】
- **Runner** (`POST /onebox/execute` + `GET /onebox/status`)
  - Handles wallet or relayer execution, pins receipts/results to IPFS, and exposes auditable run state (including job IDs, fees, burn amounts, transaction hashes, and attestation digests).  
    _Reference:_ Execution helpers and receipt propagation pipeline. 【F:routes/onebox.py†L1675-L1781】【F:routes/onebox.py†L1185-L1427】

✅ **Action:** Exercise each endpoint end-to-end (plan → simulate → execute → status) on a staging RPC using representative scenarios (new job, finalize job, invalid request) and archive the receipts for compliance.

## 2. Owner Control Surface

- **Policy Caps:** Review and, if necessary, update `storage/org-policies.json` to enforce reward and deadline ceilings per organisation.  
  _Reference:_ Org policy loader and enforcement integration. 【F:routes/onebox.py†L290-L325】【F:routes/onebox.py†L1548-L1603】
- **Protocol Parameters:** Ensure on-chain fee & burn percentages, registry/token addresses, and token decimals are configured via environment variables for the target network.  
  _Reference:_ Environment-driven configuration constants. 【F:routes/onebox.py†L48-L121】
- **Relayer & Wallet Modes:** Validate that relayer keys (if used) are provisioned securely and that wallet-mode call data is accepted by the intended signing clients.  
  _Reference:_ Mode branching and transaction preparation. 【F:routes/onebox.py†L1185-L1367】
- **Emergency Procedures:** Confirm that contract pause/upgrade controls are documented for the ops team, and that the orchestrator API token can be rotated or revoked instantly.

✅ **Action:** Run `npm run owner:doctor` and `npm run owner:dashboard` to produce owner control diagnostics prior to launch; store outputs with deployment artefacts.

## 3. Observability & Compliance

- **Prometheus Metrics:** Scrape `/onebox/metrics` and verify counters/histograms for plan, simulate, execute, status, and time-to-outcome are emitting.  
  _Reference:_ Metric registration for each pipeline stage. 【F:routes/onebox.py†L209-L237】
- **Receipts & Attestations:** Confirm receipt JSON blobs include plan hash, run identifiers, fee/burn breakdowns, gateway URLs, and attestation digests for audit replay.  
  _Reference:_ Receipt assembly and attestation propagation. 【F:routes/onebox.py†L1675-L1761】
- **Logging:** Ensure structured logs capture `correlation_id`, intent type, and outcome for every request; route them to central logging with retention ≥ 90 days.  
  _Reference:_ `_log_event` usage across planner, simulator, runner. 【F:routes/onebox.py†L1765-L1777】【F:routes/onebox.py†L1995-L2035】

✅ **Action:** Execute `npm run docs:verify` (link integrity), `npm run owner:health` (network reachability), and smoke tests against observability dashboards before granting production traffic.

## 4. CI & Release Gates

- Align pipeline jobs (lint, tests, coverage, security, gas, docs) with GitHub branch protection so that merges to `main` mirror the local commands below.
  _Key Scripts:_ `npm run lint:check`, `npm test`, `npm run coverage:check`, `npm run security:audit`, `npm run gas:check`, `npm run docs:verify`. 【F:package.json†L8-L131】
 - Require hardware-backed signed release tags and verify them in CI before publishing artefacts. Run
   `npm run ci:verify-signers` during release prep to catch format issues before the workflow executes.
   _Reference:_ `scripts/ci/ensure-tag-signature.js`, `scripts/ci/check-signers.js`, and the [Release Provenance & Tag Signing](release-provenance.md) playbook. 【F:scripts/ci/ensure-tag-signature.js†L1-L70】【F:scripts/ci/check-signers.js†L1-L103】【F:docs/release-provenance.md†L1-L104】
- Require green runs of planner→simulator→runner integration tests on every PR, plus manual owner checklist sign-off for production rollouts.

✅ **Action:** Mirror the above commands in CI (GitHub Actions or equivalent) and enforce mandatory status checks plus review requirements on both PR and default branches.

---
**Sign-off:** Only after the above steps are completed, file the deployment record with attached receipts, policy diff, CI summary, and observability snapshots to maintain a provable compliance trail.
