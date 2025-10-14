# Zenith Sapience Planetary Operating System – Operator Runbook

This runbook walks a non-technical steward through running the **Zenith Sapience Planetary Operating System** demo either locally or in CI. Every command delegates to shipping AGI Jobs v0 (v2) tooling; the operator never needs to modify code.

---

## 1. Pre-flight Checklist

1. **Workstation requirements**
   - Node.js version from `.nvmrc`
   - npm 9+
   - Git
   - (Optional) Foundry toolchain for local rehearsals
2. **Repository sync**
   - `git fetch origin`
   - `git checkout <branch>` containing the demo
   - `npm ci`
3. **Environment**
   - For deterministic runs no extra environment variables are required.
   - For local rehearsals ensure Hardhat is available; the script spawns it automatically.
4. **Owner credentials** (only for mainnet activation)
   - Multisig keys (executed via Safe or hardware wallets)
   - Timelock administration rights

> ✅ Confirm every checklist item before proceeding. The `command-center.md` output documents this attestation.

---

## 2. Deterministic Governance Kit (Audit Mode)

1. `npm run demo:zenith-sapience-planetary-os`
2. Observe the prefixed logs in the terminal (`[plan]`, `[missionControl]`, `[thermostat]`, etc.).
3. When the run completes, review artefacts in `reports/zenith-planetary-os`:
   - `summary.md` – executive digest
   - `mission-control.md` – operational dashboard
   - `parameter-matrix.md` – editable owner parameters
   - `thermodynamics.json` – incentive thermostat telemetry
   - `command-center.md` – chronological command log
4. Archive the generated kit (`zenith-planetary-os-governance-kit.json`) for auditors.

> The deterministic kit runs without network access and is therefore safe on air-gapped machines.

---

## 3. Local Rehearsal (Hardhat / Anvil)

1. `npm run demo:zenith-sapience-planetary-os:local`
2. The script boots an ephemeral Hardhat chain and deploys all v2 contracts.
3. Default keys (Hardhat mnemonic) are provided via environment variables; replace them to test custom roles.
4. Inspect artefacts in `reports/localhost/zenith-planetary-os` to verify parity with deterministic outputs.
5. Optional: point dashboards to a browser or monitoring stack for live rehearsals.

---

## 4. Owner Control Drills

1. **Thermostat adjustment**
   - Run `npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-planetary-os/parameter-matrix.md`
   - Execute `npx hardhat run scripts/v2/updateThermodynamics.ts --network hardhat`
   - Confirm the thermostat delta in `thermodynamics.json`
2. **Pause / Resume**
   - Trigger pause: `npm run owner:system-pause -- --network hardhat --action pause`
   - Resume: `npm run owner:system-pause -- --network hardhat --action unpause`
   - Verify status inside `mission-control.md`
3. **Identity updates**
   - Use `npm run owner:identity-registry -- --network hardhat --list` to review registered agents
   - Apply updates according to [`OWNER-CONTROL.md`](./OWNER-CONTROL.md)

Record each drill completion inside `command-center.md` (the deterministic harness appends entries automatically when scripts execute).

---

## 5. Mainnet Activation (Optional)

> Follow only after rehearsals are green.

1. Prepare deployment wallets and RPC endpoints according to `docs/deployment/mainnet.md`.
2. Execute the deterministic kit in dry-run to freeze artefacts for sign-off.
3. Use `npm run deploy:checklist` for the interactive deployment checklist.
4. Run `npm run demo:zenith-sapience-planetary-os -- --network mainnet` with environment variables pointing to production RPC and keys.
5. Capture resulting artefacts and distribute them to stakeholders.
6. Update ENS subdomains for orchestrator, agents, council, and validators.

---

## 6. CI Integration

The workflow `.github/workflows/demo-zenith-sapience-planetary-os.yml` mirrors this runbook. On every PR or push to `main`, GitHub Actions:

1. Installs dependencies via `npm ci`
2. Runs the deterministic kit (`npm run demo:zenith-sapience-planetary-os`)
3. Performs the local rehearsal (`npm run demo:zenith-sapience-planetary-os:local`)
4. Uploads artefacts for reviewer download

Merge is blocked unless the workflow and the global `ci (v2)` workflow are green.

---

## 7. Incident Handling

1. Immediately execute the SystemPause action described above.
2. Notify the multisig council; obtain signatures for emergency measures.
3. Export `reports/zenith-planetary-os/mission-control.md` and `command-center.md` to the incident channel.
4. Run `npm run owner:command-center` to regenerate the command timeline post-incident.
5. Resume operations only after sign-off from the owner council.

---

## 8. Post-Run Archival

- Store the `reports/` folder in immutable storage (IPFS, S3 with versioning, etc.).
- Commit hashes of artefacts to the audit ledger (`npm run audit:hash -- reports/zenith-planetary-os`).
- Update governance dashboards or external monitoring tools as required.

---

By following this runbook, non-technical custodians can demonstrate, rehearse, and operate the Zenith Sapience Planetary Operating System while keeping complete control over the AGI Jobs v0 (v2) stack.
