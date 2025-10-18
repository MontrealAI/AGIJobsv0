# 🎖️ ASI Takes Off Demo Launcher — Sovereign Constellation

The Sovereign Constellation already contains every contract, script, and UI required to run a civilization-scale
mission. This launcher distills those assets into a single, non-technical control surface. Running
`npm run demo:sovereign-constellation:asi-takes-off:launch` produces a complete "ASI Takes Off" launch manifest,
verifies owner supremacy, and writes an executable mission briefing to `output/asi-takes-off-launch.md`.

## What this launcher guarantees

- **Meta-agentic orchestration** – the manifest maps each flagship mission pillar to the exact playbook steps, hubs,
and validator cadences used by the Constellation Orchestrator.
- **Owner-first α-AGI governance** – owner atlas data and command matrices are embedded so the operator can pause,
upgrade, or reassign authority without touching raw ABIs.
- **Invisible blockchain plumbing** – the generated briefing lists every wallet prompt and automation command in
plain language so the chain disappears for non-technical directors.
- **Recursive self-improvement** – telemetry and thermostat outputs are summarised with concrete owner actions,
proving the system tunes itself through feedback.
- **Winning the AI race** – CI guardrails, automation, and launch sequencing converge into a two-page playbook that a
single wallet operator can execute immediately.

## Usage

```bash
npm run demo:sovereign-constellation:asi-takes-off:launch
```

The command prints a mission synopsis to STDOUT and emits a Markdown launch briefing that can be handed directly to
stakeholders. The launcher is idempotent; re-running it refreshes the output with the latest telemetry and governance
state without requiring any manual edits.

Pair it with the step-by-step flight plan CLI for live rehearsals:

```bash
npm run demo:sovereign-constellation:asi-takes-off:flight-plan
```

This prints each phase, non-technical step, owner lever, automation command, and verification signal in order so
directors can walk through the launch before any signatures are collected.

## Files

- `launch.mjs` – orchestrates configuration loading, telemetry analysis, owner atlas synthesis, and manifest
  generation. It proves how AGI Jobs v0 (v2) empowers non-technical teams to steer an ASI-grade workforce safely.
- `output/asi-takes-off-launch.md` – generated artefact containing the actionable briefing, owner controls, telemetry
  checkpoints, and CI guardrails required to deploy the Sovereign Constellation at the "ASI Takes Off" level.

## Tests

`npm run demo:sovereign-constellation:test` now executes
`demo/sovereign-constellation/test/bin/asiTakesOffLaunch.spec.js` to guarantee the launcher keeps exporting the
manifest successfully on every branch.
