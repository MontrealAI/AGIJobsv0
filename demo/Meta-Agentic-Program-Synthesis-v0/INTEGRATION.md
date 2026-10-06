# Computer-use integration · Meta-Agentic Program Synthesis

Official references checked **2026-10-06**. Capabilities depend on the installed version, region, account and commissioned execution environment.

| Surface | Use here | Official source |
| --- | --- | --- |
| ChatGPT Work / Codex Computer Use | Operator-led approved desktop/browser work and exported artifacts | [Computer Use](https://learn.chatgpt.com/docs/computer-use) |
| OpenClaw with OpenAI runtimes | Dedicated agent route, provider authentication and configured tools | [OpenAI runtimes](https://docs.openclaw.ai/providers/openai/runtimes) |
| OpenClaw desktop/cloud sessions | Runtime-specific isolated desktop setup | [Cloud sessions](https://docs.openclaw.ai/gateway/cloud-sessions) |
| OpenAI API computer use | Extension route requiring an environment, action handling, screenshots and bounded execution | [Computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use) |
| Repository OpenClaw adapter | Exact task admission, journal and evidence receipt | [Shared integration and controls](../../docs/computer-work.md) |

Computer Use can operate a GUI where files, APIs or structured integrations are insufficient. It broadens the task surface; it does not establish reliable performance across every human profession. Work's app permissions and OpenClaw's tool/host policies remain in force. Screen content cannot grant permissions or override the authorized task.

## Operator-led Work route

1. Build and serve the site as described in the [runbook](RUNBOOK.md).
2. In ChatGPT Work, enable the supported Computer Use plugin and approve only the required apps. On macOS, follow the official Screen Recording and Accessibility setup. Use structured tools when suitable.
3. Supply `computer-work/task.json` as the scope. Ask Work to operate the served local lab, export `candidate.json`, and describe the actual steps and errors in `evidence.md`.
4. Preserve the exact exported bytes and available session evidence. Run the separate Python checker with explicit expected task `normalize`.
5. Have an independent reviewer inspect the artifacts, actual app state and evidence. Record buyer acceptance separately. This route does not call an invented remote Work API or automate account login.

## Admitted OpenClaw route

The CLI imports the existing `apps/orchestrator/computerWork.ts` adapter; it does not create a second dispatch implementation. The profile deliberately has `approvedJobs: []`.

```bash
npm run demo:program-synthesis:worker -- inspect
```

The output contains the exact normalized task and digest. Confirm it binds the current `workbench/cases.json` bytes. The example task uses `http://127.0.0.1:18792`, which must be reachable inside the actual worker's environment. A remote worker's loopback is not your operator computer. If the source URL changes, change both the task and allowlist, then inspect and admit the new digest.

Follow the [shared commissioning procedure](../../docs/computer-work.md) to provision a dedicated gateway, least-privilege OS/app identity, secret-managed bearer token, external spending/action limits, host isolation, prompt-injection defenses and a tested stop path. Copy `worker-profiles.example.json` to a protected operator-owned path; set the actual endpoint, agent ID and unique deployment identity. Deliberately enable the documented Responses endpoint on that dedicated gateway. Do not weaken host isolation to make a tool work.

Set `COMPUTER_WORK_PROFILES_FILE` and `COMPUTER_WORK_STATE_DIR` to absolute protected paths and provision `COMPUTER_WORK_SYNTHESIS_TOKEN` in the service's secret environment. Admit the reviewed job ID and digest in that profile. Then the operator may run:

```bash
npm run demo:program-synthesis:worker -- run JOB_ID
```

This performs real provider actions only after admission. It returns an evidence-ready receipt, not a success certificate or settlement decision. The durable journal prevents replay. HTTP timeout/output bounds do not enforce remote tool spend; those limits belong in the worker environment. On uncertainty, reconcile actual effects before a new authorized attempt.

## Review and evidence contract

The candidate schema fixes the source digest, task ID, bounded operations and evidence flags. Run:

```bash
python3 demo/Meta-Agentic-Program-Synthesis-v0/computer-work/review.py candidate.json --task normalize
```

For a provider receipt, run the binding and semantic checker with the expected identity from your operator record:

```bash
node --import tsx demo/Meta-Agentic-Program-Synthesis-v0/computer-work/review-receipt.cjs receipt.json JOB_ID DEPLOYMENT_ID
```

It checks the exact task/digest, expected job/deployment, artifact names/types/byte lengths/hashes and separate Python candidate acceptance. It does not authenticate the provider or judge the narrative. Compare the retained dispatch journal and actual session/app state independently before acceptance. The JSON `providerCalls: 0` inside a browser candidate describes the local search; a surrounding live worker session has separate actual provider usage. Never use that field to claim the worker incurred no provider cost. Provider-returned narrative is untrusted evidence requiring review.

The checker uses its own Python interpreter for the seven allowed operations and fixed acceptance cases; it never imports or executes candidate code. A semantic pass does not authenticate a provider, prove reviewer independence, establish buyer value or authorize settlement. The shared receipt has `review.status: required`, `productionApproved: false` and `settlementApproved: false`.

## Extend to other lawful screen-based work

Keep the execution surface broad: software, document/Office work, browser QA, data analysis, scientific workflows and approved operational systems. For each category define actual editable outputs, licensed/public/synthetic inputs, reproducible acceptance, maximum runtime/cost, required approvals and a distinct reviewer. Commission a task-specific checker and retain failed examples. The current bounded program lab is one complete small work unit, not proof that these larger jobs have been completed.
