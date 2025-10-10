# One-Box Owner Operations Guide

This guide distills the controls a contract owner needs to keep the AGI Jobs one-box pipeline production-ready.  It is written for non-technical decision makers who must tune parameters, validate plans, and prove compliance without touching the code base.  Every instruction below maps directly to the FastAPI router in [`routes/onebox.py`](../routes/onebox.py) and the simulator/planner utilities under [`orchestrator/`](../orchestrator/).

## 1. Configure authoritative parameters

### 1.1 Protocol economics

- **Protocol fee and burn:** Set `ONEBOX_DEFAULT_FEE_PCT` / `ONEBOX_FEE_PCT` and `ONEBOX_DEFAULT_BURN_PCT` / `ONEBOX_BURN_PCT` before starting the service.  The orchestrator reads the current percentages at runtime via `orchestrator.config.get_fee_fraction()` and `get_burn_fraction()`, falling back to the JSON defaults in `config/job-registry.json` (5% fee, 2% burn).  Update the environment and restart the service whenever governance adjusts on-chain policy so plan/simulate summaries stay accurate.
- **Token metadata:** The router converts rewards using `AGIALPHA_TOKEN` and `AGIALPHA_DECIMALS`.  Keep these in sync with the deployed token address and decimals; restart after any change so wallet encodings remain correct.

### 1.2 Organisational policy guardrails

- **Budget and deadline caps:** Edit `storage/org-policies.json` (or set `ORG_MAX_BUDGET_WEI` / `ORG_MAX_DEADLINE_DAYS` for global defaults).  The shared `OrgPolicyStore` loads this file and persists updates from `_get_org_policy_store().update(...)`, ensuring every simulate/execute call applies the latest caps before transactions are prepared.
- **Tool allow-lists:** Include an `"allowedTools"` array in the same policy file to restrict which planner or runner tools may execute for a tenant.  Leaving the list empty allows all tools; specifying entries enforces prefix or exact matches across the pipeline.

### 1.3 Access control & signing

- **API authentication:** Set `ONEBOX_API_TOKEN` (or `API_TOKEN`) and require callers to send `Authorization: Bearer <token>`.  The router rejects missing or invalid tokens before any orchestration work occurs.
- **Relayer credentials:** Provide `ONEBOX_RELAYER_PRIVATE_KEY` when you want the backend to broadcast transactions.  Omit the key to force `mode: "wallet"` responses so end users sign the payloads themselves.  Either way, the plan hash ensures the plan being executed matches the most recently approved intent.
- **Contract wiring:** Supply `JOB_REGISTRY`, `RPC_URL`, and optional `ONEBOX_EXPLORER_TX_BASE` so receipt links and post/finalize calls target the correct network.

## 2. Run the planner → simulator → runner pipeline

All endpoints live under `/onebox/*` and require the bearer token.

### 2.1 Plan

```bash
curl -sS \
  -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$ONEBOX_URL/onebox/plan" \
  -d '{"text":"Post a research job with 50 AGIALPHA reward and 7 day deadline."}'
```

The response contains:

- `summary` (≤140 chars) explaining what will be posted, including fee/burn percentages.
- `intent` – the canonical JSON that every later stage reuses.
- `planHash` – the SHA-256 identifier binding simulator, execution, status, and receipts.
- `missingFields` – any required parameters still empty (for example, reward or deadline).  Do not continue until you collect the missing values and re-plan.
- `warnings` – notes such as `DEFAULT_REWARD_APPLIED`; treat them as prompts to review the plan with the requester before simulating.

### 2.2 Simulate

```bash
curl -sS \
  -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$ONEBOX_URL/onebox/simulate" \
  -d '{"intent": {...}, "planHash": "0x…"}'
```

- HTTP `200` means the plan is ready to execute.  Review `risks` (soft warnings), `riskDetails` (human-readable guidance), and the projected escrow totals before approving the run.
- HTTP `422` includes a `blockers` array.  The simulator found a policy violation or missing data (for example, budget cap exceeded or job already finalised).  Resolve the issue, gather confirmation from the requester, and repeat the plan/simulate steps.
- HTTP `400` indicates a hash mismatch or expired plan.  Always call `/onebox/plan` again instead of forcing the execute step.

The simulator snapshots policy metadata and timestamps so the final receipt can prove which configuration gates were active when you approved the run.

### 2.3 Execute

```bash
curl -sS \
  -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$ONEBOX_URL/onebox/execute" \
  -d '{"intent": {...}, "planHash": "0x…", "mode": "relayer"}'
```

- `mode: "relayer"` signs and broadcasts the transaction immediately when a relayer key is configured.  `mode: "wallet"` returns `to`, `data`, `value`, and `chainId` so the requester can finalise with their own signer.
- Success responses include `jobId`, `txHash`, fee/burn amounts, and IPFS CIDs for the pinned spec and receipt.  Share the gateway URLs with auditors or the requester.
- Failures surface catalogued error codes (`INSUFFICIENT_BALANCE`, `JOB_BUDGET_CAP_EXCEEDED`, etc.).  Route the caller back to the plan/simulate step instead of resubmitting blindly.

### 2.4 Status & receipts

Use the returned `jobId` and `planHash` to query `/onebox/status`.  The payload includes the latest on-chain job state, cached receipts, and any policy snapshots captured during execution.  Retain the `receiptCid` as an immutable audit artefact.

## 3. Observability & compliance

- **Metrics:** Scrape `/onebox/metrics` for Prometheus counters (`plan_total`, `simulate_total`, `execute_total`) and the `onebox_tto_seconds` latency histogram.  Alert when blocker rates spike or latency drifts.
- **Receipts:** Each successful execute pins a JSON receipt containing the plan hash, transaction hashes, fee/burn breakdowns, and policy snapshot.  Store or mirror the CID catalogue so you can prove intent alignment during audits.
- **Logging:** Correlate requests with the `X-Request-ID` header; the router emits structured logs (`onebox.plan.*`, `onebox.simulate.*`, `onebox.execute.*`) including policy outcomes and relayer mode.

## 4. Continuous delivery safeguards

- Follow the CI v2 workflows (`.github/workflows/ci.yml`) and keep the five required status checks enforced on `main`.  Use [`docs/v2-ci-operations.md`](v2-ci-operations.md) and [`docs/ci-v2-branch-protection-checklist.md`](ci-v2-branch-protection-checklist.md) when onboarding new maintainers or auditing branch protection.
- Before each deployment, re-run `npm run ci:verify-branch-protection` and a targeted orchestrator test suite (for example, `pytest test/routes/test_onebox.py`).  Both commands run offline and confirm that the simulated policies align with the deployed configuration.
- Maintain a secure `.env` (or secrets manager entry) recording every environment variable listed above, together with rotation dates and change approvers.  Rotate API tokens and relayer keys after privileged staff changes or incident response drills.

By following this runbook the contract owner retains full operational control, can justify every on-chain action with simulator evidence, and can bring the orchestrator back to a compliant state quickly after policy or market shifts.
