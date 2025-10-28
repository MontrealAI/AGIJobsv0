# Planetary Orchestrator Fabric v0

> **Empowerment Thesis:** A non-technical mission director can point AGI Jobs v0 (v2) at this directory and launch a resilient, Kardashev-grade, sharded orchestration fabric that feels like commanding a superintelligent planetary control room.

This demo packages **Planetary Orchestrator Fabric** as a runnable, checkpointable, owner-governed experience. It combines regional job registries, deterministic routing, containerized agent marketplaces, and recoverable checkpoint orchestration into a single guided flow. Every artifact, script, and UI asset is wired so the operator never needs to write code—yet they still command a planetary-scale intelligence network.

## Highlights

- 🌍 **Regional Sovereignty** – Earth, Luna, Mars, and Helios shards operate autonomously while reporting to a unified global ledger.
- 🛰️ **Deterministic Routing** – Regional routers enforce locality, latency budgets, and spillover rules with auditable policies.
- 🤖 **Containerized Agent Marketplace** – Nodes self-register with capabilities, heartbeats, and owner-managed quotas.
- 💾 **Crash-Proof Checkpointing** – A built-in recovery engine snapshots the entire fabric so runs resume exactly where they stopped.
- 🛡️ **Owner Supreme Controls** – The owner can pause, update, reprioritize, or surgically reroute jobs at any moment via declarative commands.
- 🧭 **Checkpoint Command Deck** – Owners retarget storage paths, tighten snapshot cadence, and trigger instant saves from the same schedule that drives pauses and reroutes.
- 📈 **CI-Certified** – Dedicated workflows and tests guarantee green checks on every PR and on `main`.
- 🛰️ **Immersive UI** – Rich mermaid diagrams, dashboards, and walkthroughs translate complex topology into intuitive visuals.
- 🎛️ **Owner Command Schedules** – Load declarative schedules that trigger pause/resume, shard tuning, and node lifecycle actions mid-run.
- ♻️ **Zero-Downtime Restart Drill** – A two-stage launcher halts the orchestrator on command, resumes from checkpoint, and merges telemetry for auditors automatically.
- 🎯 **Surgical Job Control** – Owners reroute hot jobs across shards or cancel redundant work instantly without touching code, with `allowMissing` safeguards so the same command deck works for 4k rehearsal drills and 10k Kardashev load tests alike.

## Quickstart (Non-Technical Operator)

1. **Install dependencies** (once per repository clone):
   ```bash
   npm install
   ```
2. **Prime environment** (copies env templates used by orchestrator + deployment tooling):
   ```bash
   cp orchestrator/.env.example orchestrator/.env
   cp deployment-config/.env.example deployment-config/.env
   ```
3. **Run the planetary fabric** (generates full reports + dashboard):
  ```bash
  demo/Planetary-Orchestrator-Fabric-v0/bin/run-demo.sh \
     --jobs 10000 \
     --simulate-outage "mars.gpu-helion" \
     --checkpoint-interval 30 \
     --output-label "kardashev-kill-switch" \
     --owner-commands demo/Planetary-Orchestrator-Fabric-v0/config/owner-commands.example.json
  ```
4. **Execute the restart drill** to rehearse orchestrator kill/resume with merged telemetry:
  ```bash
  demo/Planetary-Orchestrator-Fabric-v0/bin/run-restart-drill.sh \
     --jobs 12000 \
     --stop-after 200 \
     --label "resume-drill" \
     --owner-commands demo/Planetary-Orchestrator-Fabric-v0/config/owner-commands.example.json
  ```
  This invokes `--stop-after-ticks` under the hood, captures the checkpoint path from `summary.json`, and resumes automatically so non-technical owners see the drill succeed end-to-end.
5. **Launch the acceptance autopilot** to validate Kardashev-grade readiness in one shot:
  ```bash
  npm run demo:planetary-orchestrator-fabric:acceptance -- \
    --label planetary-acceptance \
    --jobs-high-load 10000 \
    --outage-node mars.gpu-helion
  ```
  This executes both the 10k-job load trial and the orchestrator kill/resume drill, fails fast if <98% of work completes, and writes a consolidated JSON verdict alongside all mission artifacts.
6. **Open the dashboard** at `demo/Planetary-Orchestrator-Fabric-v0/reports/<label>/dashboard.html` to explore live topology overlays, mermaid system diagrams, and owner command panels for either run.
7. **Practice owner interventions** using the guided commands in [`docs/owner-control.md`](docs/owner-control.md) (pause, reroute, throttle, resume) against the generated state bundle—zero coding required.

The script defaults to the example configuration under `config/fabric.example.json`. Provide your own configuration (with mainnet deployment information, private IP ranges, funding accounts, etc.) by passing `--config path/to/config.json`.

## System Blueprint

