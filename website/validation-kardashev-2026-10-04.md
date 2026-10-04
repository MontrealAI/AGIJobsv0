# Kardashev II demo validation — 2026-10-04

This record covers the base Kardashev II demo, Stellar Civilization Lattice,
K2 Stellar, the legacy Python/Node export, and their public command decks.
The inputs remain dated fixtures; regeneration does not turn them into current
provider observations. No authentic signatures, payments or commissioning were
performed.

## Corrections

- Model readiness now fails for critical/high invariant failures even when a
  failing scenario has been regenerated. `--check` compares artifacts without
  creating or modifying output files.
- Input validation rejects dangling references, duplicate identifiers, task
  dependency cycles, invalid dates, non-finite values and inverted thermostat
  bounds. Stellar corridor references now use registered federation identifiers.
- Energy reconciliation distinguishes available capacity from regional demand.
  Spare planned capacity is not invented consumption or reconciliation drift.
  The reserve, thermostat and baseline capacity requirements remain checked.
- CLI options reject typos and missing values; experiment configuration and
  output directories resolve from the working directory. The local server binds
  to loopback, contains resolved paths and symlinks, and never silently switches
  to a different model after a generator failure.
- All three dashboards and their standalone exports use local pinned Mermaid,
  strict rendering, escaped interpolations, visible load failures, responsive
  layouts and explicit simulation labels. The undefined runway text variable
  and legacy Gantt display syntax are corrected.
- Operator guides explain setup, units, expected warnings, isolated experiments,
  artifact hashes and troubleshooting. Operational claims now distinguish
  configured assumptions, encoded proposals and genuine external evidence.

## Executed checks

| Check | Result |
| --- | --- |
| Generate and run `demo:kardashev-ii:ci` | Passed |
| Generate and run `demo:kardashev-ii-lattice:ci` | Passed |
| Generate and run `demo:kardashev-ii-stellar:ci` | Passed |
| `node --test demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/tests/runtime.test.cjs` | 7 passed, including a regenerated failing model and read-only check |
| Python `tests/test_run_demo.py` | 16 passed |
| Demo `scripts/browser-qa.mjs` | Six command decks plus the generated legacy export loaded and rendered |
| Accessibility and layout | Zero automated WCAG A/AA violations on six decks; no overflow at 320, 390 and 768 px |
| Browser integrity | No external requests or page errors on six decks; injected HTML remained literal text |
| `npm run site:test` | 10 passed |
| `npm run site:qa` | 19 checks; all 250 published diagrams rendered, including six published command decks |
| `npm run demos -- --check` | 76 directories and 169 registered commands |
| `npm run format:check` | Passed |

The six original README flowcharts were compared byte-for-byte with the base
revision and preserved. No existing file was deleted. The site now publishes
304 guide/diagram documents; added offline exports account for the additional
guide and diagram copies.

Local checks used Node 22.23.3, npm 10.8.2, Python 3.12 and Chromium. The local
environment could not download headers for a native dependency, so locked npm
dependencies were installed with lifecycle scripts disabled for these demo/site
checks. GitHub Actions must independently pass its normal dependency install
and repository gates for the exact PR revision before merge.

## Evidence boundaries

The base model retains five advisory warnings across eleven stress scenarios.
Passing readiness does not mean every heuristic is nominal. Model scores,
synthetic economic assumptions, proposal hashes and configured bridge latency
are not evidence of live infrastructure, authenticated approval, independent
security certification or successful target-network deployment.

Reproduce the checks from the repository root using its pinned toolchain and
lockfile. Browser reports are generated under `reports/kardashev/` and
`reports/pages/`; CI reruns the model, runtime and browser checks before release.
