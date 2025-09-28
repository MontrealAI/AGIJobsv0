# Meta-Orchestration Overview

This sprint introduces a planner → simulator → runner pipeline that powers the `/onebox/*` endpoints.

## Planner

* `POST /onebox/plan` accepts natural language and produces a `JobIntent` and summary.
* Missing parameters are surfaced via the `missingFields` array so the chat UI can request clarifications before execution. When `missingFields` is non-empty the backend also flips `requiresConfirmation` to `false`.
* Plans are hashed (`planHash`) to provide a stable correlation identifier that carries through simulate and execute responses.

## Simulator

* `POST /onebox/simulate` checks the plan against budget caps, deadline limits, and intent-specific requirements before any transaction is prepared.
* Returns human readable confirmations plus machine readable `risks` (soft warnings) and `blockers` (fatal issues). Planner warnings are echoed as risks so the UI can display them inline. Examples include `LOW_REWARD` for small budgets and `LONG_DEADLINE` when a job keeps funds locked for extended periods.
* If any blockers are present the API responds with HTTP 422 and includes the `blockers` list in the response body. The client should gather additional input and retry planning.

## Runner

* `POST /onebox/execute` kicks off the in-memory runner which executes each step sequentially.
* `GET /onebox/status?run_id=…` streams back step state, logs, and a final receipt.
* Receipts capture the originating plan hash, all transaction hashes, and pinned CID references for downstream auditing.

## Metrics

* `plan_total` / `simulate_total` / `execute_total` / `status_total`
* `time_to_outcome_seconds` histogram tagged with `endpoint`

