# From α-AGI MARK to accepted computer work

Updated 2026-10-07. This is an operational handoff guide, not a claim of completed live commissioning.

AGI Jobs coordinates authorized, lawful screen-based work with specialized workers, reviewable evidence, independent acceptance and explicit settlement. α-AGI MARK models how a project receives governed capital. Its financing contracts do not dispatch desktop work or pay AGI Jobs workers automatically.

## Choose a supported execution path

| Surface | Current capability | How it fits here |
| --- | --- | --- |
| OpenClaw | Managed agent browser; configurable models, tools and sandbox execution | The repository's [computer-work adapter](../../../docs/computer-work.md) targets an operator-configured Responses gateway. Pin and commission the worker profile. Sandboxing is off by default; explicitly configure and test it. |
| ChatGPT Work / Codex Computer Use | Approved desktop applications on supported macOS/Windows installations | An operator can perform the admitted workflow and export artifacts. No direct ChatGPT Work dispatch bridge is implemented by this demo. App/OS permissions and product availability remain separate prerequisites. |
| OpenAI Responses computer use | Model-directed UI actions or code in a runtime managed by the integrating application | A custom worker must enforce its own isolation, action controls, timeouts and evidence. API conversation state does not restore a browser session. |
| OpenAI Agents API computer use | An OpenAI-hosted browser with session events and origin/sign-in approval flows | A distinct integration option; this demo does not implement its session protocol. Origin approval does not itself guarantee per-action confirmation. |

The capability is broader than text generation: agents can use application interfaces to produce software, analyses and editable business artifacts. Reliability must be demonstrated for each admitted task. Neither these product capabilities nor a local demo establish universal task success.

## A concrete first work order

Use [the existing job planner](https://montrealai.github.io/AGIJobsv0/work/) to describe a public-data report or software QA deliverable, its exact USDC proposal amount, output files and measurable acceptance criteria. The Alpha Mark lab estimates how much work a hypothetical budget and reviewer capacity could support. Its calculations are planning scenarios, never balances or revenues.

For a small commissioning example, copy [public-report-task.json](../examples/public-report-task.json). It asks an approved `analysis` worker to inspect the public Alpha Mark guide and summarize its actual execution and evidence boundaries. It has no approved job ID, credentials or settlement instruction. Inspect the source URLs and rights before admitting it.

1. **Define acceptance before execution.** Name required files, source references, correct calculations, reproducibility checks, maximum spend/runtime and prohibited external effects. Use public, licensed or synthetic inputs; do not place secrets or private personal data in the task.
2. **Commission an isolated worker.** Follow the [adapter setup](../../../docs/computer-work.md). Set an approved gateway, profile, tool/site boundaries, provider-side limits, separate signing authority, durable journal and tested stop controls. A prompt is not a spend cap.
3. **Inspect and admit the exact task bytes.** Build the adapter, run `inspect`, review the normalized task and record the digest with a real job ID in protected operator configuration. A later edit invalidates admission.
4. **Execute once and preserve evidence.** Keep the task digest, deployment/job identity, attempt ID, provider/model versions, final artifacts, usage, timestamps and relevant screenshots/action trace. A timeout is an unknown outcome: reconcile before retrying.
5. **Obtain independent review.** A separate reviewer uses the admitted criteria and original sources, reproduces calculations and inspects artifact bytes. The [evidence reviewer](https://montrealai.github.io/AGIJobsv0/review/) checks integrity and records assessments; it does not authenticate provider provenance or sign approval.
6. **Record buyer use and settlement separately.** Actual buyer acceptance, contract finality and authorized USDC settlement each require their own evidence. A receipt, screenshot, validator checkbox or financing-market launch is insufficient.

```bash
npm run build:orchestrator
node demo/One-Box/computer-work/run.cjs inspect demo/alpha-agi-mark/examples/public-report-task.json
```

This command only inspects. After actual operator configuration and admission, the existing adapter's `run` command performs the live commissioning step. No example key, job ID or provider success is supplied here.

## Scale on measured useful work

Track accepted deliverables, buyer reuse, cost per accepted job, review minutes, correction/dispute rates, unknown outcomes and finalized settlements. Grow concurrency only when provider limits, reviewer capacity and recovery behavior support it. The project's $40T/year opportunity remains a scenario assumption; it is not an observed market share or expected revenue.

## Official sources checked on 2026-10-07

- [ChatGPT Computer Use](https://learn.chatgpt.com/docs/computer-use): desktop capability, setup and app permissions.
- [OpenAI Responses computer use](https://developers.openai.com/api/docs/guides/tools-computer-use): integration paths, session state and result verification.
- [OpenAI Agents API computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use): hosted browser and approval event boundary.
- [OpenClaw managed browser](https://docs.openclaw.ai/tools/browser): dedicated browser profile.
- [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing): sandbox configuration and host/gateway boundary.

Recheck these sources and test the actual pinned worker before upgrades. These references establish documented capabilities, not a production certification for AGI Jobs.
