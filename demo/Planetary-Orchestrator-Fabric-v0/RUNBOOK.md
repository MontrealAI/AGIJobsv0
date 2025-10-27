# Planetary Orchestrator Fabric – Owner RUNBOOK

> **Audience:** the non-technical owner and their delegated operators.
> **Goal:** launch, verify, and archive the Planetary Orchestrator Fabric demo with unstoppable assurance.

## Step 1 — Prepare the manifest

1. Review `config/fabric.manifest.json`.
   - Confirm the owner address and controller multisig.
   - Adjust `controls.pauseAll` if you want to demonstrate the global halt.
2. Optional: update node capacity or specialties to match the current deployment narrative.
3. Save changes (no compilation required).

## Step 2 — Launch the planetary fabric

1. Open a terminal at the repository root.
2. Run the full drill:
   ```bash
   npm run demo:planetary-fabric:run
   ```
3. Observe the console summary – it prints jobs completed, reassignments, spillovers, unstoppable score, and destination paths for the report and UI snapshot.
4. To demonstrate mid-flight recovery, run:
   ```bash
   npm run demo:planetary-fabric:run -- --simulate-kill
   ```
   - The command stops halfway, writes a checkpoint, simulates a crash, resumes automatically, and prints the unstoppable floor confirmation.

## Step 3 — Validate unstoppable metrics

1. Execute the CI ritual locally:
   ```bash
   npm run demo:planetary-fabric:ci
   ```
2. The script will:
   - Check README headings & mermaid quota.
   - Run the 10,000-job load test with crash/resume.
   - Fail if unstoppable < 98% or shard failure rate ≥ 2%.
   - Emit the latest report at `demo/Planetary-Orchestrator-Fabric-v0/output/fabric-ci-report.json`.
3. Archive the generated JSON files with your governance pack.

## Step 4 — Publish the cinematic dashboard

1. Open `demo/Planetary-Orchestrator-Fabric-v0/ui/index.html` in any browser.
2. Load the `ui/data/latest.json` snapshot (already referenced by default).
3. Present the unstoppable gauge, queue ribbons, spillover timeline, and node heartbeat tracker to stakeholders.
4. Export the page as PDF or capture screenshots for the governance record.

## Step 5 — Exercise owner levers

1. To demonstrate pause/resume:
   - Set `controls.pauseAll` to `true` in `config/fabric.manifest.json`.
   - Run `npm run demo:planetary-fabric:run` and observe the immediate halt.
   - Reset `pauseAll` to `false` and rerun.
2. Adjust `maxSpilloverPerCycle` to a smaller number (e.g. `16`) to showcase tight overflow control.
3. Re-run the CI ritual to prove unstoppable compliance after changes.

## Step 6 — Archive evidence

1. Collect:
   - `output/fabric-report.json`
   - `output/fabric-ci-report.json`
   - `ui/data/latest.json`
   - Console logs from the CI run
2. Store them alongside governance meeting minutes for a complete evidence chain.

With these steps, the owner has irrefutable proof that AGI Jobs v0 (v2) delivers a planetary orchestration fabric that remains unstoppable under failure, spillover, and governance drills.
