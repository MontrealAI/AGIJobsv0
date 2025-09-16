# Continuous Learning Pipeline

This document explains how the AGIJobs gateway now captures experience, spins
up new specialists, and retrains existing agents.

## 1. Capture job outcomes

The gateway records every completed task in `storage/learning/records.jsonl` via
`agent-gateway/learning.ts`. Each JSON line contains:

* Job specification – category, rewards, stakes, metadata URI/hash.
* Agent profile – label, ENS, categories, skills, historical success metrics.
* Energy sample – wall-clock duration, energy estimate, CPU/memory footprint.
* Execution result – success flag, transaction hash, IPFS result pointer.

These logs are append-only so downstream analytics or model trainers can replay
history without crawling on-chain data.

## 2. Detect unmet demand

Spawn requests (`storage/training/spawn-requests.json`) are generated whenever a
job arrives for a category we do not yet cover. Once the observation count hits
`AGENT_FACTORY_OBSERVATION_THRESHOLD` (default **4**), the agent factory treats
it as a niche worth cloning.

## 3. Clone and sandbox specialists

`agent-gateway/agentFactory.ts` now provides `cloneTemplateAgent()` and
`cloneEligibleAgents()`:

1. Select the best-performing template agent for the requested category.
2. Generate a blueprint (fresh wallet, ENS label, recommended stake/metrics).
3. Run sandbox simulations against canned sample jobs. Results are stored under
   `storage/sandbox/<timestamp>-<category>-<id>.json`.
4. If the sandbox passes (or `allowSandboxFailure` is explicitly set), persist a
   new identity file at `config/agents/<label>.json` and register the wallet in
   the gateway's wallet manager.

Sandbox heuristics cover skill transfer, category familiarity, and projected
energy usage so that only viable clones enter production.

## 4. Update the orchestrator

Identity files include a `metadata` block with blueprint, sandbox, and learning
state. Once an agent is cloned, the factory automatically:

* writes the identity file;
* injects the wallet into the in-memory wallet manager; and
* calls `registerIdentityFile()` so the agent registry refreshes immediately.

## 5. Retrain or rotate agents

`scripts/retrainAgent.ts` reads the JSONL ledger, computes rolling success and
energy metrics for an agent label/address, and updates the corresponding identity
file (`metadata.learning`). The script recommends either:

* **fine-tune** – success rate healthy, energy within budget; or
* **swap** – success rate low or energy budget exceeded.

After updating the file it pings `ORCHESTRATOR_CONTROL_URL` so the orchestrator
reloads capability matrices without a manual restart.

## 6. Operational checklist

1. Run the gateway – it will log records and spawn requests automatically.
2. Periodically execute `ts-node scripts/retrainAgent.ts --label <agent>` to
   refresh learning metadata and trigger orchestrator reloads.
3. Use `cloneEligibleAgents()` (or the HTTP surface that wraps it) to materialise
   new specialists when the sandbox results look healthy.
4. Review sandbox reports and JSONL logs to guide human-in-the-loop fine tuning.

The pipeline is designed to be observable: every stage writes structured
artifacts (`records.jsonl`, sandbox reports, identity metadata) that make it easy
to audit why a clone was created or a retraining strategy was chosen.
