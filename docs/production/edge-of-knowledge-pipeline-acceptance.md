# Edge-of-Knowledge Pipeline Acceptance Checklist

> **Audience:** Contract owners, programme managers, and institutional reviewers who must certify that the AGI Jobs v0 meta-orchestrator is production-ready without digging through source code.
>
> **Objective:** Provide a single acceptance script that proves (1) planner → simulator → runner behave exactly as specified, (2) owner controls remain intact, and (3) CI v2 stays green so every safeguard is enforced on `main` and all pull requests.

---

## 1. Planner certification

1. **API protection** – Confirm calls require the configured bearer token. All `/onebox/*` routes share the `require_api` guard, which validates `Authorization: Bearer <token>` whenever `ONEBOX_API_TOKEN` is set.【F:routes/onebox.py†L205-L213】
2. **Environment audit** – Capture the live deployment `env` (RPC URL, registry address, token decimals, IPFS credentials, gateways) and compare against the runbook. Every value is injected from environment variables, giving the owner direct override control without code edits.【F:routes/onebox.py†L44-L97】
3. **Missing field detection** – Submit a natural-language brief via `POST /onebox/plan` (for example, “post a job for 100 AGI in 10 days”). Verify the response highlights unset parameters (`missingFields`) using `_detect_missing_fields` so the UI can request additional inputs before proceeding.【F:routes/onebox.py†L950-L963】【F:routes/onebox.py†L1627-L1667】
4. **Receipt trail** – Inspect the emitted plan receipt digest; `_store_plan_metadata` binds the canonical `planHash` and timestamp so downstream stages can prove lineage.【F:routes/onebox.py†L918-L924】【F:routes/onebox.py†L1627-L1667】
5. **Unit confirmation** – Re-run the planner-focused pytest module to ensure the parsing heuristics keep passing: `pytest test/orchestrator/test_planner.py` (mirrors the CI job graph described later).【F:test/orchestrator/test_planner.py†L1-L120】

---

## 2. Simulator certification

1. **Hash integrity** – Call `POST /onebox/simulate` with the planner’s intent and `planHash`; the router recomputes the canonical hash, stores the timestamp, and rejects mismatches before any validation executes.【F:routes/onebox.py†L1720-L1766】
2. **Policy enforcement** – Validate that missing rewards/deadlines create blockers, low rewards/short deadlines are surfaced as risks, and organisation caps trigger `JOB_BUDGET_CAP_EXCEEDED` or `JOB_DEADLINE_CAP_EXCEEDED` through `_enforce_policy`’s reuse of the shared policy store.【F:routes/onebox.py†L1758-L1849】
3. **State awareness** – Simulating finalize requests now refreshes on-chain status when cache entries are missing, blocking disputes, completed jobs, and any attempt to finalise work that is still `open`, `assigned`, or `review`. This prevents accidental double-finalisations and premature payouts.【F:routes/onebox.py†L1993-L2009】【F:routes/onebox.py†L2331-L2346】【F:routes/onebox.py†L2515】
4. **Audit payload** – Confirm the JSON response includes summary text, risk codes, estimated budget, fee/burn projections, and attestation metadata so finance and compliance teams can archive the off-chain decision trail.【F:routes/onebox.py†L1741-L1919】
5. **Logging & metrics** – Tail logs for `onebox.simulate.success` / `.blocked` entries and scrape Prometheus for `simulate_total{intent_type,http_status}` plus turnaround histograms – both are emitted for every call.【F:routes/onebox.py†L1980-L1989】
6. **Automated proof** – Execute `pytest test/routes/test_meta_orchestrator.py::test_plan_simulate_execute_flow` to re-confirm the end-to-end planner→simulate→execute happy path stays green under FastAPI’s TestClient.【F:test/routes/test_meta_orchestrator.py†L27-L65】

---

## 3. Runner certification

