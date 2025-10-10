# Meta-Orchestration Overview

The AGI Jobs "one-box" orchestrator exposes a three-stage planner → simulator → runner pipeline over the `/onebox/*` API.  The
chain is designed so that every request is parsed, stress-tested, and then executed under audit-friendly controls.  This document
summarises how each stage behaves today, the payloads it accepts and returns, and how operators can keep the system production
ready.

> **At a glance**
>
> 1. **Planner** transforms natural language into a structured `JobIntent`, highlights missing fields, and generates a canonical
>    `planHash` to bind subsequent stages.
> 2. **Simulator** replays the intent off-chain, enforcing policy caps and surfacing human-readable confirmations, `risks`, and
>    `blockers` before any transaction is prepared.
> 3. **Runner** executes the intent on-chain (or prepares wallet data), records receipts to IPFS, and exposes live status updates
>    via `/onebox/status`.

## Planner

* **Endpoint**: `POST /onebox/plan`
* **Input**: JSON body with `{ "text": "…" }` and optional attachments.  The router extracts intent metadata, including reward
  amounts and deadlines using the heuristics in `orchestrator/planner.py`.
* **Output**: `PlanResponse` containing:
  * `summary` – ≤140 character confirmation string with fee/burn info.【F:routes/onebox.py†L1622-L1668】
  * `intent` – canonical `JobIntent` object; the backend will recompute the hash from this payload at simulate/execute time.
  * `missingFields` – list of unresolved parameters (for example `reward_agialpha`, `deadline_days`, `job_id`).  When populated the
    backend sets `requiresConfirmation` to `false`, signalling the UI to gather more input before proceeding.【F:orchestrator/planner.py†L320-L372】【F:routes/onebox.py†L1648-L1667】
  * `warnings` – non-fatal notes such as `DEFAULT_REWARD_APPLIED` if the planner temporarily filled in defaults.【F:orchestrator/planner.py†L328-L356】
  * `planHash` – SHA-256 hash of the normalised intent, emitted as `0x…` strings for downstream correlation.【F:routes/onebox.py†L1503-L1518】
  * Every plan hash persists an intent snapshot and the list of unresolved fields.  Subsequent stages only accept updates that fill those specific gaps; any other mutation triggers `PLAN_HASH_MISMATCH`, while unknown hashes now return `PLAN_HASH_UNKNOWN` to force a re-plan.【F:routes/onebox.py†L902-L1001】【F:routes/onebox.py†L1673-L1687】
  * Optional receipt metadata when the planner emits an attestation (used by the UX to preview receipts ahead of execution).

**Error handling**

* Empty requests return HTTP 400 `INPUT_TEXT_REQUIRED`.
* Parsing failures surface structured error codes from `backend/errors/catalog.json` so the chat client can translate them into
  user-friendly prompts.

**Operator checklist**

* Keep `storage/org-policies.json` updated – missing fields are mirrored into receipts so you can review how often defaults are
  used and adjust onboarding prompts accordingly.
* Monitor `plan_total` and `time_to_outcome_seconds{endpoint="plan"}` Prometheus metrics to track planner latency and success
  rates.【F:routes/onebox.py†L1717-L1725】

## Simulator

* **Endpoint**: `POST /onebox/simulate`
* **Input**: `{ "intent": {…}, "planHash": "0x…", "createdAt": "…" }`.  The router recomputes the canonical hash and rejects
  mismatches (`PLAN_HASH_MISMATCH`) before performing any checks.【F:routes/onebox.py†L1689-L1734】
* **Output**: `SimulateResponse` with:
  * `summary` mirroring the planner message so the operator has identical language at each stage.【F:routes/onebox.py†L1845-L1870】
  * `risks` / `riskCodes` / `riskDetails` – soft warnings linked to friendly messages (for example low rewards or tight deadlines).
  * `blockers` – fatal policy or validation issues.  HTTP status is `422` when non-empty and the response body includes both raw
    codes and friendly guidance.  Typical examples include missing rewards, org policy violations, and jobs that are already
    finalised.【F:routes/onebox.py†L1775-L1843】【F:routes/onebox.py†L1871-L1905】
  * Budget and fee projections (`estimatedBudget`, `feePct`, `feeAmount`, `burnPct`, `burnAmount`) so finance teams can pre-check
    token flows.【F:routes/onebox.py†L1746-L1768】【F:routes/onebox.py†L1845-L1870】
  * Receipt metadata mirroring the planner to maintain an immutable audit log for off-chain decisions.

**Validation gates**

* Calls `_enforce_org_policy` to check reward and deadline caps using the latest org policy store (tenant-specific or default).【F:routes/onebox.py†L1763-L1774】
* Looks up cached job status and, when necessary, refreshes the latest on-chain state to block premature finalisation or dispute
  conflicts before they ever reach the runner.【F:routes/onebox.py†L1993-L2009】
* Falls back to wallet preparation if the account abstraction paymaster rejects a relayed transaction, allowing operators to
  finish the flow manually without losing context.【F:routes/onebox.py†L2109-L2135】

**HTTP outcomes**

