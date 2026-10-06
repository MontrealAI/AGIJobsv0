# OmniSovereign operator runbook

Use the offline path first. The browser and terminal quickstart perform deterministic synthetic analysis only. Keep real provider dispatch and contract administration as explicit, separately commissioned operations.

## 1. Start the complete rehearsal

Use the [pinned Node version](../../.nvmrc), then run from the repository root:

```bash
npm run demo:omnisovereign
npm run demo:omnisovereign:serve
```

Open `http://127.0.0.1:4190/`. The terminal prints the unique output directory. Each run has six JSON artifacts, six task contracts, source, report, review and evidence. For a named output, use a **new** directory:

```bash
npm run demo:omnisovereign -- /absolute/path/to/new-run
```

An existing target is rejected. Do not mix files from different runs. The final `evidence.json` is the completion marker; inspect it with the independent reviewer. Review validates embedded artifacts, not sibling copies. The viewer binds loopback, checks Host/Origin, denies cross-site browser requests and serves only public demo assets. It has no write, dispatch or signing API. `PORT=4191` changes the viewer port, but exported tasks still pin 4190; changing the allowed origin requires a separately reviewed task and evaluator.

## 2. Inspect and export the acceptance contract

```bash
node demo/omnisovereign/cli.mjs stages
node demo/omnisovereign/cli.mjs inspect SOV-THERMO-ALIGN
npm run demo:omnisovereign:task -- SOV-THERMO-ALIGN > energy.task.json
node demo/omnisovereign/cli.mjs review /absolute/path/to/evidence.json
```

Every work order contains the exact synthetic source, a canonical source hash, permitted origin, output contract and review criteria. Use the stage ID printed by `stages`. The six coordination analyses preserve the original dependency graph but do not execute the underlying customer briefs or governance actions.

The expected baseline is 23,500.000000 USDC of planned rewards, 16,500.000000 USDC of unallocated reserve, a -60 MWh synthetic balance and three review-deferred briefs. `accepted: true` means artifact checks passed; production and settlement approval remain false.

## 3. Commission authorized computer work