1. **Plan hash gate** – Execution refuses to proceed unless the supplied hash matches the recomputed intent hash and the stored metadata, preserving end-to-end integrity.【F:routes/onebox.py†L1991-L2027】
2. **Mode duality** – Inspect responses for both `relayer` (default) and `wallet` modes to ensure server-side signing and wallet hand-off remain available without code changes.【F:routes/onebox.py†L1955-L2135】
3. **Receipt pinning** – After a successful run, verify the orchestrator pinned the consolidated receipt to IPFS, populated gateway URLs, and attached fee/burn breakdowns to the response payload.【F:routes/onebox.py†L1525-L1624】【F:routes/onebox.py†L2116-L2206】
4. **Status polling** – Use `GET /onebox/status?jobId=<id>` to confirm the contract state machine is mapped to human-readable labels and cached for simulator use.【F:routes/onebox.py†L2306-L2348】
5. **Metrics** – Confirm `execute_total{intent_type,http_status}` and shared turnaround histograms tick for every run so SRE dashboards stay accurate.【F:routes/onebox.py†L2300-L2304】
6. **Regression pack** – Run `pytest test/routes/test_onebox_intents.py` to exercise the mocked execution flows; the suite covers wallet preparation, relayer error mapping, and policy fallbacks without needing a live chain.【F:test/routes/test_onebox_intents.py†L1-L200】

---

## 4. Owner control & configuration

1. **Org policy store** – Ensure `storage/org-policies.json` (or the configured override) reflects your institutional caps. The `OrgPolicyStore` loader and updater write changes back to disk and fall back to environment defaults (`ORG_MAX_BUDGET_WEI`, `ORG_MAX_DEADLINE_DAYS`) so the owner can tighten or relax limits in seconds.【F:routes/onebox.py†L505-L735】
2. **Tool allowlists** – Review `allowedTools` configuration; enforcement rejects unapproved tool invocations before execution, and admins can update the list via the same policy file or CLI helper without redeploying.【F:routes/onebox.py†L600-L645】
3. **Credential rotation** – Rotate API tokens, relayer keys, and IPFS credentials via environment variables—no code change required. Startup guards refuse to boot without a valid `RPC_URL`, preventing accidental production outages.【F:routes/onebox.py†L44-L99】【F:routes/onebox.py†L205-L213】
4. **Tooling snapshots** – Populate `ONEBOX_TOOL_*` environment variables to embed version fingerprints in every receipt, giving the owner provable traceability for compliance audits.【F:routes/onebox.py†L737-L759】【F:routes/onebox.py†L1525-L1569】
5. **Receipts & attestation** – Archive the pinned receipts and optional attestation references for each run; they contain the policy snapshot, signer, fees, and relevant CIDs so an owner can demonstrate full control during regulator reviews.【F:routes/onebox.py†L1525-L1624】

---

## 5. CI v2 gate verification

1. **Branch protection** – Confirm the five required CI contexts (`Lint`, `Tests`, `Foundry`, `Coverage thresholds`, `CI summary`) are enforced on `main`, using either the GitHub UI or `npm run ci:verify-branch-protection` / `gh api` commands.【F:docs/v2-ci-operations.md†L1-L70】
2. **Companion workflows** – Ensure the supplemental pipelines (`e2e`, `fuzz`, `webapp`, `containers`) remain required where applicable so UI, fuzzing, and container checks stay visible.【F:docs/v2-ci-operations.md†L71-L83】
3. **Local dry run** – Before signing off a release, rerun the local CI approximation (`npm ci`, `npm run format:check`, `npm run lint:ci`, `npm test`, `npm run coverage`, `forge test -vvvv --ffi --fuzz-runs 256`) to mirror the GitHub workflow dependencies.【F:docs/v2-ci-operations.md†L92-L118】

Document every command output, store receipts under `reports/`, and capture hashes/artefacts in the compliance vault. Once the steps above are green, the pipeline satisfies the "Edge-of-Knowledge" production bar while keeping the contract owner in complete control of every parameter.
