# Meta Agentic AGI Assets – Continuous Learning Notes

This document inventories the moving pieces that keep the gateway's agent
population adaptive. It is intended for internal operators who maintain the
Meta Agentic stack.

## Data acquisition

* `agent-gateway/learning.ts` now emits structured JSONL snapshots under
  `storage/learning/records.jsonl`. Each line records:
  * the full on-chain job spec (category, metadata, rewards, stake);
  * the agent profile applied (label, ENS, skill inventory, historical metrics);
  * observed energy telemetry for the execution; and
  * the canonical result artefacts (transaction hash, result URI/hash, success).
* Records are append-only and timestamped so we can stream them directly into
  downstream fine-tuning jobs without reindexing the chain.
* The module still mirrors critical data into the legacy
  `shared/trainingRecords` aggregator so existing dashboards continue to work.

## Spawn pipeline hooks

* Spawn requests continue to accumulate inside `storage/training/spawn-requests.json`.
* `agent-gateway/agentFactory.ts` has been extended to:
  * analyse spawn pressure and pick niche categories once the observation
    threshold (default `AGENT_FACTORY_OBSERVATION_THRESHOLD=4`) is met;
  * hydrate the highest performing template agent for that category;
  * generate a deterministic blueprint (wallet, ENS label, recommended stake);
  * execute sandbox trials before activation; and
  * persist identity material plus runtime metadata to `config/agents/<label>.json`.
* Sandbox runs are logged under `storage/sandbox/` together with the blueprint
  metadata so we can audit pre-production checks.

## Sandbox gating

* Sandbox scenarios are lightweight heuristics that validate:
  * category familiarity (template coverage);
  * skill transfer (at least partial match with the template skill map); and
  * thermodynamic viability (projected energy within configurable guard rails).
* Failures block automatic activation unless `allowSandboxFailure` is
  explicitly set. Results are exported in JSON so analysts can manually inspect
  why a candidate failed to qualify.

## Retraining surface

* `scripts/retrainAgent.ts` consumes the JSONL ledger and computes rolling
  success/energy statistics for a given agent label or address.
* The script stamps the agent's identity file with an updated `metadata.learning`
  payload (strategy recommendation, dataset digest, recent jobs) and triggers
  an orchestrator reload webhook (`ORCHESTRATOR_CONTROL_URL`).
* Strategies are currently binary (`fine-tune` vs `swap`) based on success rate
  and average energy consumption, but the metadata structure is ready for more
  nuanced policies.

## Operational loop

1. **Observation** – Gateway appends job outcomes to `storage/learning/records.jsonl`.
2. **Demand detection** – Spawn requests reach the configured threshold for a
   category.
3. **Sandbox** – `cloneEligibleAgents()` materialises blueprints and gates them
   through sandbox simulations (results stored in `storage/sandbox/`).
4. **Activation** – Passing agents receive identity files, wallets are injected
   into the wallet manager, and the orchestrator reloads the registry view.
5. **Retraining** – Operators run `ts-node scripts/retrainAgent.ts --label <id>`
   to update metadata and kick off downstream model work.

Keep the JSONL corpus safe; it is the canonical log for model deltas and feeds
both human review and automated fine-tuning jobs.
