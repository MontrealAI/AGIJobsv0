# AGI Jobs v0 Non-Technical Deployment Guide

This guide walks contract owners and program managers through deploying the AGI Jobs v0 stack without writing code. It wraps the one-click deployment scripts, container bundle, and monitoring utilities that ship with the repository so you can launch, observe, and roll back the platform from a laptop or workstation.

## Quick reference checklist

| Phase | Command(s) | Artefacts |
| --- | --- | --- |
| Preflight | `npm install`<br>`npm run deploy:checklist` | Verifies toolchain locks, configs, and deployment inputs. |
| Contracts | `npm run deploy:oneclick:auto -- --config deployment-config/<network>.json --network <network> --compose` | Broadcasts contracts, rewrites `deployment-config/oneclick.env`, optionally launches Docker Compose. |
| Runtime | `docker compose --env-file deployment-config/oneclick.env up --build -d` | Spins up APIs, gateways, UIs, and support services defined in `compose.yaml`. |
| Monitoring | `npm run observability:smoke` | Confirms Prometheus, Alertmanager, and Grafana templates ship with expected jobs, alerts, and dashboards. |
| Rollback | `docker compose --env-file deployment-config/oneclick.env down`<br>`git checkout <previous-tag>`<br>`npm run deploy:env -- --input <path-to-archived-manifest>.json --output deployment-config/oneclick.env --force` | Restores prior release artefacts and environment wiring. |

## 1. Prerequisites

