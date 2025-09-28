# Meta-Orchestration Overview

This sprint introduces a planner → simulator → runner pipeline that powers the `/onebox/*` endpoints.

## Planner

* `POST /onebox/plan` accepts natural language and produces a `JobIntent` + `OrchestrationPlan`.
* Missing fields are echoed back via `missing_fields` so the chat UI can ask clarifying questions.
* Plans are hashed (`plan_id`) to provide a stable correlation identifier.

## Simulator

* `POST /onebox/simulate` checks the plan against budget and tool policies.
* Returns human readable confirmations plus machine readable `risks` and `blockers`.
* If any blockers are present the API responds with HTTP 422 and the caller should re-plan.

## Runner

* `POST /onebox/execute` kicks off the in-memory runner which executes each step sequentially.
* `GET /onebox/status?run_id=…` streams back step state, logs, and a final receipt.
* Receipts capture plan hash, placeholder tx hashes, and pinned CID references.

## Metrics

* `plan_latency_seconds`
* `simulate_latency_seconds`
* `execute_step_latency_seconds`
* `run_success_total`
* `run_fail_total`

