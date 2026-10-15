# Cosmic flagship modes and evidence

The two launchers share the same safety boundary:

```bash
bash demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh
bash demo/cosmic-omni-sovereign-symphony/bin/orchestrate.sh --dry-run
```

Both commands print a plan using Bash builtins only. The default, `--dry-run`,
`--mode plan`, and standalone `--help` do not load `.env`, create logs, install
packages, spawn children, start nodes, or send transactions. `--ci` changes logging
only; it never opts into execution. Unknown, duplicate, missing, or conflicting
arguments fail before execution. Help cannot be combined with other flags.

## Explicit offline fixture

Provision the repository's locked dependencies separately, then run:

```bash
bash demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh --mode offline-fixture --ci
```

This mode writes synthetic governance records, runs the existing AGI OS offline
report-generation pipeline, and verifies the ledger, vote fixture, execution
plan, summary, mission bundle, control matrix, and grand summary. Synthetic votes
and pause/unpause entries are examples, not performed governance actions. Both
JSON evidence and the summary label this scope. AGI OS's mission and control
matrix are illustrative/configuration reports, not proof of economic settlement,
owner authority, production readiness, or real-world work.

There is no dependency installation or download fallback in either launcher.
The optional Mermaid rendering uses only the installed repository CLI. The
separate owner-parameter description can warn if configuration is incomplete;
the AGI OS control-matrix artifact is still required by the verifier.

The checked-in CI workflow installs locked dependencies in a separate, visible
step, runs inert mode/configuration tests, executes this explicit fixture mode,
and reruns the substantive artifact verifier. It does not claim local contract
or production qualification. `--ci --dry-run` alone is only a plan now.

## Explicit local governance rehearsal

```bash
bash demo/cosmic-omni-sovereign-symphony/bin/orchestrate.sh --mode local-rehearsal
# Or include the offline AGI OS report pipeline afterward:
bash demo/cosmic-omni-sovereign-symphony/bin/flagship-demo.sh --mode local-rehearsal
```

Requirements: Linux with readable `/proc`, Python 3, the installed locked Node
packages, and the existing Hardhat compiler cache containing Solidity 0.8.37 with
exact compiler identity `0.8.37+commit.f401782d` and matching Keccak checksum.
The checksum checks integrity against the trusted local cache index; it does not
independently authenticate that index or establish compiler provenance. The dedicated local config
retains the repository's Solidity optimizer (200 runs), via-IR, Cancun, and
storage-layout settings. A missing, incompatible, or checksum-mismatched compiler
fails closed. It never downloads or substitutes a different compiler.

This mode uses the shared Aurora repository/port lock and owned-node guard. It
only launches installed Hardhat at `http://127.0.0.1:8545`, chain 31337; `DEMO_PORT`
can select another port from 1024 through 65535. Any supplied RPC aliases must
match that exact loopback URL. A different chain or node engine is rejected.
The actual node startup inherits the dedicated local config, whose only networks
are in-process Hardhat and loopback localhost. No fork, external provider,
external signing keys, or arbitrary governance config/address override is used.

The launcher first checks the TypeScript scripts' CommonJS runtime
compatibility, then compiles and runs governance tests on in-process Hardhat.
The guard requires a newly owned listener, an unforked chain at block zero, and a
stable instance ID before execution. It rechecks ownership/identity before each
deploy, seed, voting, and ledger-export batch. Cleanup stops only its recorded
process group, with TERM/KILL deadlines. Completion is recorded only after
successful cleanup. A failed stage stops the pipeline.

All explicit launches enter an allowlisted environment. `.env` is neither sourced
by the shell nor loaded by the dedicated Hardhat configuration. The only inherited
operator context is the trusted installed-tool `PATH`, `HOME` for the compiler
cache, the validated demo port, and lock ownership metadata (which the lock helper
verifies against a live ancestor). npm is forced offline with user/global npm
configuration disabled. These controls assume trusted checkout/tool binaries and
shell startup; they are not an OS sandbox against a hostile operator or concurrent
process. Do not share the disposable RPC. See the shared
[guard limitations](../../aurora/bin/LOCAL-NODE-SAFETY.md).

## Runtime compatibility and remaining qualification boundary

The safety and runtime-compatibility changes have only inert private-fixture,
parser, configuration, loader, and artifact-verifier qualification. No real local
governance, Solidity compiler, provider, deployment, or AGI OS operational run was
performed for these changes.

`deploy-governance.ts` now uses the CommonJS runtime's own `__dirname`, matching
the other entrypoints and repository tsconfig. All four governance scripts pass
the nonexecuting launcher preflight and installed ts-node/CommonJS-wrapper
syntax checks. Inert tests execute the exact deployment/export script sources
with stubbed Hardhat, provider, and filesystem interfaces, checking unchanged
deployment inputs, serialized output, and failure propagation. The export
entrypoint is forwarded directly through installed ts-node with
`HARDHAT_NETWORK=localhost` so its `--output <path>` argument reaches the script.
Missing values, unknown flags, duplicate flags, and extra positional arguments
fail with usage information before filesystem or contract calls.

The bundled `config/multinational-governance.json` still has a 22-byte
`pauserRole`, 24/27-byte nation IDs, and an 18-byte mandate ID, while
`GlobalGovernanceCouncil` expects
`bytes32` for these fields. This is a separate input-schema blocker. The loader
tests deliberately preserve and forward the original values; they do not prove
ABI validity, pad identifiers, or reinterpret governance intent. A validated
fixture-schema repair and a full disposable deploy/seed/vote/export/cleanup run
remain necessary. Never skip a failed governance or export stage to qualify a
rehearsal. Neither forwarding nor stubbed tests establish an operational pass.

The flagship's AGI OS stage remains explicitly offline even when governance is
local. Its separate on-chain pipeline is outside this launcher's guarded scope.
No mainnet-ready, end-to-end local, UI, or production claim follows from these
fixture results.

## Review and cleanup

- Governance artifacts: `logs/ledger-latest.json`, `vote-simulation.json`,
  `execution-plan.json`, and `run-status.json` inside this demo.
- Flagship summary and verification: `logs/flagship-demo/`.
- Offline mission and control reports: repository-root `reports/agi-os/`.
- Run the verifier from the repository root:
  `node demo/cosmic-omni-sovereign-symphony/scripts/verify-flagship-report.mjs`.
  It requires a completed, explicitly labeled governance run and substantive
  report contents; pass means artifact consistency within the declared scope.
- Interrupt a local run with Ctrl+C. Never stop someone else's node to free a port.
  Private node diagnostics remain in a mode-0700 temporary directory. Never
  publish `node-private.log`; it may contain development keys. SIGKILL/OS failure
  cannot run cleanup traps.
- Original production scripts, contracts, designs, and dashboards remain separate.
  These launchers do not authorize or perform production rollout.

Run the inert regression suite without installing dependencies:

```bash
python3 test/simulation/test_cosmic_modes.py
node --test test/scripts/cosmic-local-config.test.cjs
bash -n demo/cosmic-omni-sovereign-symphony/bin/{flagship-demo,orchestrate,modes,execution}.sh
```

With the repository's locked TypeScript and ts-node dependencies already
installed, also run the inert loader/argument suite (CI requires it):

```bash
node --test test/scripts/cosmic-runtime.test.cjs
```
