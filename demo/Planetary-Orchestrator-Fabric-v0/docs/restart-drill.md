# Restart Drill – Planetary Orchestrator Fabric

The restart drill demonstrates that AGI Jobs v0 (v2) lets a non-technical mission director halt the orchestrator mid-flight, resume from the latest checkpoint, and continue without losing jobs or telemetry.

## Two-Stage Flow

1. **Stage One – Controlled Halt**  
   `bin/run-restart-drill.sh` calls `src/index.ts` with `--stop-after-ticks <N>`. Jobs are seeded across shards, owner commands execute as scheduled, and at tick `N` the orchestrator writes a checkpoint and stops.  
   - `events.ndjson` gains a `simulation.stopped` entry capturing tick, directive, and outstanding queues.  
   - `summary.json.run` records `stoppedEarly: true` and `stopReason: "stop-after-ticks=<N>"`.
2. **Stage Two – Resume**  
   The script parses `summary.json` to discover the active checkpoint path (even if the owner retargeted it during stage one) and restarts the orchestrator with `--resume`.  
   - The resume run appends events to the existing stream.  
   - `summary.json.run` now shows `{ checkpointRestored: true, stoppedEarly: false }`.  
   - `ownerCommands.skippedBeforeResume` lists commands executed before the halt.

## Command Reference

```bash
# Full drill with defaults
./demo/Planetary-Orchestrator-Fabric-v0/bin/run-restart-drill.sh

# Custom label, faster halt, alternate schedule
./demo/Planetary-Orchestrator-Fabric-v0/bin/run-restart-drill.sh \
  --label "edge-drill" \
  --stop-after 120 \
  --jobs 8000 \
  --owner-commands demo/Planetary-Orchestrator-Fabric-v0/config/owner-commands.example.json
```

Behind the scenes the drill forwards the following flags to the TypeScript entry point:

- `--stop-after-ticks` – positive integer; determines when the orchestrator halts.
- `--preserve-report-on-resume` – ensures reports persist and `events.ndjson` is appended rather than replaced.
- `--checkpoint` – supplied only during the resume phase with the path extracted from `summary.json`.

## Verifying Success

1. Open `reports/<label>/summary.json` and confirm:
   - `run.stoppedEarly` is `true` after stage one and `false` after stage two.
   - `run.stopTick` matches the tick from the drill.
   - `metrics.jobsCompleted` equals `metrics.jobsSubmitted` after the resume.
2. Inspect `reports/<label>/events.ndjson`:
   - A `simulation.stopped` event appears exactly once.
   - Subsequent events show resumed processing and checkpoint saves.
3. Launch `reports/<label>/dashboard.html` and load the summary to visualise pre/post drill topology.
4. Review `reports/<label>/owner-commands-executed.json` to audit which commands ran before and after the restart.

## Production Hardening Tips

- Rotate labels per drill (`--label my-drill-$(date -u +%Y%m%d%H%M)`) so historical runs remain available for auditors.
- Store checkpoints on durable, access-controlled storage; the demo defaults to `storage/checkpoint.json` but owner commands can retarget to any path.
- Couple the drill with alerting: trigger notifications on the `simulation.stopped` event so SRE teams know the halt was intentional.

The restart drill proves that AGI Jobs v0 (v2) behaves like the superintelligent orchestrator operators expect—capable of pausing an entire planetary workload and resuming without missing a beat.
