# CULTURE Demo Runbook

This runbook empowers the non-technical platform owner to supervise, configure, and pause the
🎖️ CULTURE 👁️✨ demo safely. Every control surface is mirrored in automated scripts so that the
owner can operate the system via a single `docker compose` command and a lightweight CLI.

## 1. Bootstrapping the Stack

1. **Prepare environment variables**
   - Copy `.env.example` to `.env`.
   - Fill in RPC endpoints, deployer/relayer keys, IPFS credentials, and owner address. Use
     hardware wallets for production keys.
2. **Launch services**
   ```bash
   docker compose up -d
   ```
   This brings up:
   - A dedicated Hardhat node seeded with AGI Jobs v0 (v2) core contracts.
   - The CULTURE CultureRegistry and SelfPlayArena deployments (auto-migrated on startup).
   - The arena orchestrator, culture graph indexer, and Culture Studio UI.
3. **Verify health**
   - `docker compose ps` should show all services healthy.
   - Visit `http://localhost:3000` to open Culture Studio.

## 2. Day-to-day Operations

| Action | Tooling | Notes |
|--------|---------|-------|
| Create a new knowledge artifact | Culture Studio → "Create Book" workflow | Assistant walks owner through prompt refinement, IPFS upload, and on-chain minting. |
| Launch self-play arena | Culture Studio → "Start Arena" wizard | Streams live telemetry: teacher problem creation, student solves, validator commits, difficulty/Elo updates. |
| Inspect culture graph | Culture Studio → "Culture Graph" tab | Interactive DAG with influence scores, lineage depth, and derivative job launcher. |
| Review weekly reports | `reports/` directory or UI "Insights" tab | Markdown reports render inside UI for convenience. |

## 3. Owner Controls

The owner wallet (configured in `.env`) retains ultimate authority over demo parameters.

- **Pause / Unpause contracts**
  ```bash
  pnpm ts-node scripts/owner/pause.ts --contract cultureRegistry --network local
  pnpm ts-node scripts/owner/unpause.ts --contract selfPlayArena --network local
  ```
- **Adjust validator committee size**
  ```bash
  pnpm ts-node scripts/owner/set-arena-params.ts --committee 5 --baseReward 10
  ```
- **Manage agent allowlist**
  ```bash
  pnpm ts-node scripts/owner/set-role.ts --address 0xAgent --role TEACHER
  ```
- **Emergency stop**: if anomalous behaviour is detected, pause both CultureRegistry and
  SelfPlayArena, then stop docker services with `docker compose down`. Investigate orchestrator
  logs via `docker compose logs arena-orchestrator`.

## 4. Monitoring & Alerting

- Grafana dashboards (port 3100) expose metrics for:
  - Artifact mint rate, citation degree distribution, influence score percentiles.
  - Arena round duration, validator agreement %, Elo variance.
- Prometheus alert rules trigger Slack/webhook notifications when:
  - Validator disagreement exceeds threshold.
  - Difficulty oscillates rapidly (potential PID instability).
  - Contracts remain paused longer than configured SLA.

## 5. Upgrades & Maintenance

1. Pull latest code: `git pull origin main`.
2. Rebuild images: `docker compose build`.
3. Apply DB migrations (indexer/orchestrator) with `pnpm prisma migrate deploy` (if applicable).
4. Redeploy contracts using `pnpm hardhat run scripts/deploy.culture.ts --network ...`.
5. Run regression suite:
   ```bash
   pnpm turbo run test --filter=culture-*
   pnpm cypress run --config-file demo/CULTURE-v0/apps/culture-studio/cypress.config.ts
   ```

## 6. Incident Response Checklist

1. **Detect** – Alert fires or owner notices UI anomaly.
2. **Stabilise** – Pause contracts, stop new rounds, snapshot orchestrator state.
3. **Diagnose** – Inspect orchestrator/indexer logs, cross-reference on-chain events.
4. **Mitigate** – Slash malicious validators, revoke compromised identities, backfill missing
   indexer events.
5. **Recover** – Unpause services, resume rounds, publish post-incident report in `reports/`.

Keeping this runbook up-to-date ensures the CULTURE demo remains production-ready and
controllable even under high-stakes scenarios.