1. **Install toolchain:** Docker Desktop (or the Docker Engine CLI), Node.js 18+ (see `.nvmrc`), npm 9+, and Git.
2. **Access secrets:** Obtain RPC URLs, API tokens, and multisig addresses for the target network. Store them outside Git until you populate `deployment-config/oneclick.env`.
3. **Clone the repository:**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0
   cd AGIJobsv0
   npm install
   ```
   The install step aligns local dependencies with CI expectations before you trigger the guided deployment scripts.【F:package.json†L317-L331】【F:.github/workflows/ci.yml†L27-L79】

## 2. Prepare deployment inputs

1. Copy the environment template and populate the secrets you collected:
   ```bash
   cp deployment-config/oneclick.env.example deployment-config/oneclick.env
   ```
2. Duplicate the sample deployer manifest and customise addresses, treasury accounts, and governance controls for your environment:
   ```bash
   cp deployment-config/deployer.sample.json deployment-config/<network>.json
   ```
3. Run the deployment checklist to confirm required files, fee schedules, and owner controls are in place before broadcasting transactions:
   ```bash
   npm run deploy:checklist
   ```
   The checklist mirrors the CI preflight to guard against missing env variables or misconfigured governance thresholds.【F:package.json†L317-L323】【F:.github/workflows/ci.yml†L40-L71】
4. Optionally seed the environment file from a previous deployment manifest:
   ```bash
   npm run deploy:env -- --input docs/deployment-addresses.json --template deployment-config/oneclick.env --output deployment-config/oneclick.env --force
   ```
   The generator replaces address keys (registry, stake manager, reputation engine, etc.) so container services resolve the correct on-chain counterparts.【F:scripts/v2/generate-oneclick-env.ts†L18-L120】

## 3. Run the guided one-click deployment

1. Launch the wizard in non-interactive mode when you are ready to deploy:
   ```bash
   npm run deploy:oneclick:auto -- --config deployment-config/<network>.json --network <network> --compose --detach
   ```
2. The wrapper script chains three actions:
   - Ensures `deployment-config/oneclick.env` exists (copying from the template if necessary).【F:scripts/v2/oneclick-wizard.ts†L48-L88】
   - Executes `npm run deploy:oneclick` with your JSON manifest and network so contracts deploy with the intended parameters.【F:scripts/v2/oneclick-wizard.ts†L104-L133】
   - Rewrites `deployment-config/oneclick.env` with the emitted addresses by invoking the generator above.【F:scripts/v2/oneclick-wizard.ts†L135-L147】
   - Optionally calls Docker Compose using the repo’s `compose.yaml` bundle; pass `--no-compose` if you prefer to launch services manually later.【F:scripts/v2/oneclick-stack.ts†L34-L79】【F:scripts/v2/oneclick-wizard.ts†L149-L180】
3. Capture the generated manifest under `reports/deployments/` (or your preferred archive folder) so you can restore specific releases during rollbacks. The wizard writes the latest manifest to `deployment-config/latest-deployment.json`; copy or move that file to your archival location after each run.

## 4. Launch and manage the runtime stack

1. Bring the services online if you skipped the Compose step or need to restart:
   ```bash
   docker compose --env-file deployment-config/oneclick.env up --build -d
   ```
2. The Compose bundle exposes the core surfaces listed below:

   | Service | Port | Purpose |
   | --- | --- | --- |
   | `meta-api` | 8000 | Aggregated API entrypoint for validator dashboards and orchestration clients.【F:compose.yaml†L28-L44】 |
   | `orchestrator` | 8080 | Mission control API used by agents, bridges, and portals; persists state under `/data/orchestrator`.【F:compose.yaml†L46-L69】 |
   | `agent-gateway` | 8090 | Telemetry gateway with local storage for logs and queueing.【F:compose.yaml†L71-L88】 |
   | `alpha-bridge` | 50052 | gRPC bridge that forwards orchestration traffic to Alpha agents.【F:compose.yaml†L90-L105】 |
   | `bundler` | 4337 | ERC-4337 bundler for smart account operations.【F:compose.yaml†L107-L116】 |
   | `paymaster-supervisor` | 4000 | Paymaster policy daemon for sponsorship approvals.【F:compose.yaml†L118-L127】 |
   | `attester` | 7000 | Attestation microservice for validation proofs.【F:compose.yaml†L129-L138】 |
   | `notifications` | 8075 | Operator notification service storing artefacts under `/data`.【F:compose.yaml†L140-L153】 |
   | `validator-ui` | 3000 | Validator-facing dashboard (Next.js).【F:compose.yaml†L155-L168】 |
   | `enterprise-portal` | 3001 | Enterprise portal for mission owners.【F:compose.yaml†L170-L183】 |
   | `anvil` | 8545 | Local Ethereum testnet used for dry-runs (swap to your RPC in production).【F:compose.yaml†L20-L27】 |

3. Stream logs for any service with:
   ```bash
   docker compose --env-file deployment-config/oneclick.env logs -f <service>
   ```
4. Shut down the stack when pausing operations:
   ```bash
   docker compose --env-file deployment-config/oneclick.env down
   ```

## 5. Continuous integration guardrails

1. GitHub Actions enforce three layers of protection:
   - **ci (v2):** linting, unit tests, Hardhat compilation, and monitoring template validation on every PR and push to `main`.【F:.github/workflows/ci.yml†L1-L119】
   - **containers:** builds, vulnerability scans, and (on main) multi-arch pushes for orchestrator, gateway, attester, and UI images.【F:.github/workflows/containers.yml†L1-L78】
   - **orchestrator-ci:** lightweight TypeScript compilation for orchestrator changes to catch regressions quickly.【F:.github/workflows/orchestrator-ci.yml†L1-L32】
2. Before approving a deployment, verify these workflows are green for the release commit. Non-technical operators can check the **Actions** tab, confirm required contexts, and download artefacts such as `reports/python-coverage/unit.xml` when auditors request evidence.【F:.github/workflows/ci.yml†L58-L117】
3. To mirror CI locally, run:
   ```bash
   npm test
   npm run lint:ci
   npm run monitoring:validate
   ```
   These commands are optional for non-technical operators but help when validating hotfix branches prior to multisig approval.【F:package.json†L317-L356】【F:.github/workflows/ci.yml†L58-L99】

## 6. Rollback and recovery

1. **Stop services:**
   ```bash
   docker compose --env-file deployment-config/oneclick.env down
   ```
2. **Restore code:** Checkout the last known-good tag or commit.
   ```bash
   git checkout <previous-release>
   npm install
   ```
3. **Rehydrate environment:** Use the archived manifest to repopulate `deployment-config/oneclick.env`:
   ```bash
   npm run deploy:env -- --input <path-to-archived-manifest>.json --output deployment-config/oneclick.env --force
   ```
   This rewrites address keys (registry, stake manager, reputation engine, etc.) to the previous values so containers reconnect to the stable contracts.【F:scripts/v2/generate-oneclick-env.ts†L18-L120】
4. **Re-deploy (if required):** Re-run the wizard with `--no-compose` to redeploy contracts matching the archived config. If no on-chain changes are needed, skip this step and relaunch Compose with the restored env file.
5. **Validate:** Run `npm run deploy:checklist` and `npm run observability:smoke` before re-opening traffic.

## 7. Monitoring and alerting

1. The repository ships production-ready Prometheus, Alertmanager, and Grafana templates under `monitoring/`. Run the smoke check after every config edit to ensure scrape jobs, alerts, and dashboards stay intact:
   ```bash
   npm run observability:smoke
   ```
   The script asserts the presence of orchestrator, bundler, paymaster, attester, IPFS, and graph-node scrape targets, mandatory alert definitions, and the dashboard schema.【F:scripts/observability-smoke-check.js†L1-L82】【F:monitoring/prometheus/prometheus.yml†L1-L55】【F:monitoring/prometheus/rules.yaml†L1-L55】
2. Import `monitoring/grafana/dashboard-agi-ops.json` into Grafana to visualise SLOs (latency, gas usage, sponsorship health).【F:monitoring/grafana/dashboard-agi-ops.json†L1-L56】
3. Point Alertmanager receivers (PagerDuty, Slack) to your production endpoints by updating secrets referenced outside the repo; the template already contains the correct routing structure.【F:monitoring/alertmanager/alerts.yaml†L1-L20】
4. For on-chain anomalies, review the telemetry produced by `agent-gateway` and `notifications` volumes, then execute the owner emergency tooling in `docs/incident-response.md`.

## 8. Operational tips for non-technical owners

- Keep the latest `deployment-config/oneclick.env` and deployment manifest under source control (without secrets) and store sensitive overrides in your secrets manager.
- Tag Git releases that match each deployment so the CI badges correspond to immutable artefacts.
- Schedule quarterly dry-runs on a testnet using the same workflow to keep muscle memory fresh.
- Pair with engineering on major upgrades; the same wizard can broadcast upgraded implementations while preserving governance safety rails.

With this playbook, a non-technical operator can confidently deploy, observe, and, if necessary, roll back AGI Jobs v0 using the turnkey scripts and configuration baked into the repository.
