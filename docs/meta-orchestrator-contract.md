# Planner → Simulator → Runner Contract

This document captures the interaction contract enforced by the FastAPI meta-orchestrator router exposed in [`routes/meta_orchestrator.py`](../routes/meta_orchestrator.py).

## Overview

The orchestrator exposes four core endpoints that implement the `plan → simulate → execute → status` lifecycle for automation jobs:

- `POST /onebox/plan` validates operator intent and emits a typed plan (`PlanOut`).
- `POST /onebox/simulate` replays the plan against risk and policy checks, raising a 422 with blockers when the run cannot proceed.
- `POST /onebox/execute` hands the approved plan to the runner, which starts a tracked run and returns the `run_id` and timestamps.
- `GET /onebox/status` retrieves the runner state machine, updating success/failure counters.

The following sections describe the request/response choreography and metrics emitted during each step.

## Sequence diagrams

```mermaid
sequenceDiagram
    participant Client
    participant Planner as meta_orchestrator.plan
    participant Simulator as meta_orchestrator.simulate
    participant Runner as meta_orchestrator.execute

    Client->>Planner: POST /onebox/plan (PlanIn)
    activate Planner
    Planner->>Planner: make_plan(req)
    Planner-->>Client: PlanOut
    deactivate Planner

    Client->>Simulator: POST /onebox/simulate (SimIn.plan)
    activate Simulator
    Simulator->>Simulator: simulate_plan(plan)
    alt blockers returned
        Simulator-->>Client: HTTP 422 {"code": "BLOCKED", ...}
    else success
        Simulator-->>Client: SimOut
    end
    deactivate Simulator
```

```mermaid
sequenceDiagram
    participant Client
    participant Runner as meta_orchestrator.execute
    participant Status as meta_orchestrator.status

    Client->>Runner: POST /onebox/execute (ExecIn)
    activate Runner
    Runner->>Runner: start_run(plan, approvals)
    Runner-->>Client: { run_id, started_at, plan_id }
    deactivate Runner

    loop poll until terminal
        Client->>Status: GET /onebox/status?run_id=…
        activate Status
        Status->>Status: get_status(run_id)
        alt run state succeeded
            Status->>Status: _RUN_SUCCESS++
        else run state failed
            Status->>Status: _RUN_FAIL++
        end
        Status-->>Client: StatusOut
        deactivate Status
    end
```

## Contract guarantees

- **Latency metrics** – The router measures planning, simulation and execution latency with Prometheus histograms, providing guardrails for SLO dashboards (`plan_latency_seconds`, `simulate_latency_seconds`, `execute_step_latency_seconds`).
- **Run accounting** – Every terminal status update increments the `run_success_total` or `run_fail_total` counter, ensuring downstream telemetry is consistent with client-observed results.
- **Error semantics** – Simulation blockers are always communicated via a structured 422 error payload so that clients can surface actionable messages before attempting execution.
- **Traceability** – Each endpoint logs the `plan_id` (and `run_id` for execution/status) to the shared logger, enabling distributed traces to correlate planner/simulator/runner calls.

## Implementation pointers

- The router is mounted under the `/onebox` prefix and protects endpoints with the `require_api` dependency when available.
- `PlanIn`, `SimIn`, `ExecIn` and `StatusOut` share the same Pydantic models as the internal planner, simulator and runner modules, guaranteeing schema parity between services.
- The metrics and logging helpers are defined inside `routes/meta_orchestrator.py` so any refactor must keep their module-level lifetimes intact.
