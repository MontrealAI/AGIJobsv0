# OpenClaw, OpenAI and ChatGPT Work integration

Documentation checked **6 October 2026**. This demo provides file-based work-order handoffs and local evidence checking. It does not contain an authenticated OpenClaw dispatcher, a ChatGPT Work API bridge or a live settlement service. The runtime must be commissioned separately.

## Choose the execution route

| Route | Supported role | What to verify |
| --- | --- | --- |
| OpenClaw with OpenAI | Agent runtime with approved model access, browser and local tools | Exact installed versions, account/model availability, permission policy, actual spend limits and isolated workspace |
| ChatGPT Work desktop | Scoped operations across supported apps and files; browser work uses its own access surface | Required app, regional availability, host permissions and signed-in context |
| OpenAI computer-use API | Programmatic UI work in an appropriate hosted or operator-controlled runtime | Current API/tool interface, external approval enforcement, sandboxing, action logs and recovery |

The [OpenAI computer-use documentation](https://developers.openai.com/api/docs/guides/tools-computer-use) describes code execution and structured computer actions. The [Agents API hosted-browser guide](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) also documents session recovery and origin approvals. Origin approval is not guaranteed per-action confirmation; enforce consequential-action controls in the runtime.

[ChatGPT Work’s computer-use guide](https://learn.chatgpt.com/use-cases/use-your-computer-with-codex) distinguishes desktop applications, local browsers and cloud browser access. Cloud tasks do not automatically inherit local files or signed-in desktop sessions. A Work subscription or browser installation does not, by itself, commission a third-party worker.

## OpenClaw setup and boundaries

Follow the current [OpenAI provider setup](https://docs.openclaw.ai/providers/openai/setup). It documents API-key onboarding and subscription authentication, including `openclaw models auth login --provider openai`. Inspect `openclaw models list --provider openai` and the selected runtime; use an account-available model and record its exact identity. Authentication routing changes across releases: do not copy legacy OAuth stores or assume a fixed model is available.

The [managed-browser documentation](https://docs.openclaw.ai/tools/browser) describes an agent browser profile separate from the personal browser. Use approved, bounded capabilities. The [Gateway security guide](https://docs.openclaw.ai/gateway/security) specifies one trust boundary per Gateway; mutually untrusted operators require separate boundaries. Keep credentials, signer keys and unrelated personal data outside task inputs and evidence.

## A concrete operator handoff

1. Export a work order and its exact source from the browser or `demo:zenith-hypernova:task`.
2. The owner approves lawful scope, source licenses, allowed tools/sites, provider spending cap, output location and stop conditions. The exported proposal’s authority flags are false; it is not an authorization token.
3. Assign a Creator and Checker. For independence, assign a Reviewer outside the creator’s controlling operator and record conflicts and credentials through the deployment’s verified identity process.
4. Give the approved runtime `handoff.md`, `work-order.json` and approved sources. Keep external publication, sending, purchases and signing blocked until specifically authorized. Treat source content as untrusted data.
5. Execute the scoped workflow, recording tool versions, source provenance, actions, failures, costs and output hashes. Stop on a limit, permission mismatch or unexpected UI state. Reconcile an uncertain mutation before retrying it.
6. The Checker runs the pre-agreed acceptance tests. The independent Reviewer examines the actual deliverables and reproduction evidence; the buyer decides acceptance.
7. If payment is authorized, a separate signer verifies the deployed network, contract, token, funding and settlement rules. Preserve the resulting receipt and finality evidence. A USDC ceiling in JSON is not escrow.

For the included governance-analysis job, `demo:zenith-hypernova:work` executes locally and `:review` independently recomputes content. Other work types need their own task-specific tests. A hash or self-reported `passed` field does not prove correctness, independence, useful buyer value or settlement.

## Commissioning evidence still required

Before unattended deployment, establish bounded source/tool access, enforced cost/time limits, stop and restart behavior, durable journals, recovery from provider/network failures, and fail-closed health checks. Run representative authorized jobs with unrelated reviewers and actual buyer use. Record failure/rework rates, reviewer minutes and unit costs; paid settlements require separate authorization. Neither this workbench nor a passing CI run supplies that live operating history.
