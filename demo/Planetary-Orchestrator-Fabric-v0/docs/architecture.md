# Planetary Orchestrator Fabric – Architecture Brief

This document is a deep-dive companion to the demo. It explains how the simulation mirrors production AGI Jobs v0 (v2) primitives and highlights the control surfaces available to the contract owner.

## Sharded Job Registry

- Each shard is represented by a `ShardState` structure (see `src/types.ts`).
- Queues are local: jobs tagged for `earth` never leak to `mars` unless spillover triggers.
- Spillover thresholds and batch sizes are owner-configurable via `fabric.config.json` or the `owner set` CLI command.
- Every job carries full metadata (sponsor, payout, validator quorum) so reports look identical to live registry events.

## Regional Routers

- The router logic lives in `PlanetaryFabricOrchestrator.assignWork`.
- Capacity enforcement uses `routers.maxConcurrentAssignmentsPerNode` to avoid overloading a single agent.
- Routers prefer capability matches first, then lowest active workload for deterministic balancing.
- Cross-shard spillover occurs only when queue skew exceeds the configured ratio, mimicking regional overflow logic on mainnet.

## Node Marketplace

- Nodes are declared in `config/nodes` and materialised as `NodeState`.
- Reliability scores (>0 and ≤1) determine heartbeat success per tick.
- When a node misses heartbeat, its jobs are instantly re-queued and counted toward reassignment metrics.
- Marketplace telemetry (completed jobs, failures, runtime) feeds the generated report bundle for easy auditing.

## Checkpoint & Recovery

- `checkpoint.ts` implements a file-based, deterministic checkpoint store.
- Checkpoints include all jobs, shards, nodes, and metrics hashed against the active config.
- The high-load drill intentionally persists a checkpoint before simulating an orchestrator crash, then restores it to prove restart safety.
- Retention is owner-controlled; default keeps five most recent checkpoints.

## Owner Control Surfaces

- Every numerical or structural parameter in `fabric.config.json` can be mutated live.
- `ownerAdjust` enforces dot-notation updates and appends entries to `owner-log.json` for auditors.
- The CLI requires no private keys but can be pointed at on-chain automation by substituting `owner set` invocations with safe transactions.

## Deterministic Simulation

- The deterministic RNG (`random.ts`) ensures reproducible runs given the same seed, enabling audit-grade evidence trails.
- Tests (`test/planetary-fabric.test.ts`) use a fixed seed so CI results match local runs exactly.

## Extending to Mainnet

- Swap the queue/assignment bodies with RPC calls to the deployed JobRegistry, StakeManager, and ValidationModule.
- Replace file checkpoints with the existing AGI Jobs IPFS/Pinata artifact pipeline (already available in the repo).
- The same orchestration skeleton can orchestrate real jobs by hooking `queueJob` to `JobRegistry.createJob` transactions.

This architecture demonstrates that AGI Jobs v0 (v2) already contains every primitive required to run Kardashev-II scale operations without code changes—only orchestration glue was needed.
