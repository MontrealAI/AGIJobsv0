# Governance Console Reference

The governance console exposes safe, owner-only controls over the fabric. Each action is synchronous, auditable, and captured in checkpoints.

## API surface

```python
from planetary_fabric.orchestrator import PlanetaryOrchestratorFabric
from planetary_fabric.job_models import Shard

fabric = PlanetaryOrchestratorFabric()
console = fabric.owner_console
```

| Method | Description |
| --- | --- |
| `pause_all()` | Pauses every regional router immediately. Assignments halt, queues persist. |
| `resume_all()` | Resumes dispatch across all regions. |
| `pause_shard(shard)` | Freezes a specific shard while others continue processing. |
| `resume_shard(shard)` | Restarts dispatch for a paused shard. |
| `set_tick_interval(seconds)` | Adjusts the orchestration cycle time globally (min 10ms). |
| `update_spillover_limit(shard, limit)` | Caps how deep a shard queue must get before cross-shard spillover activates. |
| `update_latency_budget(shard, ms)` | Overrides default latency fallback for completion accounting. |
| `snapshot()` | Returns the current governance state (used in reports). |

## Emergency drill checklist

1. `console.pause_all()` – Confirm routers stop dispatching.
2. Query `fabric.health_report()` – Validate queue depths remain stable.
3. Modify parameters (e.g., `update_spillover_limit`) while paused.
4. `console.resume_all()` – Observe dispatch resuming with new settings.

Each change is logged inside the checkpoint (`governance` field) so auditors can trace every parameter adjustment.
