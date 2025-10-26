# Owner Control – Kardashev-II Omega-Grade Demo

This document lists the explicit actions the contract owner (or their operations delegate) can perform to control the Omega-grade orchestrator in production. All commands are non-destructive and reversible.

## 1. Adjust Validator Economics

```bash
python python/omega_business3/owner_console.py set-stake 0.12
```

Sets the validator stake ratio to 12%. This mirrors calling the on-chain timelocked `setJobStakeRatio` and takes effect the next time the orchestrator reads `config/default_config.json` (immediately for running sessions because checkpoints include the new ratio).

## 2. Increase/Decrease Planetary Energy or Compute

```bash
python python/omega_business3/owner_console.py set-energy 1250000
```

Updates the planetary energy ceiling. Use a lower value to enforce throttling or a higher value to unlock additional missions. Compute ceilings are adjusted through the same config file if needed.

## 3. Pause or Resume the Entire Mesh

```bash
# Pause
python run_demo.py pause

# Resume
python run_demo.py resume
```

The pause flag is persisted to `reports/orchestrator_state.json`, guaranteeing that a restart maintains the paused state until explicitly resumed.

## 4. Emergency Recovery

1. Run `python run_demo.py pause`.
2. Copy `reports/orchestrator_state.json` and `reports/orchestrator.log` to a safe location.
3. Inspect the logs for the last completed job IDs and validator votes.
4. Resume using `python run_demo.py resume` or edit the state file to cancel problematic jobs if necessary.

## 5. Override Specific Jobs

- Open `reports/orchestrator_state.json`.
- Locate the job entry by `job_id`.
- Change `status` to `"cancelled"` to remove it from the active queue.
- Save the file and run `python run_demo.py resume`.

## 6. Integrate External Validators

Add new validator agent configs to `config/default_config.json`:

```json
{
  "name": "SentinelValidator-II",
  "skills": ["validation", "audit"],
  "stake": 250000,
  "energy_allowance": 400,
  "compute_allowance": 350
}
```

Restart the orchestrator; the new validator automatically participates in commit–reveal voting.

## 7. Contract Owner Safeguards

- All configuration changes are atomic JSON rewrites (no partial state).
- State checkpoints are deterministic and can be archived for auditors.
- Pausing is immediate and equivalent to the on-chain `SystemPause` primitive.
- Validators always stake before validating; the owner can raise or lower stakes instantly via the console.

With these controls, the owner can modulate risk, throughput, and incentives at planetary scale without developer intervention.
