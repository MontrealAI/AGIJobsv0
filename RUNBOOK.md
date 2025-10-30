# Emergency Operations Runbook

This document outlines the procedures operators should follow when responding to
production incidents involving the SelfPlay arena, StakeManager, and related
services. For a full architectural overview and ROI rationale, review the
[HGM Operator Whitepaper](docs/hgm/whitepaper.md) before executing any of the
steps below.

## Day-One Operations Checklist

1. **Confirm configuration drift.** Compare the active deployment manifest with
   [`config/agialpha/hgm.json`](config/agialpha/hgm.json) and
   [`config/sentinel.json`](config/sentinel.json). Document any overrides in the
   change log.
2. **Run guardrail validation.** Execute `ci/hgm-suite.sh` locally and ensure
   the `ci (v2) / HGM guardrails` job passes. See
   [`docs/ci-v2-branch-protection-checklist.md`](docs/ci-v2-branch-protection-checklist.md)
   for required artefacts.
3. **Prime the operator surface.** Launch the guided simulation with
   `HGM_REPORT_DIR=$(pwd)/reports/hgm make demo-hgm` and open the lineage viewer
   in [`demo/Huxley-Godel-Machine-v0/web/index.html`](demo/Huxley-Godel-Machine-v0/web/index.html)
   to verify reports stream in.
4. **Snapshot economic baselines.** Record the initial thermostat ROI window by
   streaming a short burst of metrics:
   ```bash
   mkdir -p reports/hgm
   python -m scripts.thermostat watch --dry-run --iterations 12 > reports/hgm/roi-baseline.log
   ```
   Archive the output alongside a sentinel snapshot captured with:
   ```bash
   python - <<'PY'
   from hgm_core.engine import HGMEngine
   from services.sentinel.config import load_config
   from services.sentinel.service import SentinelMonitor

   monitor = SentinelMonitor(HGMEngine(), load_config())
   print(monitor.snapshot())
   PY
   ```

Complete this checklist after every fresh environment bring-up or significant
parameter change.

## Required status checks

- `ci (v2) / HGM guardrails` – validates AGIALPHA configuration, runs the HGM
  orchestrator regression tests, lint-checks the guided demo assets, and executes
  a smoke test of `make demo-hgm`. If this gate is red, rerun `ci/hgm-suite.sh`
  locally (after `npm ci` and `pip install -r requirements-python.txt`) to
  reproduce the failure before attempting mitigations or hotfixes.

## Economic Levers

The thermostat provides the first line of defence when ROI deviates from the
treasury policy described in [`config/agialpha/hgm.json`](config/agialpha/hgm.json).

1. **Adjust concurrency safely.** Preview changes with
   `python -m scripts.thermostat watch --widening-step 0.08 --max-widening-alpha 1.8 --dry-run`.
   Re-run without `--dry-run` once approved. The controller in
   [`services/thermostat/controller.py`](services/thermostat/controller.py)
   applies updates gradually and enforces cooldowns to prevent oscillation.
2. **Rebalance ROI targets.** Supply new `--target-roi`, `--lower-margin`, and
   `--upper-margin` values when invoking the thermostat CLI. Document every
   adjustment in the operations log and capture the resulting ROI baseline.
3. **Review sentinel gates.** If budget caps or failure streaks drive repeated
   pauses, inspect [`config/sentinel.json`](config/sentinel.json) and align with
   risk/compliance before issuing overrides.
4. **Quantify impact.** Re-run the ROI baseline command
   (`python -m scripts.thermostat watch --dry-run --iterations 12`) after each
   change and compare the logs to prior baselines to estimate ROI lift or
   drawdown. Escalate to finance when variance exceeds 10 %.

Escalate to full pause procedures below when thermostat moves cannot restore ROI
within two control cycles.

## 1. Immediate Pause Procedures

1. **Identify the affected components.** Check orchestrator logs and the
   monitoring webhook for alerts (look for `moderation:` or `auto-slash:`
   reasons). Determine whether the issue is isolated to the arena contracts or
   involves system-wide concerns.

