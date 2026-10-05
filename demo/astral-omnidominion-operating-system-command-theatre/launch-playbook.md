# Launch Playbook — Astral Omnidominion Command Theatre

Begin with the offline rehearsal. Use the full AGI OS stack when you are ready to test the separate services and contracts.

## 1. Offline rehearsal (default)

Requirement: Python 3.10 or later (`python3 --version`). From the repository root:

```bash
python3 demo/astral-omnidominion-operating-system-command-theatre/run_demo.py
```

Open `reports/astral-omnidominion-operating-system-command-theatre/report.html`. The page works offline, adapts to narrow screens and provides file links, readable outcomes and a ten-job catalog. There are no external scripts, fonts or CDN dependencies.

Expected: `accepted`, four checks passed, three unique ledger entries, one duplicate, 21,999 cents total. Read `report.json` for machine-readable fields. Each execution stores candidate files in a new `runs/<id>/` directory; it does not reuse another run's artifacts. Each completed task also retains its own `receipt.json` and `index.html` inside that directory, so earlier runs stay independently verifiable. The top-level report/dashboard represent the latest invocation at that output path.

- `--scenario rejected`: an intentional one-cent error is detected; exit 1.
- `--scenario paused`: no task is executed and no task artifacts are written; exit 1.
- `--output /absolute/path/report.json`: write a separate report and adjacent dashboard. Output must end in `.json` and stay outside the demo source directory.
- `--verify-report /absolute/path/report.json`: verify all artifact hashes and recompute acceptance; does not execute work or contact services.

Use different output paths for demonstrations you want to compare. The current report and its referenced `runs/` directory form one evidence package. A local hash is not a signed attestation.

## 2. Full AGI OS stack (advanced)

This existing path may deploy contracts and start services. It is distinct from the offline rehearsal and the OpenClaw worker. Use disposable local/testnet environments and inspect configured RPCs and signers before execution.

| Requirement | Verification |
| --- | --- |
| Repository-pinned Node and npm | Follow [START_HERE](../../docs/START_HERE.md); `.nvmrc` and `package.json` are authoritative |
| Locked dependencies | `npm ci` from the repository root |
| Docker with Compose, or a prepared compatible runtime | `docker --version`, `docker compose version`, `docker compose ps` |
| Local chain and deployment configuration | Review [the parent OS demo](../astral-omnidominion-operating-system/README.md) and `deployment-config/` |
| Git and sufficient storage | `git status`, `df -h .`; allow space for images and artifacts |

For an explicit local deployment with Compose:

```bash
npm run demo:agi-os:first-class -- --network localhost --compose
```

For a previously prepared local deployment:

```bash
npm run demo:agi-os:first-class -- --network localhost --yes --no-compose --skip-deploy
```

The script supports `localhost` and `sepolia`. “Local Hardhat (Anvil)” is its existing preset label; Hardhat and Anvil are different tools. Check which runtime is actually running. Do not select a funded network for the first rehearsal.

The orchestrator runs preflight, the deployment wizard when enabled, `demo:agi-os`, owner diagram generation, owner-control verification, summary rendering, manifest compilation and integrity checks. **Steps can be skipped when dependencies or artifacts are unavailable, even when the command exits zero.** Inspect `first-class-run.json` → `steps[]`; a skipped check is not a pass. `--skip-deploy` only skips the deployment wizard, not every side effect of later stages. These commands do not run the entire repository test/security suite.

### Live mission control

Inspect actual port bindings and enabled services with `docker compose ps` before opening a UI. The Compose file maps `validator-ui` to `http://localhost:3000` and enterprise portal to `http://localhost:3001`. A validator UI is not guaranteed at port 3002. The separate static console can be built and previewed with:

```bash
npm run webapp:build
npm --prefix apps/console run preview -- --host 127.0.0.1 --port 4173
```

Confirm the actual network, contract addresses, account and data mode before submitting a task or governance action. Inspect transactions and refreshed authoritative state; a green button, static demo mode or polling animation is not proof of settlement.

### Full-stack mission evidence

Under `reports/agi-os/`, retain:

- `grand-summary.md` / `.html` — generated overview.
- `owner-control-matrix.json` — module surfaces and configuration status.
- `mission-bundle/` — simulation logs, telemetry and manifest when generated.
- `first-class/first-class-run.json` — host/commit metadata and each stage's status.
- `first-class/first-class-manifest.json` — SHA-256 entries, not signed attestations.
- `first-class/logs/` — command logs.
- `first-class/owner-control-map.mmd` — existing Mermaid governance map when generated.

Apply the [mission review checklist](mission-review-checklist.md). Do not reuse stale outputs to claim a newly skipped step succeeded.

## 3. Shutdown and troubleshooting

To stop the local Compose stack without deleting named volumes:

```bash
docker compose -f compose.yaml down
```

`docker compose -f compose.yaml down -v` additionally deletes named volumes. Use that only for an intentionally disposable environment after retaining needed evidence. Deployment reruns can change state; they are not guaranteed idempotent.

| Symptom | Next step |
| --- | --- |
| `python3` missing or older than 3.10 | Install a supported Python; the offline path needs no pip packages |
| Missing/empty document or invalid catalog | Restore the named source file; rerun and inspect the new report |
| Intentional rejected/paused scenario exits 1 | Expected; inspect the status and failed/blocked condition |
| Integrity check fails | Keep the evidence, identify changed/missing files and generate a new run; do not hand-edit hashes to make an old result pass |
| Output permission error | Choose a writable report directory outside the demo sources |
| Full-stack stage skipped | Satisfy that stage's prerequisites and rerun; zero exit alone is insufficient |
| Provider task interrupted | Stop and reconcile using the [computer-work recovery guide](../../docs/computer-work.md#recovery-and-stop-controls) |
