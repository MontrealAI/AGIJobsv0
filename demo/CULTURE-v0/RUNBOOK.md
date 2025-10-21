# CULTURE Demo Operations Runbook (Owner Edition)

This runbook ensures a non-technical platform owner can deploy, operate, and govern the 🎖️ CULTURE 👁️✨ demo with confidence. Each step includes intent, primary flow, alternate checks, and emergency procedures. Cross references point back to the sprint playbook for implementation details.

## 1. Prerequisites & Environment

| Item | Purpose | Triple Verification |
|------|---------|--------------------|
| Docker ≥ 24.x | Container orchestration | `docker version`, sample compose, uninstall test |
| Node.js ≥ 20.x | Script execution fallback | `node -v`, npx dry-run, integrity hash |
| Git access | Pulling updates & CI hooks | `git status`, signed commits, branch protection |
| Wallet (owner) | Contract control actions | Hardware wallet pairing, dry-run tx, pausable test |
| .env file | Service configuration | Checksums vs template, diff review, encrypted backup |

## 2. One-Click Deployment

1. **Clone & Prepare**
   - `git clone https://github.com/MontrealAI/AGIJobsv0.git`
   - `cd demo/CULTURE-v0`
   - `cp .env.example .env` → populate using the table below.

2. **Environment Variables (Excerpt)**

| Variable | Description | Validation |
|----------|-------------|------------|
| RPC_URL | JSON-RPC endpoint (recommended: Base Sepolia) | `curl $RPC_URL` health check |
| DEPLOYER_KEY | Relayer private key (hex) | Cold storage backup, balance check |
| OWNER_ADDRESS | Wallet controlling contracts | Matches hardware wallet, test signature |
| IPFS_PROJECT_ID / SECRET | Pinning service credentials | API token scope validation |
| CULTURE_INITIAL_AGENTS | Comma-separated addresses | IdentityRegistry cross-check |

3. **Launch Stack**
   - `docker compose up --build`
   - Verify services: `docker ps` should list `culture-contracts`, `arena-orchestrator`, `culture-graph-indexer`, `culture-studio`.
   - Health probes: `curl localhost:8080/health` (orchestrator), `curl localhost:8000/health` (indexer).

4. **Contract Deployment**
   - If not auto-run, execute: `docker compose exec culture-contracts npx hardhat run scripts/deploy.culture.ts --network local`.
   - Persist addresses into `config/culture.json` and `.env` (orchestrator/UI containers reload automatically).

## 3. Golden Paths

### 3.1 Create a Culture Artifact (“Book”)

1. Open `http://localhost:3000`.
2. Click **Create Knowledge Artifact**.
3. Provide prompt (e.g., "Compose a five-chapter manifesto on cooperative AI self-play").
4. Review AI-generated outline → confirm.
5. When final content is ready, click **Mint Artifact**.
6. Verify toast confirmation and artifact card (includes Artifact ID, IPFS CID, influence snapshot).
7. Cross-check: `docker compose logs culture-graph-indexer | grep ArtifactMinted` should show event ingestion.

### 3.2 Launch Self-Play Arena

