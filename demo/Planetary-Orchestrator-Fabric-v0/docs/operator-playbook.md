# Operator Playbook – Planetary Orchestrator Fabric

This playbook walks a non-technical operator through launching, monitoring and recovering the planetary fabric in less than 10 minutes.

## 1. Launch the fabric

```bash
# Default humanitarian surge
./bin/planetary-fabric.sh

# Kardashev-II benchmark with explicit report export
./bin/planetary-fabric.sh k2-benchmark --jobs 10000 --export reports/planetary-fabric/runs/k2.json
```

The launcher prints a live scoreboard and saves a checkpoint to `reports/planetary-fabric/checkpoint.json`.

## 2. Monitor health

Every run emits a JSON report (when `--export` is provided). Fields to watch:

- `metrics.dispatched_jobs` – total assignments issued.
- `metrics.completed_jobs` – completed tasks.
- `metrics.reassigned_jobs` – automatic requeues triggered by node churn.
- `health.node_health` – real-time node status (healthy/degraded/offline).
- `queue_depths` – per-shard backlog; >100 indicates you should raise spillover.

## 3. Exercise owner levers

```python
from planetary_fabric.orchestrator import PlanetaryOrchestratorFabric
from planetary_fabric.job_models import Shard

fabric = PlanetaryOrchestratorFabric()
fabric.bootstrap_demo_nodes()
console = fabric.owner_console
console.pause_shard(Shard.LUNA)
console.update_spillover_limit(Shard.EARTH, 3)
console.update_latency_budget(Shard.MARS, 1200)
console.resume_all()
```

Changes take effect immediately and will be persisted in the next checkpoint.

## 4. Simulate disasters safely

- **Node outage** – mark a node offline to validate reassignment:
  ```python
  from planetary_fabric.job_models import NodeHealth

  node = fabric.marketplace.get_node("earth-gpu-1")
  node.health = NodeHealth.OFFLINE
  ```
- **Orchestrator crash** – call `fabric.save_checkpoint()` mid-run, re-instantiate a new `PlanetaryOrchestratorFabric`, then `load_checkpoint()` and continue.

## 5. Resume from checkpoints

```python
from planetary_fabric.config import load_scenario

scenario = load_scenario("resilience-drill")
fabric = PlanetaryOrchestratorFabric(checkpoint_path=scenario.checkpoint_path)
if fabric.load_checkpoint():
    print("Resumed from", scenario.checkpoint_path)
    fabric.simulate_execution(max_ticks=120, completion_probability=scenario.completion_probability)
```

## 6. Promote to production

1. Point the marketplace registration hooks to actual container registries.
2. Replace `bootstrap_jobs` with live task ingestion (e.g., subgraph, REST, or contract events).
3. Wire checkpoint storage to your production object store (S3, GCS, IPFS).
4. Feed the generated reports into dashboards for SOC and compliance visibility.

Follow the checklist above to scale from demo to fully sovereign planetary operations.
