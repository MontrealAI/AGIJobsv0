# Infinity Symphony Runbook — Local Report Harness

The launcher combines the ASI Take-Off pipeline, its governance kit, an AURORA
report, and owner reports. Its supported network selector is `localhost` only.
The launcher does not create or verify a disposable RPC node itself; downstream
commands retain their own execution requirements. A local network selector or a
report bundle is not evidence of production readiness or completed settlement.

## 1. Preconditions and inputs

- Use the repository's installed toolchain and downstream pipeline prerequisites.
  The report lock requires Linux, Python 3, and readable `/proc`.
- Leave `NETWORK` unset or set it to exactly `localhost`.
- Leave `AURORA_REPORT_SCOPE` unset or set it to exactly `infinity-symphony`.
- Unset `ASI_TAKEOFF_REPORT_ROOT`. The launcher rejects any configured value,
  including an empty value, and isolates pipeline output inside its own scope.
- Optionally set `ASI_TAKEOFF_PLAN_PATH` to an existing reviewed project-plan JSON.
  The default is `demo/infinity-symphony/project-plan.json`. Relative paths resolve
  against this checkout, and paths containing spaces are supported.
- `AURORA_MISSION_CONFIG`, `AURORA_THERMOSTAT_CONFIG`, and `AURORA_REPORT_TITLE`
  retain their existing overrides. Their defaults are the Infinity mission and
  thermostat files and the Infinity report title. These are separate from the
  ASI Take-Off project plan.

The [environment example](env.example) shows the fixed network and scope. Do not
replace the local network with a mainnet or testnet name. Review downstream
credentials, RPC configuration, and execution mode separately before running.

## 2. Run the supported launcher

From the repository root:

```bash
unset ASI_TAKEOFF_REPORT_ROOT
NETWORK=localhost bash demo/infinity-symphony/bin/infinity-symphony-local.sh
```

The script also works when invoked by its absolute path from another directory;
it always uses its own checkout. To add the owner wiring verification command:

```bash
NETWORK=localhost bash demo/infinity-symphony/bin/infinity-symphony-local.sh --ci
```

No other arguments, repeated `--ci` flags, custom report scopes, or non-local
network values are supported. Invalid selections and missing plan files fail
before locks or report preparation. `--ci` adds `owner:verify-control`; it does not
convert downstream execution into an offline simulation or grant permission to
broadcast transactions.

The selected project plan is supplied through `ASI_TAKEOFF_PLAN_PATH` to the
pipeline and through `--plan` to the separate governance-kit command. The kit does
not infer that selection from the pipeline's environment variable.

## 3. Inspect the evidence

Current evidence lives under `reports/localhost/infinity-symphony`:

- `dry-run/`: the isolated ASI Take-Off output, kit, and `SHA256SUMS` when `shasum`
  is available. The digest excludes itself and covers the pipeline/kit files at
  the time it is generated.
- `receipts/`: a copy of that run's pipeline/kit files, including hidden files.
- `infinity-symphony-report.md`: the AURORA report produced by the downstream
  renderer. Check which receipts actually exist before interpreting its content.
- `governance/`: atlas, command center, mission control, control diagram, parameter
  matrix, and thermodynamics outputs produced by their respective commands.

The shared `reports/asi-takeoff` directory is neither used nor cleaned by this
launcher. The pipeline's own mode and status reports determine whether evidence
is simulated, partial, or a completed local rehearsal. A successful wrapper exit
means its commands returned successfully; it is not an independent contract or
production verification.

## 4. Repeat runs and failures

Before any pipeline command, the entire existing Infinity scope is renamed to a
unique `reports/localhost/infinity-symphony-previous-*/reports` directory. The new
run receives a fresh scope. Existing evidence is never erased with recursive
cleanup or delete-mode mirroring, and unrelated report scopes remain untouched.

If a command fails, the launcher stops and preserves both the archived predecessor
and the new partial output. Do not publish partial output as a completed mission.
The repository and per-user port advisory locks are held through the entire run;
a competing supported launcher fails before archival.

Symlink, dangling-link, and non-directory report path components are refused.
These checks require a trusted local filesystem and do not protect against
uncooperative concurrent directory changes or guarantee power-loss durability.
Do not remove lock files while a run is active. The complete archive and advisory
lock contract is documented in [launcher report safety](../aurora/bin/LOCAL-REPORTS.md).

## 5. Source-safety regressions

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest --confcutdir=test/simulation \
  test/simulation/test_report_archive_launchers.py \
  test/simulation/test_zenith_local_wrappers.py
```

These tests use private temporary fixtures and inert downstream substitutes.
They verify launcher safety and bindings without npm execution, RPC calls,
deployments, or live-provider activity. They do not establish mission completion.
