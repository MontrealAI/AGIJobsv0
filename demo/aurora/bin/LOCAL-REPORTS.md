# Preserving launcher reports

## Exact report targets

`prepare-local-reports.cjs` supports only these targets:

- The Zenith Sapience, Celestial Archon, Omnidominion and Planetary OS local
  wrappers prepare `reports/localhost/<scope>`. Their original single-scope helper
  invocation remains supported.
- Those four nonlocal deterministic-kit wrappers use `--kit <scope>` to prepare
  `reports/<scope>`. They retain their actual branded `ASI_GLOBAL_PLAN_PATH`
  bindings and forward every command argument to `npm run demo:asi-global --`.
- Infinity Symphony prepares only `reports/localhost/infinity-symphony`.
  Its ASI Take-Off pipeline writes to that scope's `dry-run` child; receipts are
  copied from there into a fresh `receipts` child without deleting old evidence.
  It never uses the shared `reports/asi-takeoff` directory.

- Omnigenesis prepares only `reports/localhost/omnigenesis-global-symphony`.
  Default/help and `--plan` are inert; explicit `--rehearse` binds the selected
  scenario as report context to the shared TS pipeline and kit. The plan's jobs
  are not executed. See its [runbook](../../OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/RUNBOOK.md).

The four Zenith local wrappers accept an unset `NETWORK` (defaulting to
`localhost`) or the explicit value `localhost`. Other values, including an
explicit empty string, and positional arguments are rejected before report
preparation or execution. Their local mission-config semantics are unchanged;
these local wrappers do not execute their branded governance-kit project plans.

Infinity accepts only an unset or exact `NETWORK=localhost`, an unset or exact
`AURORA_REPORT_SCOPE=infinity-symphony`, and either no arguments or one `--ci`.
Invalid values fail before lock acquisition, report preparation, or npm execution.
A configured `ASI_TAKEOFF_REPORT_ROOT`, including an empty value, is rejected with
an instruction to unset it; an existing configuration is never silently ignored.
`ASI_TAKEOFF_PLAN_PATH` remains supported, defaults to the Infinity project plan,
and is passed to both the pipeline and the kit's real `--plan` option. Relative
paths resolve against the script's checkout, independent of the invoking cwd.
Missing plan files fail before report preparation. See the
[Infinity runbook](../../infinity-symphony/RUNBOOK.md).

## Archive and failure behavior

Before a new run, the helper checks every component from `reports` through the
exact target. A symlink (including a dangling link), file, or other non-directory
fails closed. Existing reports are renamed into a uniquely named sibling
`<scope>-previous-*/reports`; their bytes remain available. The next run receives
a fresh report directory. Nothing is recursively deleted. Repeated launches
create distinct archives, including archives of previous incomplete runs.

If execution later fails, retain both the new partial report and its archived
predecessor for diagnosis. A preserved report is not proof of a successful run.
These are ordinary local files, without a power-loss durability guarantee. The
checks assume a trusted local filesystem; they are not isolation against another
process racing directory changes. An archive may contain symlinks that were
already inside the old evidence directory; archiving renames the directory rather
than following those links.

## Locking and scope of protection

All ten supported wrappers acquire the existing repository and per-user port
advisory locks before preparation, and retain them through downstream execution.
They require Linux, Python 3, and readable `/proc`. The kit-only wrappers acquire
the same conservative locks even though they do not start a node themselves.
A busy lock fails before archival. Nested children verify the live ancestor's
locks, including when npm closes inherited descriptors. Never remove the lock
files while a supported launch is running.

The helper itself is not a lock manager; call it only while holding the wrapper's
lock. Other tools and direct downstream-script invocations that do not cooperate
with these locks are not serialized. Locking does not sandbox the pipeline,
validate an external RPC, approve a chain transaction, or constrain separately
configured downstream output overrides. See [local node safety](LOCAL-NODE-SAFETY.md)
for the distinct disposable-node lifecycle protections.

## Regression coverage

The mandatory `python_unit` CI job explicitly runs
`test/simulation/test_report_archive_launchers.py` and
`test/simulation/test_shared_plan_routing.py`; its ordinary `test/simulation`
collection also includes these tests and the existing local-wrapper regressions.
These suites use private temporary checkouts with inert npm substitutes and
forbidden-command guards. It covers invalid input, exact-target archive boundaries,
symlink/file parents, repeat and failed runs, lock ordering, inherited locks,
plan binding, argument boundaries, isolated Infinity output, and digest validity.
It does not run npm, a provider, a deployment, or a contract lifecycle, and does not
establish mission completion.
