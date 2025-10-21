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
2. Fill in the following variables:
   - `RPC_URL` — Ethereum RPC endpoint.
   - `CHAIN_ID` — Numeric chain identifier.
   - `DEPLOYER_PRIVATE_KEY` — Hex string for deployer/relayer (DO NOT commit).
   - `OWNER_ADDRESS` — Wallet address with owner privileges.
   - `IPFS_GATEWAY` / `IPFS_API_TOKEN` — Optional if using remote IPFS.
   - `AGI_JOBS_CORE_ADDRESSES` — JSON blob pointing to deployed AGI Jobs v0 (v2) contracts.

## 3. One-Click Deployment

```bash
docker compose up --build
```

Services started:

- `culture-contracts` — Hardhat node + deployment scripts.
- `culture-orchestrator` — Arena automation API.
- `culture-indexer` — GraphQL indexer and influence calculator.
- `culture-studio` — Owner-facing UI.
- `culture-ipfs` — Optional local IPFS daemon (if enabled in compose).

Wait until logs indicate successful contract deployment and service readiness.

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

- **Culture Graph Dashboard** — Explore artifact lineage and influence rankings (powered by indexer’s PageRank).
- **Arena Scoreboard** — Review Elo changes, difficulty thermostat behaviour, and validator accuracy.
- **Weekly Reports** — Generated markdown in `reports/` summarises Culture Maturity Score (CMS) and Self-Play Gain (SPG).
- **Prometheus Metrics** — Orchestrator exports metrics at `/metrics` (requests, round durations, validator accuracy).

## 7. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| UI cannot mint artifacts | Ensure contracts are deployed, CultureRegistry is unpaused, and relayer wallet funded. Check orchestrator logs. |
| Arena rounds stuck | Inspect orchestrator logs for unresponsive agents. Use Owner Panel to cancel the round or slash stalled validators. |
| Indexer influence stale | Restart indexer container or call `POST /admin/recompute` on the indexer API. |
| High gas costs | Switch to local Anvil for demonstrations or adjust job batch sizes via config. |

## 8. Emergency Response

1. Pause all contracts via Owner Panel or direct calls (`CultureRegistry.pause()`, `SelfPlayArena.pause()`).
2. Revoke malicious identities using `owner.setRoles.ts`.
3. Slash offending validators/students via `StakeManager`.
4. Document incident in `reports/` and re-run weekly analytics to confirm containment.
5. Resume services once the root cause is resolved.

## 9. Maintenance Cadence

- Weekly: Review analytics reports, adjust difficulty parameters, rotate validator committees.
- Monthly: Regenerate Docker images, update dependencies via `npm audit fix --dry-run`, rerun CI in staging.
- Quarterly: Conduct disaster recovery drills and slashing simulations.

## 10. Support

- Slack: #agi-culture-ops
- Email: culture-ops@montreal.ai
- PagerDuty: CULTURE-OnCall (24/7)

