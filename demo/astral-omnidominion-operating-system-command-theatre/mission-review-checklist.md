# Mission Review Checklist

Classify the run before deciding what it proves: offline file rehearsal, browser fixture lab, provider commissioning, full-stack rehearsal or production execution.

## 1. Offline theatre evidence

- [ ] Read `report.json`: `schema_version: 2`, `execution_mode: offline-fixture`, six documents and no input issues.
- [ ] Confirm `live_provider`, `browser_executed`, `settlement_approved` and `production_approved` are all false.
- [ ] Verify all five evidence artifacts and recompute the acceptance checks:
  ```bash
  python3 demo/astral-omnidominion-operating-system-command-theatre/run_demo.py --verify-report reports/astral-omnidominion-operating-system-command-theatre/report.json
  ```
- [ ] Inspect `accepted` separately from integrity. An intact rejected bundle is valid evidence of rejection.
- [ ] Check the source, duplicate, deliverable and separate checker: four rows → three unique entries → 21,999 cents.
- [ ] Demonstrate `--scenario rejected` (one-cent error, exit 1) and `--scenario paused` (no task artifacts, exit 1).
- [ ] Open the HTML dashboard, inspect the job catalog and confirm no success card implies live capability or settlement.
- [ ] Retain the report and its unique `runs/` directory. Hashes are relative to this report, not a signature or external attestation.

## 2. Full-stack artifact integrity

- [ ] Read `reports/agi-os/first-class/first-class-run.json` → `steps[]`. Require relevant stages to have `status: success`; enumerate skipped and failed stages.
- [ ] Recompute a summary hash with a cross-platform command:
  ```bash
  python3 -c "from pathlib import Path; import hashlib; print(hashlib.sha256(Path('reports/agi-os/grand-summary.md').read_bytes()).hexdigest())"
  ```
  Compare it to `first-class/first-class-manifest.json`. Verify the complete manifest before relying on the package.
- [ ] Confirm outputs belong to the run's commit and configuration; stale files cannot fill in a skipped stage.
- [ ] Inspect `grand-summary.html`, `owner-control-matrix.json` and the preserved `first-class/owner-control-map.mmd` using a trusted Mermaid viewer. A source diagram is not deployed-state proof.
- [ ] Review `mission-bundle/manifest.json`, simulation telemetry and `dry-run.log` when present. Completion markers do not turn a simulation into live evidence.

## 3. Owner authority and live workers

- [ ] Follow the [owner field guide](owner-control-field-guide.md); verify actual network, contract addresses, owner and pausers.
- [ ] Preview only supported governance actions; use the actual pause script rather than report-generator subcommands.
- [ ] If a transaction was authorized, retain its receipt and re-query each relevant module. Do not assume instantaneous finality or UI refresh.
- [ ] For live work, collect the [commissioning evidence](computer-work.md#commissioning-evidence-required-for-real-use), including isolation, enforced limits, stop/recovery, independent review and settlement prerequisites.
- [ ] Reconcile unknown provider outcomes from durable journals. Do not retry by deleting a dispatch record.

## 4. CI, archive and decision

- [ ] Run the [targeted checks](ci-green-operations.md) and inspect the required checks for the exact PR commit.
- [ ] Archive only reviewed, non-secret evidence. For example, package the offline output separately from the full stack:
  ```bash
  tar -czf astral-offline-evidence.tar.gz reports/astral-omnidominion-operating-system-command-theatre
  ```
- [ ] Record what passed, what failed, what was skipped and what remains uncommissioned.
- [ ] Use precise status: “offline rehearsal passed” or “provider commissioning passed for these tasks.” Reserve production approval for the actual deployment and its evidence.

The $40T/year figure and catalog budgets remain planning assumptions. Document-length scores and generated diagrams are not production acceptance gates.
