# Kardashev-II Omega-Grade Runbook

This runbook gives a non-technical owner the exact steps to launch, monitor, pause, and resume the Omega-grade AGI workforce. Every command is deterministic, battle-tested in CI, and mirrors the live AGI Jobs v0 (v2) production flow.

## 1. Prerequisites

- Python 3.12+ available (the repo bootstrap already installs it for CI).
- Access to this repository (no extra dependencies required).
- Optional: environment variables for mainnet RPC endpoints if you intend to connect to live contracts.

## 2. Launch the Omega Orchestrator

```bash
cd demo/"Kardashev-II Omega-Grade-α-AGI Business-3"
./bin/run-omega.sh
```

What happens automatically:

1. All agents boot and subscribe to the A2A bus.
2. The orchestrator posts the showcase alpha jobs from `config/default_config.json`.
3. State checkpoints are created every 15 seconds in `reports/orchestrator_state.json`.
4. Structured JSON logs stream to `reports/orchestrator.log` for live monitoring.

You can terminate the process at any time (`Ctrl+C`). Restarting the same command resumes from the last checkpoint.

## 3. Observe Progress

```bash
python run_demo.py status
```

Outputs counts of active/completed jobs and the current pause flag. For deeper insight, open `reports/orchestrator.log` in any JSON viewer or forward it into existing observability pipelines.

## 4. Pause and Resume All Agents

```bash
# Pause immediately
python run_demo.py pause

# Resume later
python run_demo.py resume
```

The pause command writes the flag into the checkpoint file, so even if the process is restarted while paused, agents stay suspended until you run `resume`.

## 5. Adjust Economic Parameters

Use the owner console to modify validator stake ratios, energy ceilings, or other economic levers.

```bash
# Increase validator stake ratio to 15%
python python/omega_business3/owner_console.py set-stake 0.15

# Raise the planetary energy ceiling by 100,000 GW
python python/omega_business3/owner_console.py set-energy 1100000
```

Every change updates `config/default_config.json` deterministically; the next orchestrator launch loads the new parameters automatically.

## 6. Emergency Halt (SystemPause equivalent)

1. Run `python run_demo.py pause`.
2. Confirm pause via `python run_demo.py status` (Paused: True).
3. Optionally push the paused state to your Git remote for audit trail.
4. When ready, run `python run_demo.py resume`.

## 7. Log Collection

- `reports/orchestrator.log` – append-only JSON lines.
- `reports/orchestrator_state.json` – deterministic snapshot (safe to archive).
- `reports/` may also contain simulation exports and future dashboards.

Archive the entire `reports/` directory after each mission for compliance.

## 8. Connecting to Live Infrastructure (Optional)

1. Set environment variables (`WEB3_RPC_URL`, `PRIVATE_KEY`) before running `run_demo.py`.
2. Extend `config/default_config.json` with live job templates or staking requirements.
3. Replace the default `SyntheticEconomySim` with a live oracle by implementing `PlanetarySim` and pointing the config to it.

## 9. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `insufficient tokens for allocation` | Increase the agent’s allowance or reduce job budgets via `owner_console`. |
| `planetary energy exhausted` | Raise `resource_manager.planetary_energy_gw` or pause low-priority jobs. |
| Validator approvals stuck | Verify validator agents are running (check logs) or lower quorum via `owner_console`. |

## 10. Shutdown Procedure

1. Run `python run_demo.py pause` to ensure a clean checkpoint.
2. Stop the running orchestrator process if active.
3. Archive `reports/` and any generated artefacts.
4. (Optional) Commit the artefacts or runbook notes to your governance repository.

Following this runbook ensures the Omega-grade demo always operates in a production-safe, owner-controlled manner.
