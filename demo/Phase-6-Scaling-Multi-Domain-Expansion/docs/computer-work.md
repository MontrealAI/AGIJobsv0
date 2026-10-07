# From a domain plan to authorized computer work

Phase 6 organizes domain policy and capacity. The existing [computer-work pipeline](../../../docs/computer-work.md) executes separately admitted tasks through an operator-configured OpenClaw Responses gateway. An operator can also use ChatGPT Work to perform a scoped task and export evidence for independent review. This demo does not provide a remote ChatGPT Work dispatch API.

## Choose a work surface

| Surface | How to use it | Evidence to retain |
| --- | --- | --- |
| OpenClaw with native Codex Computer Use | Commission the actual gateway, desktop plugin, OS identity, app access and task policy | Exact runtime/plugin versions, live desktop readiness result, admitted task digest, session receipt and artifacts |
| OpenClaw managed browser / approved integrations | Use isolated profiles and the tools appropriate to the job | Allowed origins, provider configuration, exact input/output and observed application state |
| ChatGPT Work Computer Use | An authorized operator performs the task with Work's app and OS permissions | Original task, permitted actions, final artifacts and a review of actual effects |
| Custom OpenAI API worker | Implement and commission an isolated tool-execution loop behind an approved endpoint | Runtime enforcement, tool observations, limits, recovery tests and artifact integrity |

Official guidance checked **2026-10-07**: [OpenClaw Codex Computer Use](https://docs.openclaw.ai/plugins/codex-computer-use), [OpenClaw Responses endpoint](https://docs.openclaw.ai/gateway/openresponses-http-api), [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing), [ChatGPT Work Computer Use](https://learn.chatgpt.com/docs/computer-use), and [OpenAI API computer use](https://developers.openai.com/api/docs/guides/tools-computer-use).

The current OpenClaw desktop plugin distinguishes installed tools from a successful live desktop check. For turns requiring desktop access, deliberately configure and test `plugins.entries.codex.config.computerUse.strictReadiness: true`; its default is false. Use `/codex computer-use status` in an OpenClaw chat surface to check the actual desktop. The gateway Responses endpoint is separately enabled and authenticated. OpenClaw sandboxing is not enabled by default, and a new conversation is not an isolation boundary.

Work supports scoped graphical tasks on supported macOS/Windows setups. App approvals and OS permissions are separate controls; a permitted origin or application does not authorize every consequential action inside it. Prefer structured integrations when they suit the task. For a custom API implementation, current guidance supports code execution in a controlled runtime and structured computer actions. Your application must execute those calls, preserve the session and enforce policy; the model alone does none of that enforcement.

## A complete first handoff

Use [the public cross-domain brief task](../examples/cross-domain-task.json) to test the boundary without private data or writes. It requests a sourced comparison of the five Phase 6 profiles. It authorizes no login, messaging, trading, payments, publishing or infrastructure changes.

```bash
npm run build:orchestrator
node demo/One-Box/computer-work/run.cjs inspect \
  demo/Phase-6-Scaling-Multi-Domain-Expansion/examples/cross-domain-task.json
```

Inspection produces a normalized task and digest; it is not admission or dispatch. Choose a commissioned profile in protected operator configuration, review the exact task digest and admit it to a specific job. Follow the [canonical commissioning procedure](../../../docs/computer-work.md#commission-a-real-worker). The example profile name must correspond to a profile you commission; a label is not proof of capability.

Retain the original task, provider/session metadata, candidate artifacts, checksums and independently checked findings. Current repository receipts support bounded UTF-8 JSON, CSV, Markdown and plain text artifacts. Screenshots, Office files and other binary evidence need a separately commissioned artifact store; do not relabel unsupported binaries as text. Provider success and matching hashes do not establish task correctness or authenticate a worker.

Use the [evidence reviewer](../../../docs/EVIDENCE_REVIEW.md) for local integrity and acceptance findings. Its exports are unsigned review records, not settlement authorization. Marketplace execution still requires the existing identity, stake, validation, dispute and finalized settlement lifecycle.

## Domain-specific acceptance examples

| Domain | Appropriate scoped first job | Independent acceptance |
| --- | --- | --- |
| Finance | Reconcile synthetic ledger entries and explain discrepancies | Row counts, exact arithmetic, source references; no trading or funds movement |
| Health | Compare public service documentation or synthetic administrative records | Source accuracy, privacy rules and qualified review; no diagnosis or treatment decisions |
| Logistics | Prepare a shipment exception report from synthetic records | Identifier reconciliation, timing calculations and operator review before any rerouting |
| Climate | Check public dataset provenance and prepare an analysis brief | Reproducible calculations, units, uncertainty and traceable inputs |
| Education | Produce an accessible learning draft using permitted materials | Factual review, source rights, accessibility and instructor acceptance |

The same interfaces can support research, software QA, document/spreadsheet preparation, design tools and many operational workflows when properly commissioned. Success is measured per task. Expanding domains means adding evidence-backed capability and review capacity, not inferring competence from a generic desktop connection.

## Before admitting a consequential task

Define exact origins/apps, least-privilege accounts, data rights, output locations, action and spending limits, stop controls and independent review. Treat web pages and documents as untrusted inputs. Test wrong accounts, redirects, malicious instructions, downloads, app crashes, timeouts and duplicate requests. A timeout can follow a completed external action; preserve journals and reconcile before authorizing a new attempt. Keep approval for external messages, publication, funds or destructive changes explicit and scoped to the task.
