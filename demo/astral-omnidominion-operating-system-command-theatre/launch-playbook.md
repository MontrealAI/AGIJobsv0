# Launch Playbook — Astral Omnidominion Command Theatre

This playbook is designed for **non-technical operators**. Follow the steps in order to deploy the AGI Jobs v0 (v2) stack, run the first-class demo, and experience the live control surfaces.

## 0. Prerequisites (triple-checked)

| Requirement | Verification method |
| --- | --- |
| Docker Desktop ≥ 4.29 **or** Docker Engine ≥ 24 with Compose plugin | Run `docker --version` and `docker compose version`. Both commands must succeed. |
| Node.js 20.19.0 LTS | Run `node --version` and confirm the version matches the repository’s `package.json`. |
| npm 10.x (bundled with Node 20) | Run `npm --version`. |
| Git | Run `git status`. |
| 20 GB free disk space | `df -h .` |

> If any check fails, resolve it before proceeding. The demo will self-verify but assumes the environment is healthy.

## 1. Fresh setup

```bash
npm install
```

- Populates `node_modules` for faster script execution.
- Validated by the demo preflight—if this command was skipped the preflight logs a warning but still runs.

## 2. Initiate the guided mission

```bash
npm run demo:agi-os:first-class
```

During execution:

1. **Network selection** — Choose `Local Hardhat (Anvil)` unless you have funded testnet keys.
2. **Launch Docker Compose** — Accept the default `yes` to automatically start the one-click stack. If already running, answer `no`.
3. **Skip deployment?** — Keep `no` for a clean redeploy. Use `--skip-deploy` only when reusing an existing stack without changes.

The orchestrator then runs the following stages with live status updates and prefixed logs:

- Preflight validation (Docker, Compose, git cleanliness, Node.js).
- One-click deployment wizard (creates `.env`, runs deployment scripts, optionally starts Compose, pauses system).
- Full `demo:agi-os` mission (compilation, deterministic ASI take-off, owner control matrix, mission bundle).
- Owner control diagram (`owner:diagram`) rendered to Mermaid.
- Owner control verification (`owner:verify-control`).
- HTML mission summary rendering.
- Manifest compilation with SHA-256 hashes.
- Cross-verification of artefacts and owner modules.

Each stage produces logs under `reports/agi-os/first-class/logs/` for audit.

## 3. Live mission control (optional but recommended)

With Docker Compose running, explore the core UIs:

| UI | URL | What to try |
| --- | --- | --- |
| Owner Console | http://localhost:3000 | Connect to the local network, inspect the Governance Status card, render policies, and execute a **Pause All Modules** or **Resume All Modules** action via the governance form. |
| Enterprise Portal | http://localhost:3001 | Follow the conversational flow to submit a sample task. Confirm the **Submit job** green button triggers the job lifecycle. |
| Validator Console | http://localhost:3002 (if enabled) | Observe validator queues reacting to the submitted job. |
| One-Box Static UI | http://localhost:4173 (after `npm --prefix apps/console run preview`) | Toggle demo mode (`?orchestrator=demo`) and issue a natural-language request; review the AI-generated plan summary. |

All portals update live via existing polling/websocket infrastructure—no manual refresh is required.

## 4. Mission evidence package

When the run finishes, collect artefacts from `reports/agi-os/`:

- `grand-summary.md` and `grand-summary.html` — executive overview.
- `owner-control-matrix.json` — governance levers with status (✅ ready, ⚠️ needs config, ❌ missing script).
- `mission-bundle/` — deterministic simulation logs, telemetry, constants, and manifest.
- `first-class/first-class-run.json` — run metadata (host, git commit, Docker versions, step durations).
- `first-class/first-class-manifest.json` — attested SHA-256 checksums.
- `first-class/logs/` — per-step logs with prefixed stdout/stderr.
- `first-class/owner-control-map.mmd` — Mermaid diagram of owner control planes.

Follow the [mission review checklist](./mission-review-checklist.md) for systematic validation.

## 5. Shutdown / cleanup

If the Compose stack should be stopped after the demonstration:

```bash
docker compose -f compose.yaml down
```

To remove stateful volumes for a fresh rerun:

```bash
docker compose -f compose.yaml down -v
```

The first-class orchestrator is idempotent—rerun `npm run demo:agi-os:first-class` anytime to regenerate artefacts, redeploy contracts, or refresh telemetry.