1. Navigate to **Arena Control Center**.
2. Select base artifact (dropdown auto-populated from indexer).
3. Configure participants (# students, validators) and target success rate.
4. Click **Start Arena**.
5. Monitor progress timeline (Teacher ready → Students running → Validators grading → Round finalized).
6. After completion, inspect **Scoreboard** tab for Elo updates and difficulty trajectory.
7. Confirm on-chain event via `docker compose logs culture-contracts | grep RoundFinalized`.

### 3.3 Generate Metrics Reports

1. Ensure orchestrator has produced at least one artifact and one arena round.
2. Run inside orchestrator container: `npm run generate:reports`.
3. Retrieve Markdown outputs in `reports/` directory.
4. Upload to documentation portal or share with stakeholders.

## 4. Administrative Controls

| Action | Location | Procedure | Verification |
|--------|----------|-----------|--------------|
| Pause CultureRegistry | UI Owner Panel or Hardhat task | Toggle **Pause Artifact Minting**; confirm transaction hash | Attempt mint (should revert), `CultureRegistry.Paused` event |
| Unpause CultureRegistry | Same | Toggle back | Successful mint allowed |
| Pause SelfPlayArena | UI Owner Panel or Hardhat task | Toggle **Pause Arena** | Start Arena button disabled, event emitted |
| Update Validator Committee Size | Hardhat script `owner.setParams.ts` | Provide new size, run script | Read `SelfPlayArena.committeeSize()` via console |
| Add Agent Identity | Script `owner.setRoles.ts` | Input address + role | `IdentityRegistry.hasRole(address, role)` true |
| Rotate Relayer Key | Update `.env`, restart orchestrator container | Signature test from new key, old key zeroed |

## 5. Monitoring & Observability

- **Logs**: `docker compose logs -f <service>`; log levels adjustable via env vars.
- **Metrics**: Prometheus endpoint at `:9100/metrics` (orchestrator) for request/round stats.
- **Alerts**: Sample Grafana dashboard JSON provided in `/monitoring` (import into Grafana).
- **Health Checks**:
  - UI: `GET /healthz`
  - Orchestrator: `GET /health`
  - Indexer: `GET /health`
  - Contracts: Hardhat script `scripts/status.ts`

## 6. Troubleshooting Scenarios

| Symptom | Likely Cause | Resolution | Secondary Check |
|---------|--------------|-----------|-----------------|
| Artifact mint fails | Registry paused / role missing | Unpause, assign AUTHOR role | Foundry call `CultureRegistry.paused()` |
| Arena stuck “Validating” | Validator job timeout | Use emergency finalize script `scripts/finalize.force.ts` | Inspect validator stakes for slashing |
| Scoreboard empty | Indexer not synced | Restart indexer container, replay from block 0 | Query `GraphQLAPI` manually |
| UI shows stale data | Websocket drop | Refresh page, ensure orchestrator emits SSE | Browser console for network errors |
| High gas usage | Chain congestion | Switch RPC to rollup or adjust gas config in `culture.json` | Monitor `gas-snapshots/` delta |

## 7. Emergency Procedures

1. **Immediate Pause**
   - Run `npx hardhat --network <net> call --function pauseAll` script (bundles both contracts).
   - Notify stakeholders via pre-defined channels.

2. **Stake Slashing**
   - Identify malicious validator addresses.
   - Execute `StakeManager.slash(address, evidence)` using owner wallet.
   - Document incident in `reports/incidents/`.

3. **Rollback / Redeploy**
   - Backup current database snapshots (`docker cp` indexer volumes).
   - Re-run deployment scripts after fix.
   - Reindex chain events to rebuild culture graph.

4. **Security Incident Response**
   - Rotate all secrets stored in `.env`.
   - Audit relayer machine for intrusion.
   - Engage external auditors if breach confirmed.

## 8. Maintenance Calendar

| Frequency | Task | Responsible |
|-----------|------|-------------|
| Daily | Check CI status, review logs for anomalies | Owner / DevOps |
| Weekly | Generate CMS & SPG reports, review top artifacts | Owner |
| Monthly | Rotate relayer keys, update dependencies (`npm audit`, `pnpm outdated`) | DevOps |
| Quarterly | Pen-test smart contracts, chaos drill (pause/unpause, validator failure) | Security |

## 9. Knowledge Base

- **Sprint Playbook**: `README.md`
- **Architecture Diagrams**: `docs/culture-architecture/`
- **API Contracts**: `backend/arena-orchestrator/openapi.yaml`
- **GraphQL Schema**: `indexers/culture-graph-indexer/schema.graphql`
- **CI Dashboard**: GitHub Actions → `CULTURE Pipeline`

## 10. Reflection Checklist

Before concluding any operations session:
- [ ] All services healthy (health checks green).
- [ ] No unresolved alerts in monitoring stack.
- [ ] Latest artifacts and rounds documented.
- [ ] Backups scheduled/verified.
- [ ] Runbook updated with lessons learned.

> **Remember:** The owner retains absolute control—pause switches, parameter levers, and validator governance ensure the platform remains safe, transparent, and relentlessly empowering.
