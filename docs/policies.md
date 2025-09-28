# Orchestrator Policies

Policies enforce per-workspace safety rails when executing orchestration plans.

## Default Policy (`config/policies.default.json`)

* Tool allow list covering IPFS pinning, job lifecycle, validators, LLMs, and sandboxed code.
* `requireValidator: true` ensures a quorum gate before payout.
* Budget section defines the default token and daily cap.

## Extending Policies

1. Copy the default JSON file and adjust the allow/deny lists per workspace.
2. Point the API server to the new file via `ORCHESTRATION_POLICY_PATH` (future enhancement).
3. Simulator and runner modules will respect the loaded policy when estimating or executing.

