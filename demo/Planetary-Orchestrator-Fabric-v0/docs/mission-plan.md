# Mission Plan Autopilot

The Planetary Orchestrator Fabric demo now ships with a declarative **mission plan** so non-technical owners can launch Kardashev-grade drills without touching CLI switches. A mission plan bundles the fabric configuration, job blueprint, owner command schedule, checkpoint cadence, and reporting overrides into a single JSON dossier.

## Quickstart

```bash
# Launch the full planetary drill using the bundled dossier
./demo/Planetary-Orchestrator-Fabric-v0/bin/run-demo.sh \
  --plan demo/Planetary-Orchestrator-Fabric-v0/config/mission-plan.example.json
```

The orchestrator will:

- Load `config/fabric.example.json` for shard + node topology.
- Apply the curated job blueprint and owner command schedule.
- Override checkpoint cadence and reporting directory as specified in the plan.
- Seed the run with 10,000 Kardashev workloads, simulate a Mars outage, and publish artifacts under `reports/mission-plan`.

## File Structure

`config/mission-plan.example.json` exposes the following fields:

```jsonc
{
  "metadata": {
    "label": "Kardashev-II Planetary Drill",
    "description": "Human readable summary surfaced in dashboards + chronicles.",
    "author": "Mission Council",
    "version": "1.0.0",
    "tags": ["demo", "mission-plan", "non-technical"]
  },
  "config": "./fabric.example.json",               // path or inline FabricConfig
  "ownerCommands": "./owner-commands.example.json", // path or inline owner schedule
  "jobBlueprint": "./jobs.blueprint.example.json",  // path or inline blueprint
  "reporting": {
    "directory": "../reports/mission-plan",        // optional reporting override
    "defaultLabel": "mission-plan"
  },
  "run": {
    "jobs": 10000,
    "simulateOutage": "mars.gpu-helion",
    "outageTick": 45,
    "outputLabel": "mission-plan",
    "stopAfterTicks": 240,
    "checkpoint": {
      "intervalTicks": 30,
      "path": "../storage/mission-plan-checkpoint.json"
    },
    "preserveReportDirOnResume": true
  }
}
```

All paths are resolved relative to the mission plan file. Inline objects are accepted if you prefer to embed configuration directly.

## Customising Your Plan

1. **Clone the template**
   ```bash
   cp demo/Planetary-Orchestrator-Fabric-v0/config/mission-plan.example.json \
      demo/Planetary-Orchestrator-Fabric-v0/config/mission-plan.my-drill.json
   ```
2. **Edit metadata** so dashboards and chronicles display your mission name, author, and tags.
3. **Swap config/blueprint/owner command paths** to point at production-ready assets (e.g. L2 shards, bespoke job mixes, governance-approved command decks).
4. **Tune `run.checkpoint`** to match operational SLAs—tighten intervals during solar storms, retarget storage buckets, or pre-seed checkpoint rotation.
5. **Adjust reporting directory and default label** to stream artifacts into the right archival bucket.
6. **Execute**:
   ```bash
   ./demo/Planetary-Orchestrator-Fabric-v0/bin/run-demo.sh \
     --plan demo/Planetary-Orchestrator-Fabric-v0/config/mission-plan.my-drill.json
   ```

## Dashboard & Chronicle Integration

- `summary.json` now includes a `missionPlan` block with metadata, source paths, and run directives. The drag-and-drop dashboard renders a dedicated **Mission Plan** panel and JSON directives pane.
- `mission-chronicle.md` narrates plan metadata and run directives so auditors can confirm the drill followed the approved dossier.

## Validation

- `npm run demo:planetary-orchestrator-fabric:acceptance -- --plan <path>` will automatically tune high-load and restart scenarios using your mission plan.
- `tests/planetary_fabric.test.ts` exercises the mission plan loader to guarantee owner overrides (checkpoint, reporting, node updates) respect the plan.

## Safety Considerations

- Store production mission plans in a secure repository; they contain reporting directories and checkpoint paths.
- Rotate mission plans when onboarding new regions or owner command decks to ensure deterministic reproducibility.
- Pair each mission plan with a governance sign-off documenting intended outcomes and risk mitigations.

Mission plans transform AGI Jobs v0 (v2) into a button-click experience for planetary operators—declare your objectives once, then let the fabric orchestrate the galaxy.
