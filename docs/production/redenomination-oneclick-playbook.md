# REDENOMINATION One-Click Deployment Playbook

> **Purpose.** Provide a production-ready, non-technical launch sequence that links the
> REDENOMINATION sprint objectives to the one-click toolchain. Follow this
> playbook end-to-end to prove CI health, execute the containerised deployment,
> and archive the artefacts auditors require before flipping the AGI Jobs v0
> platform live.

The steps below assume you have cloned the repository, installed Node.js 20.18.1, and
have Docker 24+ available. Commands are copy/pasteable on macOS, Linux, or WSL.
Each phase emits Markdown/JSON evidence under `reports/` so governance can review
and sign before advancing.

---

## 1. Pre-flight compliance gate

1. **Confirm CI v2 parity** – ensure your local environment matches the hosted
   workflow:

   ```bash
   npm ci
   npm run compile
   npm run lint
   npm test
   npm run owner:health
   ```

   - The GitHub Actions definition in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
     mirrors these steps plus Foundry, coverage, and summary gates. A green
     `CI summary` badge must exist on `main` before production promotion.

2. **Snapshot owner control** – capture the current governance envelope and
   verify no stale acceptOwnership actions remain:

   ```bash
   npm run owner:surface -- --network <network> --format markdown --out reports/<network>/surface-preflight.md
   npm run owner:pulse -- --network <network> --format markdown --out reports/<network>/pulse-preflight.md
   npm run owner:verify-control -- --network <network> --strict
   ```

   - These helpers interrogate the `Governable` modules and prove that the
     multi-sig/timelock retains exclusive control over all adjustable
     parameters.【F:contracts/v2/Governable.sol†L4-L58】

3. **Identity roster check** – ensure ENS roots and allowlists match your
   planned launch cohort:

   ```bash
   npm run identity:update -- --network <network>
   ```

   - The script diffs `config/identity-registry*.json` against the deployed
     `IdentityRegistry`, flagging any missing ENS subdomains, validator roots, or
     emergency allowlists before jobs go live.【F:contracts/v2/IdentityRegistry.sol†L991-L1068】

4. **Deployment readiness index** – generate an executive summary that must be
   signed before entering the deployment window:

   ```bash
   npm run deploy:checklist -- --network <network> --format markdown --out reports/<network>/deployment-checklist.md
   ```

   - This references the [Production Readiness Index](deployment-readiness-index.md)
     to confirm REDENOMINATION evidence (CI, owner drills, dispute rehearsals,
     observability smoke tests) is up to date.

---

## 2. Generate the deployment plan

1. **Prepare configuration JSON** – copy `deployment-config/deployer.sample.json`
   to an environment-specific file (e.g. `deployment-config/mainnet.json`) and
   update governance, treasury, thermodynamics, and validator limits.

2. **Dry-run the wizard** – preview the full stack without executing blockchain
   transactions:

   ```bash
   npm run deploy:oneclick:wizard -- --config deployment-config/<network>.json --network <network>
   ```

   - The wizard validates the config, confirms the `.env` template exists, and
     prints the Compose overrides it will generate if you continue.【F:scripts/v2/oneclick-wizard.ts†L68-L168】

3. **Non-interactive rehearsal** – when ready for a deterministic run, trigger
   the wrapper that defaults to Docker Compose with detached containers:

   ```bash
   npm run deploy:oneclick:auto -- --config deployment-config/<network>.json --network <network> --no-compose
   ```

   - Passing `--no-compose` is recommended during planning; re-run without the
     flag when you are ready to boot services immediately. The helper simply
     forwards arguments to the wizard so both code paths remain in sync.【F:scripts/v2/oneclick-stack.ts†L33-L83】

4. **Document outputs** – store the generated `deployment-config/latest-deployment.json`
   and diff it against version-controlled expectations via `git diff`. Attach the
   file to your governance change ticket before the live execution.

---

## 3. Execute the one-click deployment

1. **Launch contracts with secure defaults**:

   ```bash
   npm run deploy:oneclick -- --config deployment-config/<network>.json --network <network> --yes
   ```

   - The script deploys all v2 modules, wires them together, pauses every
     subsystem, and enforces the `secureDefaults` block (job caps, validator
     windows, slash weights) from the config file.【F:docs/deployment/one-click.md†L61-L87】

2. **Rewrite environment file** – the wizard updates `deployment-config/oneclick.env`
   with the emitted contract addresses so Dockerised services connect to the
   correct instances. Commit the diff to change control once validated.

3. **Optional Compose launch** – when infrastructure is ready, run:

   ```bash
   npm run deploy:oneclick:auto -- --config deployment-config/<network>.json --network <network> --compose
   ```

   - Passing `--compose` starts the stack in detached mode. Use `--attach` to
     stream logs during burn-in. The Compose bundle wires the orchestrator,
     gateways, paymaster, notifier, validator UI, and enterprise front-end by
     default.【F:compose.yaml†L1-L180】

4. **Archive artefacts** – copy the wizard transcript, deployment JSON, and `.env`
   diff into `reports/<network>/deployment-<timestamp>/` for audit trails.