Follow the root [computer-work commissioning procedure](../../docs/computer-work.md#commission-a-real-worker). Install locked dependencies with `npm ci` for adapter execution. Use a dedicated standard compute account, isolated workspace/desktop, approved browser/file/code/computer tools, and public non-personal, licensed or synthetic inputs. Keep wallet keys, settlement signing and unrelated application access outside the worker. Record exact provider, model, OpenClaw and OS versions and actual desktop permissions. The repository’s pinned Node runtime is for this repository; install the gateway with its own documented runtime requirements.

OpenClaw's enabled `/v1/responses` endpoint must point at the commissioned agent. Protect bearer credentials as privileged runtime access; prompts do not enforce isolation. Enforce site/action/tool restrictions, time and cost budgets, stop controls and artifact limits in the actual worker. The shipped profile has empty `approvedJobs` and is deliberately unable to dispatch.

1. Copy [worker-profiles.example.json](worker-profiles.example.json) to an operator-owned configuration path outside the public site. Replace the endpoint, agent and deployment identity with verified values. Use a unique deployment identity binding the intended chain/contract or explicitly identified isolated commissioning environment.
2. Keep `COMPUTER_WORK_PROFILES_FILE` and `COMPUTER_WORK_STATE_DIR` absolute. The state directory must be persistent and shared by all dispatchers for that profile. Protect it from worker modification. Supply `COMPUTER_WORK_OMNISOVEREIGN_TOKEN` through the operator's secret mechanism; never commit it, place it in a URL or paste it into the website.
3. Inspect the exact normalized task digest:

   ```bash
   npm run demo:omnisovereign:worker -- inspect SOV-THERMO-ALIGN
   ```

4. After reviewing scope and evaluator suitability, add the specific positive-decimal job ID and exact `taskSha256` to `approvedJobs`. Admission is not a claim that the job is registered, funded or settleable on chain. Verify those conditions separately.
5. Only then explicitly dispatch the admitted task:

   ```bash
   npm run demo:omnisovereign:worker -- run SOV-THERMO-ALIGN 73 > candidate-receipt.json
   ```

This command can perform real actions and incur provider cost. It is never invoked by the quickstart or website. `73` is an example; use the job ID actually admitted. The adapter verifies job/task admission before network access and writes an exclusive durable journal record before dispatch. It refuses a second dispatch of the same deployment/profile/job.

For ChatGPT Work, provide the downloaded task in an operator-led session, use approved apps, and ask for the exact candidate JSON file. Check a raw candidate file from an operator-led session with:

```bash
node demo/omnisovereign/cli.mjs review-artifact SOV-THERMO-ALIGN /absolute/path/to/energy-analysis.json
```

The website also offers **Candidate JSON for selected stage**. This computes a hash of the supplied bytes and checks their substance; it does not claim adapter/job binding or provider provenance. The Work interface is not treated as a remote provider endpoint or as authority to sign transactions. The current checker is task-specific; arbitrary new workflows need their own commissioned acceptance tests.

## 4. Review real adapter receipts

Use the expected job and deployment from the protected admission record, independently of the receipt being reviewed:

```bash
node demo/omnisovereign/cli.mjs review-receipt SOV-THERMO-ALIGN /absolute/path/to/candidate-receipt.json 73 your-verified-deployment-id
```

The checker verifies the exact task, job/deployment binding, evidence status, expected artifact, UTF-8 size, SHA-256 and independently calculated content. The website supports the same check after selecting the stage and entering expected admission values. Inputs are capped at 1 MiB. `declaredWorkerMode` reports the receipt's fixture/live declaration, while `providerExecution` remains `not assessed`.

An attacker can fabricate an unsigned receipt. Reconcile attempt ID, task digest, job/deployment identity, response ID and artifact hashes with the protected journal and actual application effects. Obtain independent substantive review by someone other than the creator before the authorized validation, dispute and settlement lifecycle. AGI Jobs identity eligibility, stake, tax acknowledgement, selected token, contract wiring and finality remain separate gates. Use the deployed system's verified agent/validator roots; legacy plan handles are illustrative.

If a run is interrupted or reports an unknown outcome, preserve its journal. Inspect the worker and actual effects before any further attempt. Do not delete the journal, change the deployment identity to evade replay protection, or automatically retry. Reconcile with the documented operator recovery procedure and use a separately admitted correction where appropriate.

## 5. Retained national and planetary drills

These commands remain available after the [full root toolchain setup](../../docs/START_HERE.md#reproduce-the-local-baseline). They use disposable local fixture accounts; do not export personal private keys or overwrite `.env` for the offline quickstart.

```bash
npm run demo:asi-takeoff:local
npm run demo:asi-global:local
```

Inspect `reports/localhost/asi-takeoff/receipts/` and `reports/localhost/asi-global/receipts/`, plus each scope's Markdown report. The launchers stop only their own local node. Use `DEMO_PORT=18545` if 8545 is occupied and preserve any existing node. These local mock-token transactions are distinct from both the USDC planning exercise and actual paid computer work.

Build the national kit from actual local receipts:

```bash
npm run demo:asi-takeoff:kit -- --report-root reports/localhost/asi-takeoff --local-receipts reports/localhost/asi-takeoff/receipts --summary-md reports/localhost/asi-takeoff/asi-takeoff-report.md --network localhost
```

The broader governance/report pipelines also remain available:

```bash
npm run demo:asi-takeoff
npm run demo:asi-global
```

Their scenario plans and reporting namespaces do not turn the six OmniSovereign stage descriptions into executed contract jobs. Keep each run's source plan, receipt set and status marker together. Hash-indexed governance kits establish artifact integrity, not acceptance of their claims. See the [national guide](../asi-takeoff/README.md) and [planetary guide](../asi-global/README.md) for current semantics and outputs.

## 6. Owner controls, incentives and validator oversight

The original operator pathways remain part of the repository. They require an explicitly configured, running test deployment; the automatically stopped local node is not available for later owner queries. Verify the RPC, chain ID, deployed addresses and effective signer before any administrative operation.

| Retained pathway | Operating boundary |
| --- | --- |
| `owner:command-center`, `owner:mission-control`, `owner:parameters`, `owner:dashboard`, `owner:diagram` | Inspect the configured test deployment using the root operator runbook. Receipt archives alone are not a live RPC. |
| `pause:test` | A deliberate pause-authority drill against the intended test deployment; not part of the synthetic quickstart. |
| `thermodynamics:report` | Reports configured/on-chain thermodynamics. It does not accept the old runbook's `--plan` / `--report-root` planning contract. Use its documented environment/CLI options. |
| `thermostat:update`, `reward-engine:update` | Administrative planning/update tools. Review current parameters and explicit execution options before using the authorized signer. |
| Commit/reveal and validator receipts | Already exercised by the retained local-chain launchers. Reconcile selected committees and final job state; do not infer validity from filenames alone. |

See [OperatorRunbook.md](../../OperatorRunbook.md), the root [RUNBOOK](../../RUNBOOK.md), and the actual [thermodynamics reporter](../../scripts/v2/thermodynamicsReport.ts). Never interpret conceptual thermostat values, placeholder addresses or the source plan's energy budgets as physical control authority.

## 7. Qualification, evidence retention and shutdown

```bash
npm run demo:omnisovereign:test
npm run demo:omnisovereign:qa
```

CI runs all stage computations, negative evidence checks, adapter fixture dispatches, replay tests and browser checks. Each synthetic run uses a fresh output directory. Keep source, evidence and review together; archive before retiring old runs. Ctrl+C stops the read-only viewer. Do not delete active worker journals during cleanup.

Before live production, qualify actual worker/model versions, lawful input rights, host/tool isolation, prompt-injection resistance, spending and duration limits, abort/unknown-outcome recovery, unrelated reviewer capacity, identity/contract/token configuration, signer separation, disputes and settlement finality. A successful synthetic rehearsal does not replace those deployment-specific gates.
