# One-Box — describe work, inspect a plan, follow the evidence

A guided AGI Jobs workspace for learning the job lifecycle and operating a configured deployment. Start with the offline preview: no wallet, API key, Docker or blockchain is needed. Move to connected mode only after checking your deployment.

[**Try the browser preview**](https://montrealai.github.io/AGIJobsv0/experiments/one-box/) · [Demo observatory](https://montrealai.github.io/AGIJobsv0/) · [Static console source](../../apps/onebox-static/) · [One-Box CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/onebox-ci.yml)

## Choose your path

| Path | What happens | What you need |
| --- | --- | --- |
| **Offline preview — start here** | A session-local job moves through assignment, submission, review and finalization. Export labelled simulation evidence. | Pinned Node.js and repository dependencies |
| **Connected Node runtime** | The real HTTP API plans and executes supported actions against your configured services. Guest mode uses the relayer; expert mode prepares wallet calldata. | Reviewed contracts, RPC, a reviewed planner configuration, pinning service, funded relayer and API token |
| **Docker UI** | The same static console, offline by default; optionally enable the local connected profile. | Docker Engine and Compose 2.24+ |

The preview is a teaching model. It produces no real work, independent review, funds transfer, blockchain receipt, maintainer signature or production approval. The current connected service supports **post job and finalize**, plus status and governance previews. Assignment, submission, review and disputes in the preview demonstrate the wider lifecycle; they are not claims that those connected API actions are implemented here.

## Start in three commands

From a checked-out repository root, select the version in `.nvmrc` (currently Node.js 22.23.3), then:

```bash
nvm use
npm ci
npm run demo:onebox:launch -- --demo
```

Open the printed local URL if the browser does not open automatically. The console binds to `127.0.0.1:4173`. Use `--no-browser` on remote terminals, or `--ui-port 4174` if that port is occupied. Press Ctrl+C to stop. `--help` lists supported options; unknown options and malformed ports fail with an explanation.

After installation, the preview uses local assets only. Its server enforces `connect-src 'none'`: API, RPC and provider requests are disabled even if an old endpoint is saved in your browser. Jobs and approvals reset on reload. Export evidence before leaving.

## Your first complete mission

The suggested prompts above the composer run this example. Send each request, inspect the plan and choose **Confirm plan** or **Cancel**. Typing YES or NO also works.

| Step | Request | Expected outcome |
| --- | --- | --- |
| 1 | `Post a source-cited software audit for 5 AGIALPHA over 7 days` | Preview job 1 is created; no value moves. |
| 2 | `Apply job 1` | A simulated worker is assigned. |
| 3 | `Submit job 1 with a reproducible report` | Text evidence is recorded for that job. |
| 4 | `Validate job 1` | A simulated approving review is recorded. |
| 5 | `Finalize job 1` | The validated preview job becomes finalized. |
| 6 | **Export preview evidence** | JSON contains jobs and ordered events, `simulated: true`, `chainTransactions: 0` and `productionApproved: false`. |

**Explore a failure:** finalize immediately after step 1. The console rejects it and leaves the job unchanged. Continue with steps 2–5. Alternatively, use `Validate job 1 reject` after submission, followed by `Dispute job 1`. Check any job with `Status job 1`. A cancelled plan changes no job state. Each confirmation is usable only once.

**Find your way around:** the status board follows your jobs; **Advanced** shows the plan, response and endpoint configuration; the expandable **Owner governance controls** retain the parameter and proposal tools without crowding the first-run experience. Use keyboard Tab/Enter for controls and focus the conversation to scroll it. On small screens the controls stack vertically.

Preview accepts text only. Attachment-aware connected ICS plans retain the IPFS upload flow. A job-intent response cannot silently accept an unsupported attachment: the console explains the limitation, keeps the files queued, and **Clear attachments** lets you continue without uploading them.

## Connect a local or test deployment

1. Copy `.env.example` to `.env` **inside this directory**, then replace every placeholder. The launcher reads root `.env`, then this demo's `.env`, then exported shell values; explicit CLI options win. Do not commit credentials.
2. Configure `RPC_URL`, `CHAIN_ID`, `JOB_REGISTRY_ADDRESS`, `STAKE_MANAGER_ADDRESS`, `SYSTEM_PAUSE_ADDRESS`, `ONEBOX_RELAYER_PRIVATE_KEY` and `ONEBOX_API_TOKEN`. Generate a private API token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use a dedicated, limited local/test relayer and verify its funding and contract permissions.
3. Configure `ALPHA_ORCHESTRATOR_URL` / `ALPHA_ORCHESTRATOR_TOKEN` for the planner and a reachable `IPFS_API_URL` or the pinning credentials supported by the [execution service](../../apps/orchestrator/execution.ts). Without a remote planner endpoint, PlannerClient uses limited local heuristics and labels that source. This is not a real provider integration. Pinning and chain operations still require actual services.
4. Run the read-only doctor before starting the servers:

```bash
npm run demo:onebox:doctor -- --strict
npm run demo:onebox:launch -- --no-browser
```

The launcher builds the static UI and packaged server, checks RPC chain identity and configured contract bytecode, then waits for health **and authenticated job status** before announcing readiness. Failed startup stops its child process; unexpected backend exit stops the UI. The strict doctor also checks gas balance, owner/pause reads and port availability. Unresolved reads and unmet prerequisites fail the strict check; passing is not a security audit or target-network commissioning.

In the browser, open **Advanced → Set API token** and enter the same backend token. It stays in page memory and clears on reload or endpoint changes. Launch links and public runtime assets never contain the token. Older saved API tokens are removed. The UI endpoint/prefix preferences can persist; bearer credentials do not.

To prepare calldata without submitting it, launch with `--mode expert`. The destination, chain and calldata appear in Advanced; the UI explicitly says no transaction was sent. Review and submit through your wallet separately. Guest mode can submit through the configured relayer after confirmation.

Connected approvals bind the complete intent, expire after 15 minutes and are consumed before execution begins. A repeated, changed, expired or unknown approval fails closed. One-Box keeps at most 1,000 outstanding approvals in a **single server process**; restarting invalidates them. After any ambiguous network/provider failure, inspect status, receipts and the chain before creating another plan. This prevents blind retries; it does not provide distributed, exactly-once settlement across replicas.

Both local servers bind to loopback by default. CORS permits the configured UI origin. For deliberate remote access, use authenticated HTTPS infrastructure and an explicit `ONEBOX_CORS_ALLOW` allowlist; do not expose a funded relayer as an unauthenticated public demo.

## Docker path

[Compose 2.24+](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/) supports the optional environment files used here. From the repository root:

```bash
docker compose -f demo/One-Box/docker-compose.yaml up --build --wait
```

Open <http://127.0.0.1:4173>. This starts only the offline UI, running as an unprivileged user with a read-only filesystem. No secrets are written into browser assets. The UI image supports `PORT` at runtime.

For the **disposable local connected stack**, first review your local deployment configuration. `make -f demo/One-Box/Makefile bootstrap` starts the pinned Anvil image and invokes the existing local deployment wizard. Configure the resulting addresses, planner, pinning, API token and funded relayer; inspect pause state and owner permissions. Generated `deployment-config/oneclick.env` values are loaded before the demo `.env`; `JOB_REGISTRY` and `STAKE_MANAGER` aliases are accepted by the backend. Bootstrap is an operator deployment step, not a substitute for reviewing these prerequisites.

Set `ONEBOX_PUBLIC_ORCHESTRATOR_URL=http://127.0.0.1:8080` in the demo `.env`, then:

```bash
docker compose --env-file demo/One-Box/.env -f demo/One-Box/docker-compose.yaml --profile connected up --build --wait
```

The browser uses the host API URL; container-to-container RPC uses `http://anvil:8545`. Published ports remain bound to loopback. Anvil state is disposable: restarting/recreating it can invalidate deployed addresses. Re-deploy and re-check before use. `down` keeps the orchestrator volume; `make ... clean` explicitly deletes demo volumes while retaining `.env`.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Missing/placeholder configuration | Use `--demo` for offline learning, or replace all named values for connected mode. |
| Port unavailable | Stop the owning process or choose `--ui-port` / `--orchestrator-port`. The doctor expects ports to be free before launch. |
| API token rejected / 401 / 403 | Check the server token and enter it under Advanced again after reload. Check the exact CORS origin if authentication is correct. |
| No code / wrong chain / unknown owner or pause state | Check network and deployment addresses. Never interpret an unreadable pause state as unpaused. |
| Backend readiness timeout | Inspect backend output, RPC connectivity, deployed ABI compatibility and API authentication. No ready banner is emitted prematurely. |
| Planner or pinning unavailable | Configure the real provider endpoints. The connected runtime does not silently substitute simulated success. |
| Plan expired or already attempted | Inspect the prior outcome before planning again. Do not blindly retry a potentially submitted transaction. |
| Cannot finalize | In preview, submit evidence and approve review first. In connected mode, satisfy the deployed contract's rules. |
| Browser will not open | Copy the printed URL; `--no-browser` suppresses automatic opening. |
| Local configuration changes do not affect Docker | Recreate the relevant containers. Pass `--env-file demo/One-Box/.env` when interpolating Compose settings. |

## Systems Map

```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_One_Box[[Demo → One Box]]
    demo_One_Box --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

The original systems map is retained. The concrete demonstration connects operator intent, an inspectable plan, execution outcomes and owner oversight. Real-world readiness additionally requires authentic maintainer signing, configured providers, independent security review, operational monitoring and target-network commissioning; the preview and automated fixtures do not certify those milestones.

## Directory guide and verification

| Location | Responsibility |
| --- | --- |
| `bin/start-onebox.cjs`, `lib/launcher.js` | CLI configuration, preflight, readiness and lifecycle cleanup |
| `bin/doctor.cjs`, `lib/rpc.js`, `lib/diagnostics.js` | Read-only readiness and strict RPC decoding |
| `lib/static-server.cjs`, `bin/serve-ui.cjs` | Credential-free static hosting and Docker runtime |
| `config/` | Reserved local configuration directory |
| `scripts/entrypoint.sh`, `Dockerfile.ui`, `docker-compose.yaml` | Container entrypoint and local service topology |
| `scripts/browser-qa.mjs`, `test/` | Browser integration and regression checks |
| `../../apps/onebox-static/` | Canonical UI shared by CLI and Docker; the separate `apps/onebox` console is retained |

```bash
npm run demo:onebox:test
npm run build:orchestrator
node --test apps/orchestrator/dist/apps/orchestrator/__tests__/{oneboxRouter,planApprovals}.test.js
npm run onebox:static:build
npm run verify:sri
npx playwright install chromium
npm run demo:onebox:qa
```

The browser check exercises cancellation, lifecycle ordering, evidence export, reload behavior, mobile overflow, WCAG AA checks and the **actual packaged HTTP router with synthetic provider/chain service results**. Reports and screenshots go to `reports/onebox/`. CI additionally builds and starts the read-only Docker UI and verifies the connected container startup. These checks are scoped evidence, not an independent audit.

Changes should land through a reviewed pull request with required checks green. Consult [RUNBOOK.md](../../RUNBOOK.md) and [OperatorRunbook.md](../../OperatorRunbook.md) for operational ownership and escalation. Keep secrets outside source control, preserve diagrams and useful operator materials, and link release evidence through the repository's existing release-manifest process.
