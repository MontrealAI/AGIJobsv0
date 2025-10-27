# Owner Console Runbook

The contract owner retains absolute control over the fabric. Paste the snippets below into any shell—no coding required.

## Pause / Resume

```bash
# Pause all shard routers and requeue outstanding jobs
npx tsx demo/Planetary-Orchestrator-Fabric-v0/bin/planetary-fabric.ts owner set routers.maxConcurrentAssignmentsPerNode "0"

# Resume with conservative concurrency
npx tsx demo/Planetary-Orchestrator-Fabric-v0/bin/planetary-fabric.ts owner set routers.maxConcurrentAssignmentsPerNode "2"
```

## Adjust Spillover Strategy

```bash
# Increase spillover batch size to clear backlogs quickly
npx tsx demo/Planetary-Orchestrator-Fabric-v0/bin/planetary-fabric.ts owner set routers.spilloverBatch "96"

# Tighten spillover threshold on Luna to keep latency ultra low
npx tsx demo/Planetary-Orchestrator-Fabric-v0/bin/planetary-fabric.ts owner set "shards.1.spilloverThreshold" "0.2"
```

## Introduce a New Specialized Node

1. Edit `config/fabric.config.json` and append the node description under `nodes`.
2. Run the status command to confirm the node is live:
   ```bash
   npx tsx demo/Planetary-Orchestrator-Fabric-v0/bin/planetary-fabric.ts status
   ```
3. Rerun the drill (`npm run demo:planetary`) to see the node automatically receiving assignments.

## Audit Trail

- Every intervention is logged in `reports/latest/owner-log.json` with tick number and actor address.
- Checkpoints capture pre- and post-change state so auditors can reproduce decisions exactly.

## Emergency Checklist

1. **Detect** imbalance via queue skew in `reports/latest/summary.json`.
2. **Contain** by reducing `maxConcurrentAssignmentsPerNode` and raising `spilloverBatch`.
3. **Recover** by rerunning the drill or actual orchestrator pipeline; checkpoints ensure no jobs are lost.

With these runbooks, a non-technical owner can steer planetary-scale orchestration in real time while preserving a forensic audit trail.
