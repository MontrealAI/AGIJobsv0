# Phase 8 operating guide

## Choose the next useful result

Start with a bounded public-data research pack, software patch, QA suite, dataset transformation, public product comparison, energy scenario analysis, literature map, executable guide, interface prototype or numerical reproduction. Each work-lab category includes editable deliverables and acceptance criteria. These are draft work orders, not completed customer engagements.

Prefer repeatable tests and explicit output formats. Plan review capacity before admitting work. A worker pool that generates more output than reviewers can inspect accumulates unresolved work rather than demonstrated value.

## Connect OpenClaw or ChatGPT Work

Current official documentation, checked 2026-10-07:

- [OpenClaw browser](https://docs.openclaw.ai/tools/browser): a dedicated managed browser profile supports page inspection and interaction through its local gateway.
- [OpenClaw security](https://docs.openclaw.ai/gateway/security): use separate trust boundaries for mutually untrusted operators; a shared gateway is not a hostile multi-tenant security boundary.
- [ChatGPT Work Computer Use](https://learn.chatgpt.com/docs/computer-use): supported desktop environments can operate graphical applications with the necessary plugin, OS permissions and app access. Availability and permissions must be checked in the actual account.
- [OpenAI API computer use](https://developers.openai.com/api/docs/guides/tools-computer-use): a developer-managed integration supplies an execution environment and returns observations after model-requested actions. Choose the documented interface supported by the deployed model.

These are distinct integration paths. This repository does not establish a universal OpenClaw-to-ChatGPT Work API or treat a ChatGPT subscription as API credentials. Record actual runtime, model, tool and browser versions in each execution receipt. Do not invent context limits, success rates, prices or uptime for a named adapter. Existing `model-adapters.json` and manifest model entries are historical synthetic fixtures.

For an operator-led Work session, open the local work lab and provide `computer-work/task.json` as the bounded task. Approve only the required application and origin access. Export the actual output and preserve the action record.

For an API-backed worker, the included wrapper reuses [the repository computer-work harness](../../docs/computer-work.md):

```bash
npm run demo:phase8:worker -- inspect
```

This prints the task and SHA-256 digest without dispatch. Configure an absolute `COMPUTER_WORK_PROFILES_FILE`, an absolute `COMPUTER_WORK_STATE_DIR`, a `phase8` profile, its authenticated `/v1/responses` endpoint, environment-token reference, deployment ID, limits, and an exact admitted job ID/task-digest pair. The endpoint must implement the repository protocol; pointing this setting at an unrelated endpoint does not implement an adapter. Keep credentials out of exported drafts and the repository.

After the owner approves that exact task and job:

```bash
npm run demo:phase8:worker -- run APPROVED_NUMERIC_JOB_ID
```

The bridge retains the shared harness's durable attempt state, size limits, task binding and unknown-outcome behavior. A timed-out attempt requires reconciliation; do not blindly retry a potentially completed action. The resulting receipt still requires artifact review and buyer acceptance. The wrapper does not initiate settlement.

## Advance through measured gates

| Gate | Required evidence | If it fails |
| --- | --- | --- |
| Admission | Authorized scope, sources, exact origins, available execution and review budgets | Keep the task in draft or defer it |
| Execution | Real runtime identity/version, actions, errors, resource usage, output hashes | Stop, preserve state and reconcile |
| Artifact verification | Recalculation, acceptance tests and provenance bound to the task | Reject or request a bounded repair |
| Independent review | Separately authenticated reviewer and conflict disclosure | No claim of independent acceptance |
| Buyer use | Buyer can reproduce, edit and use the deliverable | Record the limitation and revise scope |
| Settlement | Correct deployment, denomination, authorization and finalized transaction evidence | Remain unpaid/pending; never infer payment from a local flag |
| Expansion | Measured useful outputs, costs, reviewer time and failure recovery | Hold capacity or roll back the change |

Measure useful/admitted work, cost per useful outcome, human minutes per useful outcome, rejection reasons, timeout/unknown outcomes, and unresolved liabilities. Test pause, restart and recovery under representative load before unattended operation. A successful local rehearsal does not substitute for sustained live operation.

## Governance artifacts

All bundled addresses, model names, budgets and historical scenarios are synthetic. Safe exports default to local chain 31337 and leave the Safe-account field blank rather than misidentifying the manager contract as a Safe. Calldata generation never broadcasts a transaction.

Before using a proposal on any deployed network, verify the chain, exact manager and Safe addresses, deployed bytecode and ABI, roles, balances, nonce, timelock, complete simulation and independent review. The manifest still permits explicit environment overrides for qualified deployment work. A high scenario score is never permission to sign.

## Reproducibility and recovery

Use the pinned repository toolchain and lockfiles. Run the module's tests and artifact validator; build both the work lab and original atlas. The full Pages workflow additionally checks the complete catalog and site. Keep each local bundle in a fresh directory. The SHA-256 receipt detects drift against that receipt; it is not a signature, identity proof or payment proof.

If inputs change, regenerate the entire bundle. If calculations fail, retain the failure and correct the input or implementation. If live worker state is uncertain, use the shared harness's recovery procedure before another dispatch. Pause expansion while review backlogs or unknown outcomes remain unresolved.
