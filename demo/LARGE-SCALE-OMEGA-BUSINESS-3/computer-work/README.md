# Commissioning Omega computer work

The default creator is deterministic fixture code. The task files it exports are real handoffs compatible with the repository's existing OpenClaw Responses adapter. A completed worker response is candidate evidence; it is never payment authority.

## Choose the execution surface

| Surface                                           | Use it for                                                      | What you must supply                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| OpenClaw with native Codex Computer Use           | Browser/desktop workflows through the configured native harness | Supported host, plugin, dedicated account, required OS permissions and bounded tools        |
| OpenClaw managed browser or approved integrations | Browser tasks and structured app operations                     | Isolated browser/profile, least-privilege accounts and egress/action controls               |
| ChatGPT Work Computer Use                         | Operator-led work in permitted apps                             | A Work session with the required account/app access; export evidence for review             |
| Custom OpenAI Responses computer-tool runtime     | A separately implemented worker environment                     | Environment/tool loop, isolation, policy enforcement and a compatible commissioned endpoint |

Official docs checked **2026-10-05**: [Codex Computer Use](https://docs.openclaw.ai/plugins/codex-computer-use), [OpenClaw Responses endpoint](https://docs.openclaw.ai/gateway/openresponses-http-api), [OpenClaw security](https://docs.openclaw.ai/gateway/security), [ChatGPT Work](https://learn.chatgpt.com/docs/computer-use) and [OpenAI computer use](https://developers.openai.com/api/docs/guides/tools-computer-use). Follow the actual installed version. The native plugin status command `/codex computer-use status` is an OpenClaw **chat command**, not a shell command.

The Responses endpoint is disabled by default. Deliberately enable `gateway.http.endpoints.responses.enabled` on a dedicated gateway. Bearer authentication may grant broad gateway authority; keep it away from personal sessions, production signing keys and unrelated jobs. `allowedOrigins` and prohibitions in a task are instructions; enforce actual boundaries in the worker environment. A new conversation is not an isolation boundary.

## Operator-led ChatGPT Work handoff

1. Start the dashboard in the same isolated environment the worker can reach. A remote worker's `127.0.0.1` is its own machine, not the operator's. Do not expose this unauthenticated demonstration server publicly.
2. Download the selected job's `task.json` and `input.json`. The handoff embeds the exact synthetic input, source hash, required result fields, decision rules and allowed origin. Review them before use.
3. In Work, give the agent those files and authorize only the bounded task. Export `candidate.json` and `dossier.md` to a **separate candidate directory**. Do not overwrite the fixture run or its original evidence. Screenshots may support human review but are not processed by the arithmetic checker.
4. Check the actual returned files, then independently review explanation quality and observed app state. No transaction is performed by this handoff.

## OpenClaw through the existing adapter

First follow the complete [repository commissioning guide](../../../docs/computer-work.md), including prompt-injection, interruption, wrong-account and duplicate-dispatch drills. A task must have its **exact normalized digest** admitted by the operator; do not derive approvals automatically from untrusted job metadata.

1. Copy [worker-profiles.example.json](worker-profiles.example.json) outside the repository into protected operator configuration. Set the actual endpoint and agent ID, unique deployment ID (chain ID plus registry), time/size limits and token variable. The example is **live mode but has no admitted jobs** and is never loaded by the offline rehearsal.
2. Provision `COMPUTER_WORK_OMEGA_TOKEN` through your protected environment or secret manager. Set absolute `COMPUTER_WORK_PROFILES_FILE` and `COMPUTER_WORK_STATE_DIR`; the journal must be persistent, backed up and shared by dispatchers for the deployment. Never put tokens in a task or report.
3. Build the existing adapter and inspect the task:

   ```bash
   npm run build:orchestrator
   node demo/One-Box/computer-work/run.cjs inspect /absolute/run/solaris/task.json
   ```

4. After inspecting the normalized task, add `{ "jobId": "123", "taskSha256": "REVIEWED_64_HEX_DIGEST" }` to the `omega` profile's `approvedJobs`. Use a unique positive job ID appropriate to your actual deployment; `123` is an example, not an instruction to reuse a job. Any task/origin change requires new review and admission.
5. A standalone commissioning call performs **real worker actions**:

   ```bash
   node demo/One-Box/computer-work/run.cjs run /absolute/run/solaris/task.json 123
   ```

   It creates a receipt and persistent dispatch state, not a settlement transaction. Extract the returned UTF-8 artifacts into a new candidate directory, retain their hashes and preserve the journal. The current adapter supports bounded JSON/CSV/Markdown/plain text, not arbitrary screenshot or office-file transport. Binary evidence needs a separately commissioned store.

6. For marketplace execution, use `category: "computer-work"` and `metadata.computerWork: <reviewed task>` in the specification; configure registered agent/validator identities, the actual registry, stake/tax prerequisites and the dedicated orchestrator pipeline. Publish and verify the exact specification bytes before creating the job. Reuse the existing adapter; do not add a second unjournaled dispatch path.

The example gateway time/response limits are guardrails, not guaranteed tool-use or spending limits. Reconcile actual provider usage. If an attempt times out or reports `COMPUTER_WORK_OUTCOME_UNKNOWN`, stop the worker through gateway/host controls and inspect real effects. Do not delete the journal or retry the same job automatically. Removing admission blocks future dispatch, not work already running.

## Check a returned candidate

Run from the repository root, replacing both paths:

```bash
node demo/LARGE-SCALE-OMEGA-BUSINESS-3/computer-work/checker.cjs \
  /absolute/original-run/solaris/input.json \
  /absolute/separate-candidate/candidate.json
```

Exit **0** means the independent arithmetic/schema checks passed; exit **1** rejects the candidate. Each input/candidate is limited to 128 KiB. The checker requires the original source-byte SHA-256, complete unique rows, exact integer-string calculations, correct eligibility/decision rules and explicit `productionApproved: false` / `settlementApproved: false`. Passing is insufficient to accept a dossier, authenticate sources, prove real application changes or authorize settlement.

A separate reviewer must inspect rights, source/application state, exceptions, dossier quality and observed external effects. Preserve rejected evidence. Use a separately admitted correction job or the established dispute process. Settlement belongs to the existing authorized contract flow and separate signer after acceptance and required finality.

## Extending the opportunity

Add one well-defined work category at a time: task inputs, least-privilege access, bounded actions, independently checkable outputs, rejection examples, review costs, actual usage metering and reliability evaluation. The three fixtures establish the pattern, not coverage of every human occupation. The $40T/year figure remains the project's unverified planning assumption; track accepted customer work and earned marketplace fees separately.