| Status | Meaning | Common remediation |
| ------ | ------- | ------------------- |
| `200`  | Ready to execute.  Proceed to `/onebox/execute`. | Review any `risks` before continuing. |
| `400`  | Hash or payload mismatch. | Re-run the planner to regenerate a plan hash. |
| `400`  | Plan hash unknown/expired. | Call `/onebox/plan` again to refresh the plan hash before simulating. |
| `422`  | Blocked by policy or missing data. | Present `blockers` to the user and collect the required inputs. |

**Metrics & logging**

* `simulate_total{intent_type, http_status}` counter and `time_to_outcome_seconds{endpoint="simulate"}` histogram are published to
  `/onebox/metrics` for alerting.【F:routes/onebox.py†L1983-L1989】
* Structured log events (`onebox.simulate.success`, `onebox.simulate.blocked`, `onebox.simulate.error`) include correlation IDs
  and policy metadata, enabling downstream SIEM and compliance reporting.【F:routes/onebox.py†L1862-L1905】

## Runner

* **Endpoint**: `POST /onebox/execute`
* **Modes**: `relayer` (default) signs and broadcasts the transaction using the configured relayer key.  `wallet` returns ABI-encoded
  call data so the user can submit the transaction with their own signer.【F:routes/onebox.py†L1955-L2135】
* **Flow**:
  1. Validates the submitted `planHash` against the intent, reusing the simulator guardrails.【F:routes/onebox.py†L1991-L2032】
  2. Re-enforces org policies before building transactions.  Policy accept/reject events are logged with cap snapshots for later
     audits.【F:routes/onebox.py†L2052-L2115】
  3. Pins specs and receipts to IPFS (`_pin_json`) so every execution produces verifiable artefacts.  The response contains CIDs and
     gateway URLs for the spec, deliverables, and attested receipt.【F:routes/onebox.py†L2116-L2178】【F:routes/onebox.py†L2179-L2206】
  4. Dispatches on intent type (post, finalize, etc.).  Unsupported actions surface `UNSUPPORTED_ACTION` with friendly messaging.

* **Receipts**: `ExecuteResponse` embeds both immediate transaction context (`txHash`, `jobId`, fee/burn amounts) and the final receipt
  digest for auditors.  `/onebox/status` can be polled using the returned `planHash` and job identifiers to monitor execution state.

**Operational safeguards**

* API access requires the `ONEBOX_API_TOKEN`.  Reject unauthorised traffic via FastAPI dependency guards.【F:routes/onebox.py†L1497-L1511】
* Environment variables (`RPC_URL`, contract addresses, relayer key) are validated at startup to prevent accidental misconfiguration
  during deployments.【F:routes/onebox.py†L49-L81】
* Receipt attestation fields are propagated so operators can anchor off-chain evidence (EAS or similar) alongside the on-chain
  transaction.【F:routes/onebox.py†L1669-L1683】【F:routes/onebox.py†L1871-L1885】【F:routes/onebox.py†L2207-L2215】

## Status & Observability

* `/onebox/status` returns contract-derived job state plus any receipt metadata cached during execution.  Numeric job states are mapped
  to human-readable labels (`open`, `assigned`, `completed`, `finalized`, `disputed`).【F:routes/onebox.py†L2332-L2376】
* Background runner threads record Prometheus counters `run_success_total` and `run_fail_total` to track long-lived operations.【F:orchestrator/runner.py†L46-L79】
* Receipts pinned to IPFS include `planHash`, transaction hashes, fee breakdowns, and policy snapshots.  Use the included gateway URLs
  for spot audits or share the CID with regulators when demonstrating full traceability.【F:routes/onebox.py†L2116-L2206】

## Production Readiness Checklist

1. **CI** – ensure the V2 GitHub Actions workflow runs `npm run lint`, orchestrator tests, and forked simulations.  The `docs/ci-v2-branch-protection-checklist.md`
   and `docs/v2-ci-operations.md` files contain the required gate descriptions for branch protection.
2. **Policies** – review `storage/org-policies.json` before each release and ensure the owner account can update limits without redeploying
   the orchestrator (the store hot-reloads via `_get_org_policy_store()`).【F:routes/onebox.py†L1758-L1764】
3. **Monitoring** – forward Prometheus metrics to your institutional observability stack; pair with structured logs keyed by `correlationId`
   for full run reconstruction.
4. **Emergency controls** – the contract owner can pause job creation/finalisation through the on-chain pause mechanisms documented in
   `docs/system-pause.md`.  When paused, execute calls will bubble up the revert reason and the simulator will block on policy checks,
   preventing new funds from moving until the owner re-enables the system.【F:routes/onebox.py†L2136-L2215】

## Local validation commands

Run these commands before opening a pull request to mirror the green CI expectations:

```bash
# Planner and simulator unit suite (disable third-party auto-loaded plugins to avoid eth-typing conflicts)
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest test/orchestrator/test_planner.py
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest test/orchestrator/test_simulator.py
```

These pytest invocations exercise the full planner→simulator pipeline, covering policy enforcement, plan hash integrity, and
receipt metadata propagation.【6b0191†L1-L9】【27dd71†L1-L8】

Keeping this pipeline healthy ensures AGI Jobs v0 remains deployable at scale, with the owner retaining complete control over parameters,
observability, and execution authority.
