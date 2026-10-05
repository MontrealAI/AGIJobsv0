# Computer-work mission: from a screen to checked evidence

The **Planetary Workbench** adds a concrete, bounded job to the fabric: produce a deterministic admission plan for ten synthetic work orders. The worker uses the browser, reads the board, resets the baseline and exports two deliverables. The reviewer checks those deliverables independently of the planner code. Completing this allocation does not complete the ten proposed jobs.

## 1. Rehearse without a provider

From the repository root:

```bash
npm run demo:planetary-orchestrator-fabric:workbench
```

Open http://127.0.0.1:18791/. The English/French workbench offers exact USDC budgets, global and per-reviewer time limits, simulated outages, explicit capability matching and operator separation. It applies a transparent first-fit policy in source order; it does not claim optimal scheduling. A worker's `maxJobs` means sequential jobs in this batch. Never run competing desktop tasks against the same app/session.

Reset the baseline and download `allocation.json` and `brief.md`. With repository dependencies installed, check your files:

```bash
node --import tsx demo/Planetary-Orchestrator-Fabric-v0/computer-work/review.cjs --allocation /absolute/path/allocation.json --brief /absolute/path/brief.md
```

The pinned baseline checker expects five planned jobs, five holds, 10,600.000000 USDC reserved, 4,400.000000 USDC unallocated, 2,980.000000 USDC estimated provider/review costs and 50 review minutes. It checks every job, assigned worker/reviewer, source hash, decision and accounting field against a separately reviewed answer key. The exact exported brief format is part of this bounded task. Exploratory parameter changes deliberately fail the baseline checker; reset before completing the pinned task.

No funds are deposited. Network/chain fees and platform charges are not modeled. Estimated margin is reward minus assumed provider/review costs, not actual profit. Each real work category requires its own acceptance evaluator.

## 2. Operator-led ChatGPT Work

Provide [`task.json`](../computer-work/task.json) to an isolated Work session with the necessary browser or desktop permissions. Ask it to open the workbench, inspect the source board, restore baseline inputs and download the two files into an approved output folder. Verify them with the command above.

Run the server on the machine hosting the browser: `127.0.0.1` on another computer refers to that other computer. Follow the official Work browser/desktop instructions for the installed version. A local task and a cloud task have different access boundaries; naming a local URL does not grant cloud access to a Mac. Work is an operator-led procedure here, not a fabricated remote Work API.

## 3. Commission OpenClaw using the existing adapter

Use a dedicated Standard OS account or VM, a separate browser/session and restricted apps, files and network destinations. Keep personal accounts, signing keys and unrelated credentials out of the worker. The workbench contains synthetic data only. Enable OpenClaw's Responses endpoint intentionally and configure the actual browser/Codex runtime. The endpoint can carry full gateway operator authority; a separate conversation is not a security boundary.

1. Copy [`worker-profiles.example.json`](../computer-work/worker-profiles.example.json) to protected operator storage. Set the real `/v1/responses` endpoint, `agentId`, unique `deploymentId`, time/output limits and token environment variable. The supplied profile admits **zero jobs**.
2. Provision `COMPUTER_WORK_PLANETARY_TOKEN` using your protected service environment. Set `COMPUTER_WORK_PROFILES_FILE` and `COMPUTER_WORK_STATE_DIR` to absolute paths. The journal directory must persist and be shared by all dispatchers for this deployment. Do not store secrets in task files, browser downloads or Git.
3. Start the workbench on the worker's machine, at its pinned origin `http://127.0.0.1:18791`. Inspect the task:

   ```bash
   npm run demo:planetary-orchestrator-fabric:worker -- inspect
   ```

