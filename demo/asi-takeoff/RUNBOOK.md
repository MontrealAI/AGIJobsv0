# ASI Takeoff operator runbook

Start with the [local studio and acceptance exercise](README.md). The paths below retain the original contract and reporting capabilities while making their outputs and execution boundaries explicit.

## 1. Prepare the pinned toolchain

Follow [the root setup](../../docs/START_HERE.md#reproduce-the-local-baseline). Use locked dependencies, not `npm install` or an unpinned `foundryup` upgrade. Node-only planning and studio commands do not require dependency installation. Full contract runs do.

Default local fixtures need no personal wallet. Do not overwrite an existing `.env` or copy production keys into the demo. `env.example` documents optional variables; select only the values needed for this rehearsal. The local launcher rejects non-loopback RPCs and conflicting chain settings and uses chain ID 31337.

## 2. Run the retained three-job local chain

```bash
npm run demo:asi-takeoff:local
```

The launcher compiles incrementally with one compiler job, starts its own loopback Anvil/Hardhat node, deploys v2 defaults, and runs `demo/aurora/aurora.demo.ts` with `demo/asi-takeoff/config/mission@v2.json`. It checks final job states, independently reconciles receipt accounting, renders the report and stops its node. The jobs cover agriculture, infrastructure and healthcare with configured results and mock-token transactions. No model provider or real-world project is executed.

If another service occupies port 8545:

```bash
DEMO_PORT=18545 npm run demo:asi-takeoff:local
```

Existing nodes are left running. Ctrl+C stops only the node owned by the launcher. Remove conflicting exported RPC/chain variables rather than directing the rehearsal to another chain. Inspect the printed node log after startup failures. An interrupted chain is disposable; retain its receipts as incomplete evidence and run a new namespace instead of attempting to resume against stale addresses.

### Inspect and bundle the actual local receipts

Under `reports/localhost/asi-takeoff/`:

| File | Meaning |
| --- | --- |
| `receipts/deploy.json` | Disposable deployment addresses |
| `receipts/mission.json` | Local mission summary |
| `receipts/jobs/<slug>/` | Post, submit, commit/reveal, validation, finalization and balance evidence |
| `receipts/stake.json` | Local staking acknowledgements |
| `receipts/governance.json` | Recorded owner drills |
| `asi-takeoff-report.md` | Human-readable mission report |

The report can be rebuilt after the node stops:

```bash
npm run demo:asi-takeoff:report
npm run demo:asi-takeoff:kit -- --report-root reports/localhost/asi-takeoff --local-receipts reports/localhost/asi-takeoff/receipts --summary-md reports/localhost/asi-takeoff/asi-takeoff-report.md --network localhost
```

Local-receipts mode defaults to the three-job `config/mission@v2.json`, not the separate rail plan. For a custom mission, supply its exact `--plan` file. The kit hashes deployment, mission, stake and governance files and optional summary bytes. Its directory listing does not recursively hash every receipt, and the kit does not independently query chain state or certify settlement. Preserve the full receipt tree and the commissioning-check output.

## 3. Run the governance report pipeline

```bash
npm run demo:asi-takeoff
```

This distinct pipeline regenerates constants, compiles, runs `testnetDryRun.ts`, creates thermodynamic and owner-control reports, checks owner wiring and packages a governance kit. Report steps use separately bootstrapped Hardhat fixtures. Their addresses should not be interpreted as one persistent deployment shared with the local launcher. The national rail plan supplies summary context; its five planned jobs are not dispatched.

Outputs under `reports/asi-takeoff/` are `dry-run.json`, `thermodynamics.json`, `mission-control.md`, `summary.md`, `summary.json`, `mission-bundle/`, `logs/`, `governance-kit.{json,md}` and `run-status.json`. Bootstrap steps can also write local `.hardhat.json` configuration overlays; inspect them before reusing local owner commands. Never copy these addresses to a live deployment.

For planetary context, use the pipeline's actual override and a separate output directory:

```bash
ASI_TAKEOFF_PLAN_PATH=demo/asi-takeoff/project-plan.planetary.json ASI_TAKEOFF_REPORT_ROOT=reports/asi-takeoff-planetary npm run demo:asi-takeoff
```

The output filenames stay the same within that directory. This override does **not** alter `demo:asi-takeoff:local`. The plan's historical `reporting.artifacts` paths are scenario metadata, not routing instructions honored by the pipeline.

### Offline fixture mode

```bash
AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true ASI_TAKEOFF_REPORT_ROOT=reports/asi-takeoff-offline npm run demo:asi-takeoff
```

This mode writes explicitly labeled fixtures. The dry-run status is `simulated`; its scenario is `not-run`. No ownership checks, chain transactions or provider work occur. A generated kit remains offline evidence and has `productionApproved: false`. Use a different report directory for each run. A missing/running `run-status.json` means the run did not complete; old files may coexist after a failure and must not be taken as fresh results.

## 4. Owner control and validator oversight

The local launcher stops its node when it exits. Its saved addresses cannot be used for RPC commands against an unrelated new node. Advanced owner previews require a separately managed local deployment with actual configuration overlays and a running RPC.

```bash
HARDHAT_NETWORK=localhost npm run owner:verify-control
HARDHAT_NETWORK=localhost npm run pause:test
HARDHAT_NETWORK=localhost npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/updateThermodynamics.ts
```

`pause:test` inspects wiring and uses static calls; it does not broadcast a pause. Thermodynamics defaults to a preview. Adding `--execute` to the direct `ts-node` invocation broadcasts transactions and requires separately recorded authorization, the correct signer and reviewed parameters. Hardhat's `run` command does not forward arbitrary `--execute` script arguments. The kit uses the correct invocation.

The owner command center and dashboard remain available (`npm run owner:command-center -- --network localhost`, `npm run owner:dashboard -- --network localhost`) after their actual deployed module configuration is prepared. A saved `AURORA_DEPLOY_OUTPUT` file alone does not re-create a running chain or automatically populate every owner script's configuration.

The mission receipts include validator selections and commit/reveal evidence. Reproduce a full lifecycle on a fresh local chain using the launcher. Do not replay commit/reveal commands with arbitrary salts or old job IDs from a stopped chain. Commission durable reveal-secret handling and independent evaluation for live computer-work validation; the generic structural evaluator intentionally abstains.

## 5. Optional Python and Make launchers

The Python wrapper is optional. In a virtual environment:

```bash
python -m pip install -r demo/asi-takeoff/requirements-cli.txt
python demo/asi-takeoff/run_demo.py check
python demo/asi-takeoff/run_demo.py run --help
```

`check` verifies basic prerequisites/assets, not production readiness or a complete compiler install. `run` accepts only `--network localhost`. Relative input/output paths are resolved before the shell changes directories. Namespaces cannot contain path separators. The existing Make commands work from either location:

```bash
make -C demo/asi-takeoff local
make -f demo/asi-takeoff/Makefile report
```

## 6. Extend, recover and commission

- Change `config/mission@v2.json` and its specs for local contract jobs. Rewards/stakes retain their original units; validate against the actual token and contract limits.
- Change the project plans for planning/context. Validate both budgets and dependencies with `demo:asi-takeoff:plan`; clarify deadline semantics before treating them as schedules.
- Retune `config/asi-takeoff.thermostat@v2.json` only as a reviewed local fixture. It does not prove economic outcomes.
- Admit new computer-work tasks using the [protected worker procedure](../../docs/computer-work.md#commission-a-real-worker). Do not infer acceptance from provider completion or tool access. Retain original receipts/journals after interruption; reconcile actual effects before another dispatch.
- Preserve reports when comparing runs. Use a new `AURORA_REPORT_SCOPE` for local jobs or `ASI_TAKEOFF_REPORT_ROOT` for the pipeline. Archive completed evidence before any intentional cleanup.

Production commissioning requires task-specific evaluation, actual access/identity/authority verification, secure worker configuration, interruption tests, durable journals, audited deployment changes, contract receipts and finality. This repository rehearsal does not itself provide those live approvals.
