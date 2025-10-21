# CULTURE Demo Runbook

This runbook provides operational guidance for the CULTURE demo, enabling the platform owner to deploy, monitor, and control the system with confidence.

## 1. Prerequisites

- Docker 24+
- Node.js 20.18.1
- Access to an Ethereum RPC endpoint (local Anvil, Sepolia, or mainnet fork)
- IPFS pinning provider credentials (e.g., web3.storage, Pinata) if using managed storage
- Owner wallet with sufficient ETH for deployments and gas

## 2. Environment Configuration

1. Copy `.env.example` to `.env`.
2. Populate the mandatory variables:
   - `RPC_URL` / `CHAIN_ID` — Ethereum RPC endpoint and network identifier (defaults assume local Anvil).
   - `DEPLOYER_PRIVATE_KEY` — Account used for deployment and scripted transactions (local Hardhat key by default).
   - `SEEDER_PRIVATE_KEY` — Optional account for seeding artifacts; falls back to the deployer.
   - `OWNER_ADDRESS` — Address that will own CultureRegistry and SelfPlayArena post-deploy.
   - `AGI_JOBS_CORE_ADDRESSES` — JSON blob pointing to upstream JobRegistry, ValidationModule, StakeManager, and IdentityRegistry.
3. Optional overrides:
   - `IPFS_GATEWAY` / `IPFS_API_ENDPOINT` / `IPFS_API_TOKEN` for remote pinning providers.
   - `CULTURE_DEPLOY_OUTPUT` and `CULTURE_ENV_FILE` to adjust where deployment metadata is written.
   - Orchestrator/indexer tuning knobs (ports, polling intervals, Elo storage path).

## 3. One-Click Deployment

1. Install dependencies: `npm install --legacy-peer-deps`.
2. Compile contracts: `npx hardhat compile`.
3. Execute the deployment + configuration pipeline:
   ```bash
   npx hardhat run demo/CULTURE-v0/scripts/deploy.culture.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/owner.setParams.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/owner.setRoles.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/seed.culture.ts --network localhost
   ```
4. Start infrastructure via Docker Compose:
   ```bash
   docker compose -f demo/CULTURE-v0/docker-compose.yml up -d culture-chain culture-ipfs
   docker compose -f demo/CULTURE-v0/docker-compose.yml --profile setup run --rm culture-contracts
   docker compose -f demo/CULTURE-v0/docker-compose.yml up -d culture-orchestrator culture-indexer culture-studio
   ```
   Health checks on each container gate downstream services. Inspect `docker compose ps` to verify all statuses are `healthy`.

Named volumes isolate chain state (`culture_chain_data`), orchestrator Elo snapshots (`culture_orchestrator_state`), indexer SQLite storage (`culture_indexer_db`), and IPFS data (`culture_ipfs_data`). Remove them only when a full reset is required.

5. (Optional) Generate weekly analytics: `docker compose --profile reports run --rm culture-reports`.

## 4. Owner Workflows

### 4.1 Create a Knowledge Artifact

1. Open `http://localhost:4173` (default Culture Studio port).
2. Choose **Create Book**.
3. Describe the artifact (topic, tone, derivative relationships).
4. Approve the assistant's outline; the system will:
   - Generate the artifact content via AGI Jobs planning agents.
   - Run moderation checks.
   - Upload the artifact to IPFS.
   - Mint it on-chain via `CultureRegistry`.
5. Review the success toast; follow the link to view the artifact on IPFS and in the Culture Graph.

### 4.2 Launch a Self-Play Arena Round

1. Navigate to **Self-Play Arena**.
2. Select a base artifact, student cohort size, and target success rate.
3. Click **Launch Arena**. The orchestrator will:
   - Spin up a teacher job seeded with the artifact content.
   - Spawn student jobs and validators with commit–reveal hooks.
   - Monitor completions, run automated tests, and compute Elo/difficulty adjustments.
4. Observe real-time telemetry (teacher posted, students solved, validators revealed).
5. Review the scoreboard and difficulty charts once finalized.

## 5. Owner Controls

| Action | Method |
| --- | --- |
| Pause Culture Registry | UI Owner Panel → Pause Culture Registry |
| Resume Culture Registry | UI Owner Panel → Resume Culture Registry |
| Pause Self-Play Arena | UI Owner Panel → Pause Arena |
| Update Rewards / Fees | Run `scripts/owner.setParams.ts` with new configuration |
| Manage Agent Roles | Run `scripts/owner.setRoles.ts` to grant/revoke roles in IdentityRegistry |
| Slash Malicious Validators | Trigger `StakeManager` slash via Owner Panel or script |

All administrative transactions require the owner wallet signature. The UI relayer prompts before execution.

## 6. Monitoring & Analytics

- **Culture Graph Dashboard** — Explore artifact lineage and influence rankings (powered by indexer’s PageRank). Fallback data renders even if the indexer is offline so the UI remains demonstrable.
- **Arena Scoreboard** — Review Elo changes, difficulty thermostat behaviour, and validator accuracy. Telemetry pulls from `GET /arena/scoreboard` every 5 seconds.
- **Prometheus Metrics** — Orchestrator exports metrics at `http://localhost:4005/metrics` (requests, round durations, validator accuracy). Scrape into your monitoring stack or curl directly during incident response.
- **Indexer Health** — `http://localhost:4100/healthz` returns JSON including a timestamp. Log tailing at `/var/log/culture-indexer` (volume) aids investigations.
- **Weekly Reports** — Regenerate Markdown in `reports/` using `npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts`. Inputs are versioned JSON snapshots under `data/analytics/` for reproducibility.

## 7. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| UI cannot mint artifacts | Ensure contracts are deployed, CultureRegistry is unpaused, and relayer wallet funded. Check orchestrator logs. |
| Arena rounds stuck | Inspect orchestrator logs for unresponsive agents. Use Owner Panel to cancel the round or slash stalled validators. |
| Indexer influence stale | Restart `culture-indexer` or call `POST http://localhost:4100/admin/recompute`. Validate the container’s `/var/log/culture-indexer` volume for errors. |
| Compose service stuck in `starting` | Inspect health check endpoint (see Section 6). For persistent failures run `docker compose logs <service>`; remove the associated named volume only after collecting diagnostics. |
| High gas costs | Switch to local Anvil for demonstrations or adjust job batch sizes via config. |

## 8. Emergency Response

1. Pause all contracts via Owner Panel or direct calls (`CultureRegistry.pause()`, `SelfPlayArena.pause()`).
2. Revoke malicious identities using `owner.setRoles.ts`.
3. Slash offending validators/students via `StakeManager`.
4. Document incident in `reports/` and re-run weekly analytics to confirm containment.
5. Resume services once the root cause is resolved (unpause contracts, restart docker services, rerun `owner.setRoles.ts` if identities changed).

## 9. Maintenance Cadence

- Weekly: Review analytics reports, adjust difficulty parameters, rotate validator committees.
- Monthly: Regenerate Docker images, update dependencies via `npm audit fix --dry-run`, rerun CI in staging.
- Quarterly: Conduct disaster recovery drills and slashing simulations.

## 10. Support

- Slack: #agi-culture-ops
- Email: culture-ops@montreal.ai
- PagerDuty: CULTURE-OnCall (24/7)