---

## 4. Post-deployment governance hardening

1. **Refresh SystemPause wiring**:

   ```bash
   npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network <network>
   npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network <network> --execute
   ```

   - `SystemPause` fans out to `JobRegistry`, `StakeManager`, `ValidationModule`,
     `DisputeModule`, and other cores, guaranteeing the governance Safe can halt
     the platform instantly.【F:contracts/v2/SystemPause.sol†L16-L217】

2. **Apply owner configuration bundle**:

   ```bash
   npm run owner:update-all -- --network <network>
   npm run owner:update-all -- --network <network> --execute
   ```

   - This enforces the committed JSON manifests across FeePool, StakeManager,
     thermodynamics, Hamiltonian monitor, and reward engines without editing
     Solidity.【F:scripts/v2/updateAllModules.ts†L1-L200】

3. **Rotate emergency docs** – regenerate the full owner dossier:

   ```bash
   npm run owner:atlas -- --network <network> --format markdown --out reports/<network>/owner-atlas.md
   npm run owner:change-ticket -- --network <network> --format markdown --out reports/<network>/owner-change-ticket.md
   npm run owner:emergency -- --network <network> --format markdown --out reports/<network>/emergency-pack.md
   ```

   - The outputs confirm the contract owner retains the ability to pause, slash,
     rotate governance, and resynchronise ENS allowlists, satisfying the
     REDENOMINATION control-surface requirements.【F:README.md†L330-L420】

4. **Identity + reputation seeding** – onboard your initial operators:

   ```bash
   npm run identity:update -- --network <network> --execute
   npm run owner:dashboard -- --network <network> --format markdown --out reports/<network>/owner-dashboard.md
   ```

   - The dashboard snapshots validator reputations and certificate minting state,
     mapping directly to verifiable compute deliverables.【F:contracts/v2/CertificateNFT.sol†L16-L114】【F:contracts/v2/ReputationEngine.sol†L82-L212】

---

## 5. Verifiable compute validation

1. **Committee sampling rehearsal** – ensure randomness and stake weighting work
   as expected:

   ```bash
   forge test --match-test testSelectValidators --ffi --fuzz-runs 64
   ```

   - The test suite covers the `ValidationModule` sampling logic, revealing any
     misconfiguration before live jobs rely on it.【F:contracts/v2/ValidationModule.sol†L820-L1160】

2. **Commit–reveal integrity** – re-run the Hardhat E2E to confirm validators must
   reveal matching hashes before payouts trigger:

   ```bash
   npm run test:fork
   ```

   - The fork scenario drives `JobRegistry` through submission, validation,
     disputes, and settlement, checking stake slashing and certificate minting.

3. **Wire verification** – confirm stored hashes/URIs align with configuration:

   ```bash
   npm run wire:verify -- --network <network>
   ```

   - Validates `JobRegistry` result hashes and dispute evidence so verifiable
     compute remains tamper-evident.【F:contracts/v2/JobRegistry.sol†L1894-L2058】

---

## 6. Observability and monitoring burn-in

1. **Prometheus/Grafana smoke test**:

   ```bash
   npm run observability:smoke
   ```

   - Confirms scrape targets, Alertmanager routes, and dashboards in
     `monitoring/` are reachable post-deployment.【F:monitoring/prometheus/prometheus.yml†L1-L58】

2. **Hamiltonian & thermodynamics audit**:

   ```bash
   npm run hamiltonian:report -- --network <network> --format markdown --out reports/<network>/hamiltonian.md
   npm run owner:parameters -- --network <network> --format markdown --out reports/<network>/thermodynamics.md --no-mermaid
   ```

   - Captures incentive parameters, stake distributions, and burn ratios for
     institutional economics reviews using the owner parameter matrix and Hamiltonian
     tracker.【F:docs/thermodynamics-operations.md†L1-L140】【F:scripts/v2/ownerParameterMatrix.ts†L80-L160】

3. **Alert rehearsal** – trigger alert simulations from the monitoring handbook
   and document PagerDuty/Slack deliveries inside
   `reports/<network>/observability-drill.md`.

---

## 7. Launch sign-off

1. **Pause handshake** – run `npm run owner:command-center -- --network <network>`
   to render the live control panel, ensuring pause/unpause, dispute escalations,
   and validator rotations are wired.

2. **Final readiness review** – update `docs/owner-control-master-checklist.md`
   with the new artefact locations and capture approvals from governance, legal,
   and operations. Attach the checklist, deployment JSON, `.env`, and all Markdown
   reports to the release ticket.

3. **Go-live** – once approvals are recorded, unpause in stages via
   `SystemPause` (validators → job submissions → payouts) and monitor dashboards
   for anomalies.

Following this playbook demonstrates that the AGI Jobs v0 stack satisfies every
REDENOMINATION pillar—governed autonomy, verifiable compute, anti-collusion,
auditable observability, one-click deployment, user-centric documentation, and
rigorous testing—while keeping the contract owner firmly in control.
