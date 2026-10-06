# Meta-Agentic ALPHA operator runbook

## Choose an execution surface

| Surface | What it does | Authority |
| --- | --- | --- |
| Browser workbench | Executes six deterministic portfolio analyses; exports and checks evidence | Local synthetic computation only |
| Node CLI | Produces the same artifacts in a new directory | Local file creation only |
| OpenClaw adapter | Dispatches one exact admitted phase task to a configured worker | Protected profile, exact job/task admission and persistent journal |
| ChatGPT Work | Operator-led computer work; returns candidate JSON for local review | App permissions and the approved task scope |
| Preserved Python/TypeScript demos | Rehearse historic orchestration and scenario projections | Fixture configuration; not production authority |

## Local evidence

Use the pinned repository Node version. Run from the repository root:

```bash
npm run demo:meta-agentic-alpha:work
npm run demo:meta-agentic-alpha:review -- reports/meta-agentic-alpha/RUN_ID/evidence.json
npm run demo:meta-agentic-alpha:task -- strategise
```

The reviewer treats the artifact bytes embedded in the evidence bundle as authoritative. Sibling JSON files are convenience copies; editing one does not edit the embedded evidence. The bundled `workbench/scenario.json` is the trusted source for CLI review. A modified source is a new task requiring a new digest and admission.

Money is represented in integer micro-USDC and displayed as decimal strings with six fractional places. The 30,000 USDC synthetic budget includes a 5,000 USDC reserve; only the remaining amount can be reserved for proposed work. Review minutes are reserved per skill pool. The source-order greedy rule is deterministic, not a maximum-value optimizer.

Each phase can be recomputed from the exact source and declared rules. Dependencies establish the six-phase evaluation order. The analyses produce work orders for proposed customer projects; those projects require their own separately commissioned execution and acceptance.

To start that commissioning conversation, select a project title in the website's portfolio. Inspect its deliverable and three acceptance criteria, then download its proposal as JSON or Markdown. The dependency-free CLI equivalents are `brief ALPHA-001` and `brief-markdown ALPHA-001` through `workbench/cli.mjs`. Each export binds the synthetic source digest and leaves execution authorization false. It is not a `ComputerWorkTask` and cannot be sent to the phase worker command. Replace the synthetic assumptions, agree on permitted actions and acceptance evidence, and create a separately admitted task for the real project.

## Connected worker

First establish an isolated, operator-controlled OpenClaw runtime and a supported OpenAI provider configuration. The Gateway Responses endpoint is not itself a desktop implementation: the worker needs the permitted tools and a functioning computer provider for any screen-based task. Confirm the selected host, enabled tools and real screenshot/action behavior before admitting work. Do not expose a desktop or privileged Gateway to the public network.

The repository adapter uses `POST /v1/responses` with the selected `openclaw/<agentId>` model route. Enable and protect the Gateway endpoint according to its current documentation. Keep tokens outside the repository and public website. The example profile uses loopback, explicit response/time/token limits and an **empty** `approvedJobs` list.

The Responses endpoint is disabled by default. Its shared-token authentication grants operator access to that Gateway; an agent route or requested scope header does not reduce the token's authority. Use a separate restricted worker Gateway where appropriate. Computer actions require an available provider, OS permissions and permitted tools on the selected Gateway or paired node. After human takeover or a desktop change, obtain fresh observations rather than replaying stale screen references.

1. Install locked repository dependencies with `npm ci`.
2. Inspect an exact phase task without dispatch:

   ```bash
   npm run demo:meta-agentic-alpha:worker -- inspect strategise
   ```

3. Review the exported task, output contract, source and digest. Give the job a real deployment identity and job ID. Copy `workbench/worker-profiles.example.json` to an owner-controlled private location; configure the endpoint, isolated agent, token reference and deployment identity. Add exactly `{ "jobId": "73", "taskSha256": "THE_REVIEWED_64_HEX_DIGEST" }` only after admission. Place the token in the named environment variable through your secret-management procedure.
4. Set `COMPUTER_WORK_PROFILES_FILE` to that private file and `COMPUTER_WORK_STATE_DIR` to an absolute persistent journal directory. The demo does not read a wallet or grant signing authority.
5. Explicitly dispatch the admitted task:

   ```bash
   npm run demo:meta-agentic-alpha:worker -- run strategise 73
   ```

6. Save the returned receipt without altering its bytes. Review it against independently supplied admission values:

   ```bash
   node demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/workbench/cli.mjs review-receipt strategise RECEIPT.json 73 EXPECTED_DEPLOYMENT_ID
   ```

The example's phase scope is synthetic analysis only: no external publication, credentials, signing, purchases or execution of the proposed customer briefs. A genuinely useful customer project needs its own bounded task contract, permitted inputs, workspace, budget, acceptance tests and reserved unrelated reviewer.

