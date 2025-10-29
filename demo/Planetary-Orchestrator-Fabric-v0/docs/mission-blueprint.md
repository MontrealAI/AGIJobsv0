# Mission Blueprint – Planetary Orchestrator Fabric Restart Drill

This dossier documents the first-principles planning behind the restart-ready upgrade of the Planetary Orchestrator Fabric. It is designed so a non-technical owner can audit the reasoning, reproduce every verification, and understand how the fabric behaves when we deliberately crash and resume it.

## Task Decomposition

1. **User-Level Empowerment** – Extend the CLI so operators can stop a run after a defined number of ticks and resume from a checkpoint without touching code.
2. **Automation for Non-Technical Owners** – Provide a shell script that performs the full stop-and-resume drill, auto-discovers the correct checkpoint path, and stitches artifacts.
3. **Simulation Enhancements** – Persist run metadata (`stopAfterTicks`, early termination reason, resume flag) into `summary.json`, events, and logs.
4. **Testing & CI Reinforcement** – Expand deterministic tests to cover the stop/resume drill and ensure event streams capture the halt.
5. **Operator Guidance** – Update docs, dashboards, and quickstarts so owners understand the new controls and audit surfaces.
6. **Blueprinted Workloads** – Allow non-technical owners to load declarative job blueprints so restart drills replay the same Kardashev mix deterministically.

## Multi-Angle Verification Matrix

| Perspective | Verification Method | Evidence |
| --- | --- | --- |
| Deterministic correctness | `npm run test:planetary-orchestrator-fabric` (new `testStopAndResumeDrill`) | Confirms checkpoint restore and merged telemetry survive the crash drill. |
| CI parity | `.github/workflows/demo-planetary-orchestrator-fabric.yml` | Workflow already executes lint, tests, and a CI-mode demo; the new metadata is asserted via artifact validation. |
| Runtime behaviour | `bin/run-restart-drill.sh` | Non-technical drill that halts at tick `stopAfterTicks`, extracts the checkpoint path, and resumes automatically. |
| Telemetry integrity | Manual inspection of `reports/<label>/events.ndjson` and `summary.json` | The new `simulation.stopped` event and `run` metadata confirm exactly when and why the orchestrator halted. |
| User experience | Updated README/UI walkthroughs | Owners receive explicit instructions on how to run the drill and interpret the outputs. |

## Challenged Assumptions & Mitigations

- **Assumption:** Appending to existing report directories during resume might corrupt prior data.  
  **Mitigation:** Introduced `preserveReportDirOnResume` with append mode, validated by tests that inspect `events.ndjson` for the injected `simulation.stopped` event.
- **Assumption:** Early stop events could bloat artifacts with full shard payloads.  
  **Mitigation:** Emit a compact outstanding job summary (queue + in-flight counts) rather than full objects.
- **Assumption:** Owner command schedules might misalign across restart boundaries.  
  **Mitigation:** Extended simulation bookkeeping so commands executed pre-checkpoint surface under `ownerCommands.skippedBeforeResume`, keeping final audits consistent.
- **Assumption:** Operators might forget to use the retargeted checkpoint path after a `checkpoint.configure`.  
  **Mitigation:** Restart drill parses `summary.json` to discover the current path before resuming.

## Independent Cross-Checks

- **Mathematical sanity:** Verified that stop tick calculations use `Math.ceil(stopAfterTicks)` to avoid off-by-one drift between integer and fractional input.
- **Log symmetry:** Compared pre/post resume shard statistics during testing to confirm totals match and no shard is starved.
- **Event stream integrity:** Confirmed via tests that the appended `simulation.stopped` event exists exactly once, ensuring replay systems can detect intentional halts.
- **Documentation completeness:** Cross-referenced README, `docs/owner-control.md`, `docs/restart-drill.md`, and the drag-and-drop console `ui/dashboard.html` so every operator surface mentions the restart drill.

## Potential Pitfalls & Future Watchpoints

- **Long-running runs with enormous queues** could generate large outstanding summaries even with compact notation. Consider rotating logs to cold storage for production.
- **Owner-configured checkpoint paths** might point to secured storage that requires credentials; the drill assumes local access. Production deployments should couple the script with secrets management.
- **Simultaneous multi-shard halts** remain deterministic but operators should still review `owner-commands-executed.json` to confirm command order.

## Final Reflective Pass

After implementing and testing, we replayed the reasoning chain from scratch: confirmed task decomposition still maps to code changes, re-read the mitigation list for hidden gaps, and re-ran the drill mentally using alternative labels/configs. No new inconsistencies surfaced—the restart workflow remains deterministic, auditable, and accessible to non-technical mission directors.
