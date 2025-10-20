# National Supply Chain v0 Runbook

This runbook guides a non-technical steward through the full rehearsal. Every command is copy-paste ready and relies solely on tooling that ships with AGI Jobs v0 (v2).

## 0. Environment checks

1. Install Node `20.18.1` (run `nvm use` in the repo to reuse the checked-in `.nvmrc`).
2. Install dependencies once: `npm ci --no-audit`.
3. Optional but recommended: `docker compose pull` to cache dashboard containers.
4. Ensure Hardhat Anvil is available (ships with `npm install`). The scripts automatically spawn/target `localhost`.

## 1. Launch the demonstration

```bash
cd /path/to/AGIJobsv0
chmod +x demo/National-Supply-Chain-v0/bin/launch.sh
NATIONAL_SUPPLY_CHAIN_AUTO_YES=1 demo/National-Supply-Chain-v0/bin/launch.sh
```

Expected behaviour:

- The first-class OS demo deploys/updates contracts, produces `reports/agi-os/*`, and surfaces owner control matrices.
- The ASI take-off harness replays with the national plan, outputting receipts under `reports/asi-takeoff/`.
- The national supply chain kit lands under `reports/national-supply-chain/` with dashboard, summary, mermaid, owner playbook, ledger, and manifest.

The script is idempotent; rerun as many times as required.

## 2. Spin up dashboards (optional but powerful)

### Owner console & portals

```bash
# Terminal A
npm --prefix apps/console run dev

# Terminal B
NODE_ENV=development docker compose up validator-ui enterprise-portal
```

Visit:

- http://localhost:5173 — Owner Console (pause toggles, treasury sliders, thermostat controls).
- http://localhost:3000 — Validator UI (commit/reveal flows, disputes, telemetry).
- http://localhost:3001 — Enterprise Portal (guided mission authoring).

### Static national cockpit

```bash
npx --yes http-server demo/National-Supply-Chain-v0/ui -p 4177
```

Open http://localhost:4177 to explore the generated dashboard using `ui/export/latest.json`.

## 3. Owner drills (execute in order)

1. **Pause rehearsal**
   ```bash
   npm run owner:system-pause -- --action pause
   npm run owner:system-pause -- --action unpause
   ```
   Verify the dashboard updates within seconds.

2. **Thermostat tuning**
   ```bash
   npm run owner:parameters
   npm run thermostat:update
   ```
   Record the new values inside `reports/national-supply-chain/owner-command-center.md`.

3. **Treasury rebalancing**
   ```bash
   npm run owner:mission-control
   npm run reward-engine:update
   ```

4. **Identity / platform updates** (only if new participants were added)
   ```bash
   npm run identity:update
   npm run platform:registry:update
   ```

5. **Governance verification**
   ```bash
   npm run owner:verify-control
   npm run owner:upgrade-status
   npm run ci:verify-branch-protection
   ```

## 4. Validate evidence bundle

- Inspect `reports/national-supply-chain/summary.md` for the executive briefing.
- Confirm `reports/national-supply-chain/manifest.json` lists SHA-256 hashes for every artefact.
- Optional: notarise the manifest by uploading it to IPFS or anchoring the hash on-chain.
- Share `demo/National-Supply-Chain-v0/ui/export/latest.json` with stakeholders who need an offline cockpit.

## 5. Keep CI green

Before opening a pull request or deploying to a new environment, run:

```bash
npm run lint:check
npm test
npm run coverage:check
npm run owner:verify-control
npm run ci:verify-branch-protection
npm run demo:national-supply-chain:v0
```

GitHub automatically enforces the full v2 CI pipeline plus `demo-national-supply-chain-v0.yml` for any PR touching this demo. Upload artefacts from the Actions tab to share with reviewers.

## 6. Extending the mission

1. Edit `demo/National-Supply-Chain-v0/project-plan.national-supply-chain.json`.
   - Add more `corridors`, `nodes`, or `jobs`.
   - Update `ownerPlaybooks` if new scripts or controls are introduced.
2. Rerun the launcher. All dashboards regenerate automatically.
3. Use `apps/console` and the Validator UI to execute new missions live.

## 7. Incident response

If a disruption is detected:

1. Trigger `npm run owner:system-pause -- --action pause`.
2. Execute `npm run owner:emergency` for the emergency runbook (ships with the repo).
3. Use `reports/national-supply-chain/mission-ledger.json` to identify impacted corridors.
4. Post mitigation jobs via the Enterprise Portal or CLI.
5. Resume operations once validators sign off: `npm run owner:system-pause -- --action unpause`.

The combination of automation + human oversight keeps the nation resilient even in adversarial scenarios.