### Unknown outcome and stop controls

If dispatch times out or returns an ambiguous result, the adapter records an unknown outcome. **Do not delete its journal, change the job ID to force a retry, or automatically retry.** Reconcile the protected attempt with worker records and actual effects first. An emitted receipt can be checked for content and admission binding but is unsigned and cannot establish provider provenance by itself.

Stop local observation with Ctrl+C. Stop an active worker through the operator's OpenClaw run/control surface, revoke future admission where appropriate, and preserve its journal. Closing this viewer does not cancel work already dispatched elsewhere. Desktop takeover, runtime shutdown and external side effects require the worker's actual controls; they are not simulated website buttons.

## ChatGPT Work candidate files

Download a phase work order, provide it in an operator-led Work session, and authorize only the apps and data needed for that scope. Prefer structured integrations or code where appropriate, using computer interaction for GUI-only work. Ask for the exact candidate JSON file specified by the contract.

Install the Computer Use plugin and grant the required OS permissions separately from app permissions. Current Work guidance requires Screen Recording and Accessibility on macOS; Windows computer use needs the active, unlocked desktop. Do not use screen automation to operate terminal apps, automate Work itself, or accept system security or administrator permission prompts. Keep consequential actions within explicit task authority and retain an operator stop path.

Select the matching **Review phase** beside the importer and **Candidate JSON for selected stage**, then import the file. Changing review phase, file type, job ID or deployment identity clears the old result and cancels pending checks; import again after changing scope. The separate evaluation-phase browser does not alter those review inputs. Alternatively, use:

```bash
node demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/workbench/cli.mjs review-artifact strategise CANDIDATE.json
```

This checks candidate bytes against the declared source and rules. It does not attach a provider identity, prove what occurred on the screen, or authorize settlement. This project assumes no remote ChatGPT Work dispatch endpoint.

## Verification and settlement

Content checks precede substantive independent review. Reconcile the protected journal, permitted inputs, task/deployment binding, actual effects, artifact hashes and acceptance criteria. An unrelated reviewer assesses the deliverable, including limitations and usefulness. Only the separately authorized contract validation and settlement process can authorize a payment. The new workbench does not send transactions and keeps both approval flags false.

Historical AGIALPHA treasury scenarios and example mainnet addresses belong to the preserved simulations. They do not define a USDC deployment. Never infer a deployment's chain, token, contract address or permission from a dashboard fixture.

## Reproduce the preserved collection

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/tests -q
python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/rehearse.py --out reports/meta-agentic-alpha/python-RUN_ID
```

To view a newly generated V5–V11 dashboard record, use the matching version and its JSON path (the V5–V11 CLIs print the exact command):

```bash
npm run demo:meta-agentic-alpha:serve -- --record v5 demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v5/ui/dashboard-data-v5.json
```

Open the loopback URL printed by the viewer. This builds the locked diagram dependencies into a temporary public directory and substitutes only the selected record. It does not expose the input file's directory. The record is a point-in-time copy; stop and restart the viewer after another run. A plain Python file server cannot resolve the source modules' package imports.

The second rehearsal command above exercises all eleven mission CLIs and Prime in a disposable copy with a minimal subprocess environment, collecting output in a new directory. It never treats an earlier tracked `latest_run` as fresh execution evidence. The website explicitly labels recorded snapshots and configured CI statuses.

To rebuild a standalone public site, choose an empty output directory:

```bash
node demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/build-site.mjs reports/meta-agentic-alpha/site-RUN_ID
```

Its asset manifest contains only the workbench, historical views, sanitized recorded data, reports and bundled diagram dependencies. The local server allows GET/HEAD only, checks Host/Origin, and excludes private profiles, source handlers and journals.

## Current primary guidance

Reviewed 2026-10-06:

- [OpenClaw computer use](https://docs.openclaw.ai/nodes/computer-use): Gateway or paired-node desktops require an available provider, explicit tool policy and local permissions. Observations and actions are tied to the selected runtime and display.
- [OpenClaw Responses endpoint](https://docs.openclaw.ai/gateway/openresponses-http-api): protect the enabled endpoint and route to the intended isolated agent.
- [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing): configure the boundary for the actual tools in use; a model setting alone does not isolate a desktop.
- [ChatGPT Work computer use](https://learn.chatgpt.com/docs/computer-use): desktop app interaction is permission-scoped; review the allowed apps and task authority.
- [OpenAI API computer use](https://developers.openai.com/api/docs/guides/tools-computer-use): API integrations require an execution environment and an observation/action loop. This differs from using the Work product and from calling an OpenClaw agent endpoint.

Provider models and computer drivers evolve independently of this demo. Validate their pinned deployment configuration against current official guidance; do not silently upgrade a commissioned worker or treat every keyboard/mouse task as reliably automatable.
