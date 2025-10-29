# Orchestrator

This package provides the scheduling primitives used by the AGIJobs orchestrator
runtime. The Hierarchical Generative Machine (HGM) workflow introduced in this
change relies on a cooperative worker that executes expansion and evaluation
activities while respecting concurrency bounds, retry semantics, and busy-agent
avoidance.

## HGM orchestration workflow

The HGM workflow lives in [`orchestrator/workflows/hgm.py`](workflows/hgm.py).
It exposes two activities:

- `hgm.expand` – records the payload returned by an expansion task.
- `hgm.evaluate` – records the reward from evaluating a spawned agent.

Both activities acquire the workflow's internal engine lock before mutating
state, ensuring serialized access to `HGMEngine`. Task submission is handled by
[`TaskScheduler`](workflows/scheduler.py) which enforces concurrency caps and
retry policies using exponential backoff.

### Launching workers

Run the worker by instantiating `HGMActivityWorker` and dispatching activities
through it. For local testing:

```python
import asyncio

from orchestrator.worker import build_worker

worker = build_worker(concurrency=4)

async def main():
    await worker.dispatch("hgm.expand", "root", "action", payload={"quality": 0.8})

asyncio.run(main())
```

Workers expose the underlying workflow instance via `worker.workflow`, allowing
callers to schedule higher-level operations (such as `schedule_expansion`) from
custom runners or simulations. The helper `run_worker_forever` provides a simple
loop that keeps the worker alive inside a long-running process.

### Monitoring HGM runs

Use the workflow's inspection helpers to understand current state:

- `await workflow.snapshot()` returns a dictionary of `AgentNode` objects keyed
  by node identifier.
- `await workflow.busy_agents()` returns the set of nodes currently scheduled.
- `workflow.scheduler.attempts` exposes retry counters, while
  `workflow.scheduler.errors` captures terminal failures.

For a concrete end-to-end example see [`simulation/hgm/harness.py`](../simulation/hgm/harness.py)
which drives the workflow with randomly sampled latencies and rewards.