4. Review the task, exact source hash and normalized task hash. Explicitly add the intended positive decimal `jobId` and exact `taskSha256` to the protected profile's `approvedJobs`. If the task changes, re-review and re-admit it. The demo does not auto-admit jobs.
5. Dispatch the **allocation task** after commissioning the actual runtime controls:

   ```bash
   npm run demo:planetary-orchestrator-fabric:worker -- run 123
   ```

   This uses the repository's `computerWorkHandler`, dispatch journal and OpenClaw Responses adapter. It can perform real remote worker actions when configured. It does not execute the proposed allocation or broadcast a transaction. Inspect the receipt saved in the protected journal; stdout also contains the receipt.
6. Bind review to the expected job and deployment:

   ```bash
   node --import tsx demo/Planetary-Orchestrator-Fabric-v0/computer-work/review.cjs --receipt /absolute/path/receipt.json --job-id 123 --deployment-id YOUR_COMMISSIONED_DEPLOYMENT
   ```

The reviewer validates the exact task and normalized hash, expected job/deployment, evidence-ready state, two unique typed artifacts, UTF-8 byte lengths, hashes and independent content checks. Recomputing hashes on incorrect output still fails. Receipts are unsigned: an attacker can manufacture a syntactically correct receipt. A pass is a **local content verdict**, not authenticated provider provenance, independent human judgment, production approval or settlement authorization.

## 4. Handle interruption and rejection

| Observation | Action |
| --- | --- |
| Task/job not admitted or token unavailable | No dispatch. Fix protected operator configuration after reviewing the task. |
| Existing dispatch journal | Inspect it; do not delete it to force a retry. |
| Timeout or `COMPUTER_WORK_OUTCOME_UNKNOWN` | Stop/reconcile the remote session and actual app state. The worker may already have acted. |
| Incorrect or altered deliverable | Reject it. Preserve the original evidence and commission a separately admitted correction task. |
| Local checker passes | Review actual source/application state and provider usage separately; this verdict cannot settle a job. |

The HTTP timeout bounds waiting, not remote execution or money spent. `max_output_tokens` is not a tool-action/spending cap. Set real enforcement in the worker environment and test cancellation, unexpected navigation, prompt injection, downloads and wrong-account behavior. Withdrawing admission blocks new dispatches, not an already running worker.

## 5. Extend to real jobs

Use the existing [computer-work integration](../../../docs/computer-work.md) and contract lifecycle. Define each task's public/licensed/synthetic inputs, exact outputs, acceptance checks, price and review capacity. Commission the worker environment, unrelated reviewers and deployment-specific identity/stake/tax prerequisites. Rehearse finality, rejection, dispute, interrupted dispatch and settlement with disposable resources. Keep creator, checker, reviewer and signer roles separated. Scale based on measured useful acceptance, review minutes, cost and unresolved outcomes.

The TypeScript fabric continues to model scale and recover simulated jobs automatically. **Do not attach live side effects directly to its synthetic completion/requeue loop.** The durable computer-work adapter is the execution boundary; unknown live outcomes require reconciliation.

## Current primary documentation

Checked **2026-10-05**. Record the versions and account capabilities actually commissioned; a documentation update does not upgrade an installed worker.

- [OpenClaw Codex Computer Use](https://docs.openclaw.ai/plugins/codex-computer-use): native runtime/plugin setup and desktop readiness. `/codex computer-use status` is a chat command, not a shell subcommand.
- [OpenClaw OpenResponses API](https://docs.openclaw.ai/gateway/openresponses-http-api): explicitly enabled endpoint, agent routing and gateway-level authority.
- [OpenClaw OpenAI provider](https://docs.openclaw.ai/providers/openai): supported account/runtime routes. [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt) documents external integrations including OpenClaw. Authentication alone does not grant desktop permissions.
- [ChatGPT desktop computer-use workflow](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex): scoped tasks, platform permissions, browser selection and review.
- [OpenAI API computer use](https://developers.openai.com/api/docs/guides/tools-computer-use): an application-managed environment, bounded actions and actual-outcome verification. A direct OpenAI desktop executor is not added by this demo.

The $40 trillion annual screen-work opportunity remains a project planning assumption, not an externally validated TAM or a claim that all human screen work is presently reliable or commercially addressable.