```mermaid
flowchart TD
    subgraph Global[Global Orchestrator]
      Direction --> Ledger[(Unified Ledger)]
      Direction --> Checkpoint[(Checkpoint Engine)]
      Direction --> Governance[(Owner Command Deck)]
    end

    subgraph EarthShard[Earth Shard]
      EarthRegistry[(Job Registry)] --> EarthRouter
      EarthRouter[[Regional Router]] --> EarthAgents((Agent Pods))
    end

    subgraph LunaShard[Luna Shard]
      LunaRegistry[(Job Registry)] --> LunaRouter
      LunaRouter[[Regional Router]] --> LunaAgents((Agent Pods))
    end

    subgraph MarsShard[Mars Shard]
      MarsRegistry[(Job Registry)] --> MarsRouter
      MarsRouter[[Regional Router]] --> MarsAgents((Agent Pods))
    end

    subgraph HeliosShard[Helios Shard]
      HeliosRegistry[(Job Registry)] --> HeliosRouter
      HeliosRouter[[Regional Router]] --> HeliosAgents((Agent Pods))
    end

    Ledger --> EarthRegistry
    Ledger --> LunaRegistry
    Ledger --> MarsRegistry
    Ledger --> HeliosRegistry

    EarthRouter -. spillover .- MarsRouter
    MarsRouter -. spillover .- HeliosRouter
    LunaRouter -. spillover .- EarthRouter

    Governance --> Direction
    Checkpoint --> Direction
```

## Directory Structure

| Path | Purpose |
| --- | --- |
| `bin/run-demo.sh` | One-command launcher for the full demo flow. |
| `bin/run-restart-drill.sh` | Two-phase orchestrator kill/resume drill that stitches checkpoint + resume artifacts. |
| `config/fabric.example.json` | Declarative definition of shards, nodes, owner policies, checkpoint schedules. |
| `config/owner-commands.example.json` | Sample schedule of owner commands applied mid-run. |
| `docs/architecture.md` | Deep dive into the architecture with additional diagrams, latency budgets, and ledger mapping. |
| `docs/owner-control.md` | Owner empowerment manual with pause/update scripts and governance hooks. |
| `docs/ci.md` | How CI guards this demo with enforced, reproducible checks. |
| `docs/mission-blueprint.md` | End-to-end planning dossier covering task decomposition, verification matrices, and failure analysis. |
| `docs/restart-drill.md` | Step-by-step walkthrough of the orchestrator restart exercise and artifact interpretation. |
| `src/` | TypeScript source powering the orchestrator, routers, checkpoint manager, and simulation engine. |
| `tests/planetary_fabric.test.ts` | Deterministic assertions validating shard balance, failover (<2% drop), and checkpoint resume. |
| `ui/dashboard.html` | Pre-rendered dashboard template that visualizes run artifacts without a build step. |
| `reports/` | Generated output bundles; each run writes to a timestamped directory plus the chosen label. |
| `storage/` | Durable checkpoint snapshots; safe to commit sanitized templates, but not production secrets. |

## Operator Personas

- **Mission Director (Non-Technical):** Runs `bin/run-demo.sh`, opens the dashboard, and issues owner commands via provided JSON helpers.
- **Fabric Steward (Ops):** Extends `config/fabric.example.json` with production RPC endpoints, container registries, and budget guardrails.
- **Validator Guild:** Consumes the emitted ledger snapshots to audit consensus, payouts, and cross-shard spillover.
- **Governance Council:** Exercises the owner controls to rehearse pause/resume, thermostat tuning, or reward adjustments.

## What You Get After a Run

- ✅ **`summary.json`** – Throughput metrics (including cancellations), shard depths, failure recovery stats, deterministic seeds.
  - Includes a `run` object showing whether the run resumed from checkpoint, stopped early, or completed.
- ✅ **`events.ndjson`** – Chronological event stream ready for ingestion into SIEM/observability stacks.
- ✅ **`checkpoint.json`** – Owner-governed snapshot reflecting any retargeted path/interval updates for instant resume.
- ✅ **`dashboard.html`** – Rich interactive briefing with mermaid flows, tables, and callouts.
- ✅ **`owner-script.json`** – Example governance payloads for immediate replay against the live stack.
- ✅ **`owner-commands-executed.json`** – Ledger of scheduled, executed, skipped, and pending owner commands.

## Branch Protection & CI

- `.github/workflows/demo-planetary-orchestrator-fabric.yml` enforces lint-free TypeScript compilation, automated tests, demo execution, and artifact validation.
- Pull requests touching this directory or its scripts **must** pass the workflow before merging.
- `docs/ci.md` explains how to extend branch protection rules so `main` stays permanently green.

## Next Steps

- Integrate live blockchain endpoints (mainnet, L2, or planetary rollups) by filling in the placeholders in `config/fabric.example.json`.
- Wire container registries and GPU fleets by connecting the node marketplace to Kubernetes, Nomad, or bare-metal pools.
- Attach treasury/payment processors via the existing reward engine scripts in `scripts/v2/`.
- Publish dashboards to IPFS or internal portals by copying the generated HTML + JSON artifacts.

The Planetary Orchestrator Fabric v0 demo proves that AGI Jobs v0 (v2) hands unprecedented, planetary-grade orchestration power to anyone—no code, no compromises, total owner control.
