# Individual demo experience validation — 2026-10-04

This change makes all 76 repository catalog entries independently understandable
on the Demo Observatory. It adds curated explanations and exact-source inspection;
it does not certify all proposed systems as commissioned production services.

## Content and preservation

- Every entry has a question, purpose, three source-backed steps, expected result,
  experiment, troubleshooting, verification links and a related implementation
  where relevant.
- Every tracked demo Markdown document and standalone Mermaid file is published:
  300 guides/diagram documents including the existing root and setup guides,
  containing 244 Mermaid diagrams. Existing routes and original files remain intact.
- Source downloads are tested byte-for-byte against the repository. Inspectors
  are read-only and explicitly label their source revision and historical examples.
- The nested Superintelligent Empowerment guide is now recognized as a runnable
  documented demo, while import aliases and design-only entries remain distinct.

## Executed local recipes

The following selected commands from `website/demo-experiences.json` were executed
successfully with Python 3.12 and the prepared isolated demo dependency environment.
Outputs were written to the explicit temporary paths shown in the recipes. This
list establishes the selected CLI behavior, not every alternative implementation
or external integration in the same directory.

| Demo                         | Observed check                                           |
| ---------------------------- | -------------------------------------------------------- |
| Absolute Zero Reasoner       | Bounded reasoning loop and JSON export                   |
| AlphaEvolve                  | Seeded evolutionary run and report export                |
| Open-Endedness               | Uniform, learning-progress and OMNI comparison artifacts |
| Day-One Utility Benchmark    | Strategy scoreboard and dashboard generation             |
| Huxley–Gödel Machine         | Seeded comparison artifacts and UI export                |
| Validator Constellation      | Committee simulation and JSON summary                    |
| Superintelligent Empowerment | YAML-driven impact narrative and JSON export             |
| AGI Governance               | Mission-derived JSON metrics                             |
| Astral Citadel               | JSON and Markdown readiness packet                       |
| Astral Command Theatre       | Document coverage and heuristic-score report             |
| Phase 8                      | Manifest/address checks and telemetry JSON               |
| AGI Labor Market             | Bundled transcript summary                               |
| AGI Alpha Node               | Non-interactive local status snapshot                    |
| Planetary Fabric             | 100-job seeded restart scenario; completion rate 1.0     |
| MuZero-style Planning        | Configured smoke-tests subcommand                        |
| Tiny Recursive Model         | Explain command and 24-trial, seed-7 simulation          |

The command audit corrected `summary` to `summarize` for the labor-market CLI and
`smoke` to `smoke-tests` for MuZero before publication. Dependency errors in an
unprepared system Python were resolved by using the existing isolated environment;
no model runtime or system Python packages were replaced.

## Release verification

`npm run site:test` checks route integrity, source preservation, exact downloads,
complete experience coverage, field inspection and HTML sanitization. `npm run
site:qa` exercises interactions, all 76 mobile experience pages, accessibility,
no-JavaScript fallbacks and all 244 rendered diagrams. GitHub Actions publishes
only after its Pages build and QA job passes, then checks the exact live revision.

The existing production signing, provider integration, independent security review
and target-network commissioning requirements remain real gates. A design page,
source inspector, historical report or successful simulation cannot replace them.
