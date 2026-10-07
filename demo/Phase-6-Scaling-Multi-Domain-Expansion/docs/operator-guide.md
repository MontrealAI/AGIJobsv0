# Phase 6 operator guide

Start with the [command center](https://montrealai.github.io/AGIJobsv0/experiments/phase6/) or the [offline rehearsal](../README.md#working-with-this-module). Neither needs credentials. Keep the original five domain examples as a reference, and make a separate configuration for your deployment.

## What each result establishes

| Result | What it establishes | What still needs independent evidence |
| --- | --- | --- |
| Configuration validation | Checked types, ranges, identifiers and required demo structure | Correct addresses, lawful access, real infrastructure and actual operating capacity |
| Blueprint and configuration hash | The configured proposal and its deterministic identifier | Authentic publisher, deployed state or permission to execute |
| DID coverage report | Declared requirements and referenced issuers/verifiers | Signature validity, issuer trust, credential ownership, expiration and revocation |
| IoT event proposal | A rule-based routing recommendation from supplied inputs | Authentic sensor data, an eligible commissioned worker and task authorization |
| Browser capacity plan | Arithmetic under your entered assumptions | Real throughput, service reliability, acceptance rate and customer demand |
| Mined governance transaction | A state change on the selected chain | Working off-chain connectors, completed jobs or safe remote execution |
| Worker receipt | Candidate artifacts and execution metadata | Independent acceptance, buyer usefulness and finalized settlement |

The example configuration deliberately contains synthetic metrics, placeholder deployments and descriptive credentials. Do not apply it to a real network. `Phase6ExpansionManager` stores governance-controlled metadata and forwards authorized control calls; it does not make a configured service operate or prove its claims.

## Rehearse, review, then commission

1. **Rehearse locally.** Run the README quickstart. Inspect all five domains, their lifecycle/active state, capacity limits, dependencies, credential requirements and generated flowcharts. Validate every edited configuration before exporting calldata.
2. **Write a measurable first task.** Name the domain, legal data rights, exact sites/apps, deliverables, budget, time limit, prohibited actions, reviewer and acceptance criteria. Use public or synthetic data first. Domain selection is a recommendation; admission to a real worker is separate.
3. **Commission the worker.** Follow the [computer-work guide](computer-work.md). Record runtime/model/plugin versions and test the actual browser or desktop with disposable accounts. Exercise lost connections, wrong-account detection, prompt injection and stop/recovery controls.
4. **Commission independent review.** The reviewer must evaluate source/application state and artifact contents, not merely trust the worker's completion message. Reserve review capacity before raising worker concurrency. Decide how rejected, disputed or uncertain results will be reconciled.
5. **Deploy and inspect the control plane.** Use the repository deployment process and approved RPC. Verify chain ID, manager address, bytecode, governance, pause/escalation wiring and every real connector. Record deployment provenance and upgrade/ownership policy. A bytecode check proves code exists, not that it is trustworthy or compatible.
6. **Preview the proposed change.** Use the CLI below. Review all exported transactions, including registration, operations, telemetry, infrastructure and activation. The plan is bound to an observed chain state and can become stale. Regenerate it immediately before application.
7. **Test the complete lifecycle.** With disposable funds and a test network, run task admission, execution, artifact publication, independent validation, dispute/recovery and finalized settlement. Reconcile actual balances and external effects. A successful simulated event does not pass this gate.
8. **Expand gradually.** Increase concurrency only when observed acceptance quality, review throughput, latency and incident recovery justify it. Record outcome data with measurement windows and sources; do not replace observations with the sample configuration's percentages.

## Governance preview and application

From the repository root, compile the contracts once with `npm run compile`. Configure your approved network and signer through the existing Hardhat configuration. Replace the example values with verified deployment configuration and set `scenario.mode` to `operator-supplied` only after reviewing those values; the label itself proves nothing. Live application rejects the illustrative scenario. Keep credentials in protected environment/secret storage, never in this JSON, the browser or a generated plan.

```bash
HARDHAT_NETWORK=YOUR_NETWORK npm run demo:phase6:apply -- \
  --manager YOUR_MANAGER_ADDRESS \
  --chain-id YOUR_EXPECTED_CHAIN_ID \
  --config /absolute/path/deployment.phase6.json \
  --export-plan /absolute/path/reviewed-plan.json
```

The default is a read-only preview. Review `--help` for supported options. For a directly authorized governance signer, adding `--apply` submits the proposed changes. `--apply` requires `--chain-id` and `--export-plan`, so the run retains receipts and partial failures. Use a new export path for each run and preserve earlier evidence. If governance is a Safe or timelock, use the exported transactions with that governance workflow; do not substitute an unrelated signer. Treat every exported calldata item as a proposal until the intended target, chain, value and arguments have been reviewed.

Application uses multiple transactions and is **not atomic**. If any transaction fails or the connection is interrupted, preserve the plan, transaction hashes and signer nonce. Inspect receipts and authoritative on-chain state before retrying. Re-run preview to compute the remaining changes; do not blindly replay the original transaction list. Independently compare the final state with the intended configuration and test the off-chain services.

## Pause and recovery

| Situation | Operator action |
| --- | --- |
| Invalid configuration or unknown CLI option | Fix the reported field/flag and regenerate the plan. No successful plan should be inferred from partial output. |
| No eligible domain or unavailable capacity | Keep the task unassigned; inspect domain lifecycle, capabilities, human-review requirements and configured limits. |
| Wrong chain, manager, specification or governance signer | Stop. Verify deployment records and the selected environment before generating or applying a new plan. |
| Credential record unavailable or revoked | Stop that admission path until a trusted verifier resolves the requirement. A coverage report is insufficient. |
| Uncertain worker outcome | Stop the worker, preserve dispatch journals and reconcile actual application effects. Do not automatically retry. |
| Governance transaction interrupted | Inspect receipts/state/nonce and generate a fresh preview. A failed client command does not prove nothing happened. |
| Incident after activation | Use commissioned worker stop controls and the approved pause/escalation process. Disabling metadata or removing admission does not stop an already running external worker. |

The existing `forwardPauseCall` and escalation features require correctly wired contracts and governance authorization. Test them before production with the actual pause scope; do not assume all remote services share the on-chain pause state.

## Release checks

```bash
npm run demo:phase6:ci
npx hardhat test test/v2/Phase6ExpansionManager.test.js test/scripts/phase6*.test.ts
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest \
  demo/Phase-6-Scaling-Multi-Domain-Expansion/tests \
  test/orchestrator/test_phase6_runtime.py
npm run site:build
npm run site:test
npm run site:qa
```

Install the repository's locked Node dependencies and the Python runtime/test dependencies before running these checks. CI executes the relevant gates with its pinned toolchains. Keep configuration, source revision, generated plans, test results, approval records and deployment receipts together. Generated reports should exclude secrets and unnecessary private data.
