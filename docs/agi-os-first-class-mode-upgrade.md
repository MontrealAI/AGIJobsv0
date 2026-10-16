# First-class launcher mode upgrade

The shared `scripts/v2/agiOsFirstClassDemo.ts`, its six branded shell callers,
and both Astral Python entry points now default to an **effect-free plan**.
This is an intentional compatibility change. Running an old command without
an execution mode no longer deploys, starts services, or produces evidence.

## Plan before execution

```bash
# Shell/Python planning does not require installed npm dependencies.
bash demo/astral-omnidominion-operating-system/bin/astral-omnidominion.sh
python demo/astral-omnidominion-operating-system/run_demo.py --help
bash demo/meta-agentic-alpha-agi/bin/launch.sh --dry-run

# The direct TypeScript/npm entry needs its existing toolchain to load, but
# does not invoke child commands or read runtime configuration in plan mode.
npm run demo:agi-os:first-class -- --mode plan --network sepolia --no-compose
```

A plan is descriptive, not a preflight or an operational qualification. It
creates no reports, loads no environment file, probes no RPC, and invokes no
package manager, Docker, or deployment. The shell and Python wrappers render
help and plans themselves, before runtime dependencies are needed. No wrapper
installs dependencies automatically.

`--dry-run` is an exact alias for `--mode plan`. Values such as
`--dry-run=false` and combinations with `--mode` are rejected. It never
forwards a purported dry-run flag into an operational deployment wizard.

## Explicit execution contract

After separately reviewing dependencies, configuration, endpoints, ownership,
signing authority and effects, an operator can select execution:

```bash
npm run demo:agi-os:first-class -- --mode execute --network localhost --yes --compose
# An already prepared runtime, without Compose startup:
npm run demo:agi-os:first-class -- --mode execute --network localhost --yes --no-compose
# Skip only the first-class wizard, still run the fixture and owner commands:
npm run demo:agi-os:first-class -- --mode execute --network localhost --yes --no-compose --skip-deploy
```

Every execution requires all of:

- `--mode execute`
- An explicit `--network localhost` or `--network sepolia`
- Exactly one of `--compose` or `--no-compose`
- Explicit `--yes`

`--yes` approves this selected operational pipeline; it is not a plan flag.
Execution may sign transactions, launch services, create/copy configuration,
and replace reports. `--skip-deploy` skips only the first-class wizard and
cannot be combined with `--compose`. It is not an offline mode. The separate
Meta-Agentic and Alpha-Meta compound launchers reject it because their later
local replay also deploys.

`--non-interactive` remains recognized but supplies no consent. Neither CI,
non-TTY input nor `ASTRAL_OS_AUTO` supplies approval or a network. Legacy
`--auto`, `--auto-yes`, `interactive`, arbitrary positional arguments,
`--option=value`, duplicate switches and conflicting choices fail before
runtime effects. Help (`-h`, `-?`, `--help`) must be used alone. In particular,
`--stage commit-reveal` was never implemented by this launcher and now fails
explicitly instead of silently running the whole pipeline.

Missing Docker fails an explicit `--compose` request. With `--no-compose`,
Docker absence says nothing about an operator-managed RPC: it no longer causes
an automatic deployment skip or a misleading partial-success result. Runtime
failures stop the pipeline; no network is silently substituted.

## Distinct stages and evidence boundaries

The shared execution pipeline contains different environments:

1. The deployment wizard targets the explicitly selected localhost or Sepolia.
2. The bundled AGI OS / ASI take-off mission rehearsal runs on in-memory
   **Hardhat**, pinned explicitly regardless of the selected deployment.
3. The outer owner diagram and owner-control verification target the selected
   localhost or Sepolia via `HARDHAT_NETWORK`.
4. Reporting and manifests package these different results and perform internal
   consistency checks. They do not turn synthetic fixture results into
   deployment verification.

Prior current run/manifest files are moved into a unique `first-class/previous-run-*`
history directory when explicit execution begins. Failed stages leave no current
manifest. The final current run report is written before it is hashed; the
manifest excludes itself and is atomically published only after a complete write.
A run report without its finalized manifest is an incomplete bundle.

The first-class run report and manifest now include an `evidenceBoundary`
object naming these targets and limitations. Console stage labels and the
completion message state the same boundary. **Sepolia execution is retained
as a source path, not qualified by this change or its inert tests.** Any
operational verification needs separately reviewed receipts/configuration and
matching network evidence. Neither a plan, a fixture pass nor an internal
report consistency pass establishes production readiness.

## Branded caller compatibility

All shell callers share the same guard before root resolution or subprocesses:

- `demo/imperatrix-celestia-operating-system/bin/launch.sh`
- `demo/astral-omnidominion-operating-system/bin/astral-omnidominion.sh`
- `demo/cosmic-omniversal-grand-symphony/bin/grand-symphony.sh`
- `demo/omni-sovereign-ascension-operating-system/bin/launch.sh`
- `demo/meta-agentic-alpha-agi/bin/launch.sh`
- `demo/alpha-meta/bin/launch.sh`

The first four forward a valid explicit invocation unchanged. Imperatrix no
longer installs dependencies or injects localhost/Compose/approval defaults.
Omni-Sovereign no longer starts an extra wizard before processing arguments.
Astral and Cosmic resolve the repository root three levels above `bin`, also
when invoked from an unrelated working directory containing spaces.

Meta-Agentic and Alpha-Meta require **localhost** for their compound workflows;
Sepolia is rejected rather than followed by a different local deployment.
They preserve their `ASI_TAKEOFF_PLAN_PATH` exports for the first-class
synthetic take-off stage. The later `demo:asi-takeoff:local` stage does not read
that variable: it explicitly uses the existing shared
`demo/asi-takeoff/config/mission@v2.json` fixture. No branded plan conversion is
claimed or implemented. Alpha-Meta retains its separate dossier/triangulation
stage before that local replay; a failure stops the sequence.

Both Astral Python entry points retain `run` with injected runner/interactive
parameters and `build_command`. They validate arguments before constructing
commands, do not call runners in plan/help/error paths, ignore terminal state
for consent, and forward valid execute arguments unchanged. The interactive
probe argument is retained only for API compatibility.

## Verification scope

Mandatory CI runs `test/scripts/first-class-modes.test.cjs` in the required
lint/static-check job and `test/simulation/test_first_class_python_safety.py`
in the required Python unit job. The former loads TypeScript into a VM with
stubbed filesystem/process interfaces and runs copied shell sources with a
stub-only PATH; the latter uses injected runners. They cover malformed flags,
no-effect paths, exact argv/cwd, selected routing, separate evidence labels,
missing dependencies/Docker, and failure propagation.

These checks do not install dependencies, contact RPCs, run Docker, deploy,
sign, or establish operational qualification. Original mission plans and
model/contract implementations are unchanged.