2. **Pause on-chain contracts.** Use the Hardhat script `scripts/owner.pause.ts`:

   ```bash
   pnpm ts-node scripts/owner.pause.ts \
     --arena <ARENA_ADDRESS> \
     --stake-manager <STAKE_MANAGER_ADDRESS> \
     --system-pause <SYSTEM_PAUSE_ADDRESS> \
     --pause
   ```

   - Add `--dry-run` to preview changes.
   - To resume, replace `--pause` with `--unpause` once remediation is complete.

3. **Freeze orchestration state.** Ensure no new rounds are started while the
   contracts are paused. The orchestrator scoreboard will record ongoing
   failures and helps confirm that no additional slashing occurs while you
   triage the issue.

## 2. Role Revocation & Credential Rotation

If an orchestrator key or validator lock manager is compromised:

1. Review the current assignments with the scoreboard snapshot stored in
   `storage/orchestrator/scoreboard.json` and the latest run receipts
   (`storage/orchestrator/runs/`).

2. Remove compromised actors and grant replacement permissions with
   `scripts/owner.setRoles.ts`:

   ```bash
   pnpm ts-node scripts/owner.setRoles.ts \
     --arena <ARENA_ADDRESS> \
     --stake-manager <STAKE_MANAGER_ADDRESS> \
     --revoke-orchestrator <OLD_OPERATOR> \
     --allow-orchestrator <NEW_OPERATOR> \
     --dry-run
   ```

   - Repeat with `--allow-lock-manager` / `--revoke-lock-manager` for the
     StakeManager validator lock managers.
   - Re-run without `--dry-run` to apply the changes.

3. Confirm the updates by querying the contract (`setOrchestrator` and
   `validatorLockManagers`), and ensure the orchestrator runner is restarted if
   credentials changed.

## 3. Parameter Adjustments & Fee Splits

When anomaly response requires rebalancing incentives (e.g., tightening
committee stakes or modifying fee distribution):

1. Fetch the current configuration. The monitoring alert payload and the
   orchestrator receipt `timings.scoreboard` section provide the latest context.

2. Run `scripts/owner.setParams.ts` to tune rewards, committee size, reward
   splits, or StakeManager fee percentages:

   ```bash
   pnpm ts-node scripts/owner.setParams.ts \
     --arena <ARENA_ADDRESS> \
     --teacher-reward 150000000000000000000 \
     --validator-stake 5000000000000000000 \
     --teacher-split 6000 \
     --student-split 2000 \
     --validator-split 2000 \
     --stake-manager <STAKE_MANAGER_ADDRESS> \
     --fee-pct 4 \
     --dry-run
   ```

3. After verifying the dry run, rerun without `--dry-run` to broadcast the
   transactions. Watch for the `ParametersUpdated` events on-chain to confirm.

## 4. Manual Slashing & Scoreboard Reconciliation

1. Use the orchestrator logs (`status.logs`) and the persisted scoreboard to
   identify the offending validator. Slashing actions are logged with messages
   like `validator slashed: moderation:block`.

2. Invoke `SelfPlayArena.reportValidatorMisconduct` for targeted slashing if
   automated handling is insufficient. Ensure the arena is paused first to
   avoid conflicting state transitions.

3. After executing the slash, run the scoreboard enrichment tool to update the
   culture reward ledger:

   ```bash
   python -m orchestrator.tools.culture_rewards --total 1500 --top 8
   ```

   The resulting JSON is saved to `storage/orchestrator/culture_rewards.json`
   and can be referenced when preparing weekly reward distributions.

## 5. Post-Incident Checklist

- Resume contracts with `scripts/owner.pause.ts --unpause` once validated.
- Re-enable orchestrator automation and verify new rounds close without
  generating alerts.
- Archive the monitoring webhook payload and run receipts in the incident log
  for audit purposes.
- Communicate parameter or role changes to the wider operations team.

Maintaining these procedures ensures rapid containment of slashing anomalies
while keeping governance parameters aligned with production requirements.

