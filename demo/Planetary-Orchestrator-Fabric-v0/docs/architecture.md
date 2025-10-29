# Planetary Orchestrator Fabric – Architecture Dossier

The Planetary Orchestrator Fabric is engineered to give a single owner deterministic command over a multi-region AGI workforce. This dossier decomposes the fabric into its core building blocks and exposes the telemetry, routing policies, and failure domains.

## Planetary Topology

```mermaid
graph LR
  Owner((Owner Multisig)) -->|governs| GlobalLedger[(Unified Ledger)]
  GlobalLedger -->|state sync| EarthShard
  GlobalLedger -->|state sync| LunaShard
  GlobalLedger -->|state sync| MarsShard
  GlobalLedger -->|state sync| HeliosShard

  subgraph EarthShard [Earth Hypergrid]
    EarthRegistry[(Registry)] --> EarthRouter[[Router]]
    EarthRouter --> EarthPods{{Container Agents}}
  end

  subgraph LunaShard [Luna Relay]
    LunaRegistry[(Registry)] --> LunaRouter[[Router]]
    LunaRouter --> LunaPods{{Container Agents}}
  end

  subgraph MarsShard [Mars Foundry]
    MarsRegistry[(Registry)] --> MarsRouter[[Router]]
    MarsRouter --> MarsPods{{Container Agents}}
  end

  subgraph HeliosShard [Helios GPU Helion]
    HeliosRegistry[(Registry)] --> HeliosRouter[[Router]]
    HeliosRouter --> HeliosPods{{Container Agents}}
  end

  EarthRouter -. spillover .- MarsRouter
  MarsRouter -. spillover .- HeliosRouter
  LunaRouter -. spillover .- EarthRouter

  Checkpoint[(Checkpoint Ledger)] --> GlobalLedger
```

## Shard Specification

| Shard | Queue Budget | Latency Budget | Spillover Rules | Primary Specialties |
| --- | --- | --- | --- | --- |
| Earth | 6000 | 120 ms | Favors Luna, then Mars | Finance, compliance, high-trust orchestration |
| Luna | 2400 | 180 ms | Spill back to Earth | Navigation, orbital logistics |
| Mars | 4000 | 420 ms | Spill to Earth or Helios | Manufacturing, terraforming |
| Helios | 2200 | 850 ms | Spill to Mars | GPU-intensive analytics, solar observation |

The owner can provision **surge shards** at runtime (e.g., `edge-surge`) that inherit the same guarantees. When the surge ends, a `shard.deregister` payload drains queued jobs into a specified target or cancels them deterministically—no redeploy or restart needed.

## Node Marketplace

Nodes register declaratively. The orchestrator enforces owner-set maximum concurrency, latency windows, and heartbeat intervals while surfacing the exact container image, runtime, pricing, and compliance posture for every agent pod.

| Node ID | Region | Container Image | Runtime | Pricing (USDC/job) | Capabilities | Compliance |
| --- | --- | --- | --- | --- | --- | --- |
| `earth.core-alpha` | Earth | `registry.agi/earth-core-alpha:2.1.0` | kubernetes · node-lts | 0.00072 | general, finance, compliance | SOC2-Type-II, GDPR |
| `earth.edge-europa` | Earth | `registry.agi/edge-europa:3.5.2` | nomad · wasm | 0.00038 | logistics, iot, edge | ISO-27001 |
| `luna.nav-station` | Luna | `registry.agi/luna-nav-station:1.2.8` | kubernetes · python-3.11 | 0.00028 | navigation, observation | Lunar-Safety-Standard |
| `mars.regolith-cradle` | Mars | `registry.agi/mars-regolith:4.0.0` | nomad · rust-optimized | 0.00055 | manufacturing, terraforming | Mars-Colony-Safety |
| `mars.gpu-helion` | Mars | `registry.agi/mars-gpu-helion:5.3.1` | kubernetes · cuda | 0.00088 (priority) | gpu, vision, simulation | Mars-Colony-Safety, SOC2-Type-II |
| `helios.solaris-array` | Helios | `registry.agi/helios-solaris:6.2.0` | kubernetes · cuda | 0.00120 (premium) | gpu, astronomy | SOC2-Type-II, Solaris-Safety |

## Event Loop

1. **Job Intake** – Jobs flow into shard registries with metadata: region, deadline, skills, budget.
2. **Routing** – Regional routers perform deterministic matching using weighted capacity, skill alignment, and latency budgets.
3. **Assignment** – Nodes accept workloads up to `maxConcurrency`. Overflow triggers deterministic spillover to configured shards.
4. **Heartbeat Audit** – The orchestrator expects heartbeats within the configured interval. Missed heartbeats mark the node unhealthy.
5. **Failure Recovery** – Jobs running on failed nodes are re-queued in the originating shard. If backlog > `maxQueue`, spillover engages.
6. **Checkpoint** – Every `intervalTicks` the orchestrator writes a full snapshot (shards, jobs, node health, metrics). Owners can tighten cadence or retarget storage live via `checkpoint.configure`.
7. **Owner Hooks** – Owner commands modify shard budgets, pause/resume, checkpoint, reroute individual jobs, or cancel redundant workloads in real-time.
8. **Restart Drill Hooks** – `--stop-after-ticks` halts the orchestrator deterministically so crash/recovery rehearsals are auditable.

## Persistence

- **Checkpoint Ledger** (`storage/checkpoint.json` by default, owner-adjustable at runtime) stores deterministic snapshots.
- **Event Stream** (`reports/<label>/events.ndjson`) provides chronological telemetry for observability.
- **Summary** (`reports/<label>/summary.json`) aggregates throughput, latency, failure statistics, and deterministic seeds.
- **Run Metadata** (`summary.json.run`) captures `checkpointRestored`, `stoppedEarly`, `stopTick`, and `stopReason` for every session.
- **Owner Scripts** (`reports/<label>/owner-script.json`) enumerates ready-to-run governance payloads.
- **Owner Command Ledger** (`reports/<label>/owner-commands-executed.json`) records scheduled, executed, skipped, and pending owner interventions for auditability.
- **Mission Topology Atlases** (`reports/<label>/mission-topology.mmd` & `mission-topology.html`) visualise shard throughput, node status, and spillover flows in a governance-ready mermaid graph.
- **Drill Events** (`simulation.stopped`) mark intentional halts so observability stacks distinguish rehearsals from outages.

## Security Considerations

- Owner multisig is the only actor authorized to modify shard weights, pause the system, or apply thermostat changes.
- Spillover routes are deterministic and signed. Unauthorized shards cannot inject tasks without owner-approved credentials.
- Checkpoints include integrity hashes to detect tampering before resuming a run.
- Node marketplace requires authenticated heartbeats; the demo provides local signing stubs that operators replace with production wallets or TPM-backed keys.

## Extensibility Hooks

- **Blockchain Integration:** Replace the mock ledger in `src/orchestrator.ts` with actual contract calls using `ethers` or Hardhat runners.
- **Container Backend:** Attach `src/nodeMarketplace.ts` to Kubernetes, Nomad, or bare metal by implementing the `NodeProvider` interface.
- **Reward Engine:** Connect to `scripts/v2/rewardEngineReport.ts` for real payout calculations.
- **Observability:** Stream `events.ndjson` into the observability stack via Fluent Bit or Loki.
- **Owner Automation:** Populate `config/owner-commands.example.json` with production schedules so the orchestrator autonomously enforces governance policies mid-run.

The architecture is tuned so a single operator—without writing a single line of code—can command a planetary intelligence fabric while retaining full custodial control.
