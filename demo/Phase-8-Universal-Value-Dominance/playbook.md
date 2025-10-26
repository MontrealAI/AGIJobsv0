# Phase 8 Playbook — Operator SOP

This playbook lets a non-technical operator spin up a **Universal Value Dominance** mission without writing Solidity or deep DevOps.

---
## 1. Pre-flight Checklist (15 minutes)

1. **Wallet & Funding**
   - Top up the operator wallet with ETH for gas + $AGIα for staking rewards.
   - Assign the wallet as `OWNER_ADDRESS` in `.env` (used by the bootstrap script to exercise governance calls) and set `PHASE8_MANAGER_ADDRESS` if the manifest does not already contain the active manager contract.
2. **Environment**
   - `npm install`
   - `npx hardhat compile`
   - `docker compose up agent-gateway orchestrator` (ensures persistent containers for hour-long tasks)
3. **Safety Baselines**
   - Review `configs/governance-policies.json` and ensure `globalPause=false` and `tripwireSensitivity` matches your risk tolerance.

---
## 2. Launch Sequence (20 minutes)

1. **Bootstrap Contracts & Services**
   ```bash
   # Dry run: regenerate artifacts + inspect governance call plan
   npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/bootstrap-demo.ts

   # After review: broadcast the encoded calls with the owner key
   npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/bootstrap-demo.ts --execute -y
   ```
   - Generates fresh governance artifacts (Safe batch, emergency overrides, runbooks) and prints the encoded call groups.
   - Registers the latest model adapters defined in `configs/model-adapters.json` and validates governance control surface.
   - Seeds validator guild registry with multisig addresses from `configs/governance-policies.json`, logging receipts to `output/phase8-bootstrap-history.jsonl` when executed.

2. **Activate Monitoring Suite**
   ```bash
   npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/monitors.ts --follow job.multi-agent.json
   ```
   - Streams checkpoints to storage, enforces autonomy check-ins, applies budget caps, and triggers tripwires.

3. **Materialise Owner Command Plan**
   ```bash
   npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/owner-console.ts --json demo/Phase-8-Universal-Value-Dominance/output/owner-plan.json --mermaid demo/Phase-8-Universal-Value-Dominance/output/owner-console.mmd --markdown demo/Phase-8-Universal-Value-Dominance/output/owner-briefing.md
   ```
   - Validates `configs/owner-directives.json`, confirms workflow enforcement, and emits JSON, Mermaid, and Markdown artefacts for the operations binder.
   - Double-check the CLI output for `workflowExists: yes` so you know CI is enforcing the demo before merging governance changes.

4. **Launch Multi-Agent Mission**
   - Open `ui/index.html` in a browser (or `npx serve` for remote).
   - Upload `configs/job.multi-agent.json`.
   - Click **Launch Mission** — the UI hits the orchestrator REST API to instantiate planner, builder, and analyst agents plus validator oversight.
   - Observe live timeline cards for each agent, milestone payouts, and governance overrides.

---
## 3. Mid-Flight Governance (Any time)

| Scenario | UI Action | Contract Effect |
|----------|-----------|-----------------|
| Agent cost spike | Toggle **Budget Cap** slider | Calls `BudgetManager.updateCap()` via owner proxy |
| Suspicious output | Hit **Tripwire Pause** | Executes `PauseGuardian.pauseAll()`; monitors terminate sessions |
| Need new model | Select adapter with higher score | Triggers `ModelRegistry.setActiveAdapter()` |
| Human validator wants to inspect | Press **Summon Validator** | Pushes notification via attestation module & grants read token |
| Governance change queued | Load `owner-directives.json` in Owner Console | Verifies `demo-phase-8-universal-value-dominance` workflow + call bundles before execution |

All actions are reversible in the same UI once the issue is resolved.

---
## 4. Post-Mission Wrap-up

1. **Finalize Payouts**
   - Validators approve final milestone in UI → smart contract releases escrow remainder to agents.
2. **Archive Logs**
   - `scripts/monitors.ts` stores ledger exports under `storage/phase8/<jobId>.json`. Upload to IPFS for immutable audit trail.
3. **Model Feedback Loop**
   - Run evaluation pipeline to grade agent performance vs. cost and update adapter scores:
     ```bash
     npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/evaluation-pipeline.ts --job <jobId>
     ```

---
## 5. Troubleshooting & Recovery

| Symptom | Remedy |
|---------|--------|
| `bootstrap-demo.ts` fails with `PAUSE_GUARDIAN_NOT_OWNER` | Ensure `OWNER_ADDRESS` matches multisig owner of existing pause guardian contract. |
| Monitors exit due to "Budget exceeded" | Increase `maxBudgetUSD` in job spec and relaunch, or reduce agent parallelism. |
| Validators not receiving summons | Check attestation service running (`npm run dev:attestation`) and wallet addresses in `governance-policies.json`. |
| `contract-extensions.ts` throws dependency errors | Confirm every `dependencies[].slug` exists in the manifest (domains, sentinels, capital streams, or AI teams). |

---
## 6. Guardian-Gated Contract Extensions

1. Run `npx tsx demo/Phase-8-Universal-Value-Dominance/scripts/contract-extensions.ts --json demo/Phase-8-Universal-Value-Dominance/output/extension-plan.json --markdown demo/Phase-8-Universal-Value-Dominance/output/extension-briefing.md --mermaid demo/Phase-8-Universal-Value-Dominance/output/extension-graph.mmd`.
2. Verify the console output lists **stageExtension**/**activateExtension** call groups and guardian approvers per bundle.
3. Share the generated markdown with the guardian council; the Mermaid diagram mirrors the dependency lattice for fast review.
4. Load the JSON plan into Safe Transaction Builder or your preferred multisig tooling once CI + guardian quorum approve.

---
## 7. Continuous Improvement Loop

- Schedule `evaluation-pipeline.ts` in CI to run nightly against sandboxed jobs.
- Pipe results into governance proposals (`contracts/governance/`) to auto-schedule adapter upgrades with quorum thresholds.
- Publish validator performance metrics to the dashboard leaderboard to incentivize human excellence.
- Lock branch protection to require `demo-phase-8-universal-value-dominance / phase8-demo` before merging manifests; the owner console surfaces this automatically for non-technical operators.

---
## 8. Appendix — Key Links

- **Core Contracts:** `contracts/jobs/`, `contracts/governance/`, `contracts/security/`
- **Agent Runtime:** `apps/orchestrator`, `services/agent-gateway`
- **Attestation & Validators:** `attestation/`, `services/validator`
- **CI Pipelines:** `.github/workflows/`, `Makefile`

Execute this playbook and you will have orchestrated a self-improving, human-governed AGI economy end-to-end.
