# HGM operator runbook

## 1. Reproduce and understand the source

Run `python demo/Huxley-Godel-Machine-v0/run_demo.py --seed 7` from the repository root. Keep its resolved configuration, comparison, logs and timelines together. Import the comparison into the [research console](https://montrealai.github.io/AGIJobsv0/experiments/huxley-godel/).

The simulator never contacts a provider or chain. The website's **Create analysis file** performs real local arithmetic on synthetic input. Its **Check candidate JSON** compares the candidate with the expected source-bound structure. Neither claims independent substantive acceptance.

## 2. Define useful screen-based work

Use the work-order planner to choose a workflow and reserve a budget and reviewer time. Finish the draft with the buyer: exact outcome, approved input versions/hashes/licenses, allowed applications/origins, deliverable formats, reproducible acceptance checks, deadline, spending/run bounds and the unrelated reviewer. Reserve execution, review, repair and recovery costs within the agreed USDC ceiling. The downloaded draft is not directly admitted to a worker.

Prefer structured APIs, files and code where they expose the operation reliably. Use browser/computer interaction where the task requires a graphical interface. A model credential does not grant desktop permissions or authorize actions in an account.

## 3. Inspect the bounded benchmark task

The shipped worker integration audits **simulation summaries**, not arbitrary customer tasks. Its output is `benchmark-analysis.json`, with the source digest, completed/reserved/committed costs, simulated gross value, value less commitments, pending counts and the preferred strategy for that one run. Both approval flags must remain false.

With the repository's pinned Node/npm and `npm ci`:

```bash
npm run demo:hgm:worker -- inspect demo/Huxley-Godel-Machine-v0/web/artifacts/comparison.json
```

Inspection is read-only. It emits the normalized task and exact `taskSha256` used by the shared `computerWork` adapter. Website-exported task bytes and normalized task digests are different concepts; use this inspector's digest for admission.

## 4. Commission the OpenClaw worker

Use an isolated, operator-controlled runtime with a supported OpenAI provider. Verify its actual tools, app/origin policy, browser profile, sandbox, spend/run/time limits, stop procedure and screenshots/actions where relevant. OpenClaw's managed browser is separate from a personal browser; its general tool sandbox is **off by default** and must be configured. The Gateway remains on the host. Keep privileged services on protected interfaces.

The shared adapter uses `POST /v1/responses` and the `openclaw/<agentId>` route. Enable this endpoint using current OpenClaw documentation. The Gateway endpoint is not itself a desktop implementation. The selected worker needs the actual permitted tools and operating-system access for any GUI task.

Copy `config/worker-profiles.example.json` to an owner-controlled private file. Replace the deployment placeholder with independently verified chain/contract identity, configure the isolated agent, set the endpoint and use your secret-management process for `COMPUTER_WORK_HGM_TOKEN`. Keep tokens, private profiles and journals outside the checkout and website.

Set `COMPUTER_WORK_PROFILES_FILE` to the absolute private profile path and `COMPUTER_WORK_STATE_DIR` to the absolute persistent journal directory. The example starts with `approvedJobs: []`. Only after reviewing the task and deployment, add the real job ID and exact inspected hash:

```json
{ "jobId": "73", "taskSha256": "REPLACE_WITH_THE_INSPECTED_64_HEX_DIGEST" }
```

The example job ID is illustrative, not an existing authorization. Dispatch only the actual admitted job:

```bash
npm run demo:hgm:worker -- run RECORD.json ACTUAL_JOB_ID
```

The adapter requires exact admission, bounds response size/time/output tokens, and journals the attempt. Changing the task requires a new review and admission. This demo adds no signing or payment capability and does not control settlement contracts.

## 5. Check the delivered candidate

Save the worker receipt and returned artifact bytes unchanged. Extract the returned `benchmark-analysis.json` candidate, then use the console or:

```bash
npm run demo:hgm:worker -- review RECORD.json benchmark-analysis.json
```

A failed content check returns a nonzero status. A passing content check means arithmetic, fields and source-summary binding match. It does **not** authenticate the provider, prove screenshot behavior, attest to reviewer independence, or establish real customer value. Reconcile the receipt's task digest, job ID, deployment and journal with independently known admission values; an unsigned receipt cannot establish provenance by itself.

For a deterministic local analysis without dispatch:

```bash
node demo/Huxley-Godel-Machine-v0/scripts/worker.cjs analyse RECORD.json
```

This writes the candidate JSON to standard output, making the output available for explicit redirection to a new artifact path.

## 6. Use an authorized ChatGPT Work session

Download the benchmark worker task. Provide it to Work and authorize only the applications and inputs needed for the task. Ask for the exact deliverable file, then check it through the same candidate checker. For this numerical audit, direct code/files are sufficient; GUI use is not a requirement.

For broader work, use the completed buyer-specific work order and appropriate app permissions. Work's computer-use capability is a separate execution surface with platform and administrative restrictions. There is no assumed remote Work API and no credential-sharing bridge added by this demo.

## 7. Stop, recover and settle

- **Simulation:** Ctrl+C stops the local process. Owner directives govern new scheduling in a new finite run. Reserved tasks at a run's horizon remain visible as pending.
- **Static viewer:** closing it stops observation; it does not cancel a separately dispatched worker.
- **Connected worker:** use the actual OpenClaw runtime stop/control surface and preserve the journal. Revoke future admission when appropriate. A timeout or ambiguous response is an unknown outcome: reconcile recorded effects before a retry. Do not delete the journal or change job IDs to bypass replay protection.
- **Substantive acceptance:** an unrelated reviewer reproduces checks, evaluates usefulness and limitations, and records a decision. Buyer acceptance is separate from a simulated success.
- **Settlement:** use only the separately authorized, verified deployment and signer workflow. Confirm chain, contract, USDC asset/decimals, decision, replay protection and reconciliation through that system's runbook. This module sends zero transactions.

## Qualification boundary

Before a real deployment, demonstrate the exact workflow on the actual host with permitted inputs; capture runtime identity, tool permissions, adverse-path tests, effective spend/stop controls, independent review and buyer acceptance. Run duration and concurrency qualification against the expected workload. A successful synthetic run cannot substitute for this evidence.

## Current primary references

Checked 2026-10-06. These references describe upstream capabilities; they do not certify a particular installation.

- [OpenClaw managed browser](https://docs.openclaw.ai/tools/browser)
- [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [OpenClaw Responses endpoint](https://docs.openclaw.ai/gateway/openresponses-http-api)
- [ChatGPT Work computer use](https://learn.chatgpt.com/docs/computer-use)
- [OpenAI computer-use API](https://developers.openai.com/api/docs/guides/tools-computer-use)

## Preserved presentation assets

The Grand Operator Console remains under `ui/`, published as `legacy/`. Its diagrams and visual layout are retained. The local Bootstrap 5.3.3 CSS matches the original integrity digest `sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH`; its MIT license header is preserved. Mermaid is bundled from the root lockfile. The published viewer needs no runtime CDN, provider connection or secret.
