# ASI Take-Off Demonstration: National Governance Simulation

This playbook codifies a deterministic, CI-friendly demonstration that
reuses AGI Jobs v0 (v2) primitives to stage an "autonomous national
project" scenario. The pipeline keeps the contract owner in full control
while exercising the one-box orchestrator, thermodynamic incentives,
and owner governance scripts that already ship with the repository.
Each section links to the operational runbooks the team must follow to
stay compliant with production guardrails.

## 1. Scenario framing

*Objective.* Simulate an autonomous government directing a high-speed
rail initiative end-to-end. The AI planner creates, validates, and
settles multiple dependent jobs against a local Hardhat network so the
entire flow runs inside CI.

*Participants.*

- **Government multisig / owner** – Controls every module via the
  existing owner scripts. Critical commands route through
  `SystemPause` so governance can pause or resume at will.
- **Planner / orchestrator** – The `/onebox/*` surface captures a
  natural-language directive and emits validated job intents before
  relaying transactions when authorised.
- **Agents & validators** – ENS-registered operators complete and audit
  work. Their activity powers the RewardEngine thermodynamic payouts.
- **Treasury** – Receives configurable protocol fees, keeping public
  finance under owner oversight.

## 2. Pre-flight baseline

1. **Bootstrap the full stack.** Use the automated compose deployer to
   stand up contracts, orchestrator, gateway, and monitoring in one go:

   ```bash
   npm run deploy:oneclick:auto -- --network localhost
   ```

   The helper pulls addresses from `deployment-config/` manifests and
   initialises `SystemPause`, the RewardEngine, and orchestrator
   secrets.【F:scripts/v2/oneclick-stack.ts†L1-L372】

2. **Update identity registry.** Map predetermined agent and validator
   wallets to ENS handles so only vetted actors can join jobs:

   ```bash
   npm run identity:update -- --network localhost --config config/identity-registry.localhost.json
   ```

   The script enforces the identity policy in
   `docs/ens-identity-policy.md`, guaranteeing fully auditable
   participants.【F:scripts/v2/updateIdentityRegistry.ts†L27-L188】

3. **Verify owner controls.** Immediately confirm the governance tree is
   wired to the owner’s multisig and that `SystemPause` holds pauser
   authority:

   ```bash
   npm run owner:verify-control -- --network localhost
   ```

   Follow the remediation guidance in `docs/system-pause.md` if any
   module is not yet governed by the pause switch.【F:docs/system-pause.md†L1-L120】

4. **Lock CI guardrails.** Run the branch protection probe before
   storing any orchestrator artefacts:

   ```bash
   npm run ci:verify-branch-protection
   ```

   This verifies that pull requests and `main` are already blocked on the
   green CI suite described in `docs/ci-v2-branch-protection-checklist.md`.【F:scripts/ci/verify-branch-protection.ts†L19-L140】

## 3. Planner and orchestrator execution

1. **Launch the one-box server.**

   ```bash
   npm run onebox:server
   ```

   Environment variables declared in `routes/onebox.py` determine API
   secrets, relayer keys, and registry addresses so the owner can swap
   infrastructure without code edits.【F:routes/onebox.py†L44-L121】

2. **Request the governance plan.** Prepare an artefact folder and
   submit the rail directive to the planner endpoint so the hash and
   payload are archived for audit linkage:

   ```bash
   mkdir -p storage/demo
   curl -sS -X POST "$ONEBOX_URL/onebox/plan" \
     -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"text":"Plan the national high-speed rail build","expert":false}' > storage/demo/plan.json
   ```

   The response contains a canonical `planHash`, summary, and any missing
   fields, all persisted by `_store_plan_metadata` for traceability.【F:routes/onebox.py†L902-L1018】

3. **Dry-run simulation.** Reuse the stored payload to check policy
   caps, deadline windows, and reward sufficiency before spending gas:

   ```bash
   curl -sS -X POST "$ONEBOX_URL/onebox/simulate" \
     -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @storage/demo/plan.json > storage/demo/simulate.json
   ```

   The simulator enforces organisational policy and reports blockers,
   keeping non-compliant jobs out of execution.【F:routes/onebox.py†L1758-L1870】

4. **Execute and relay.** When the simulator returns status `200`, hand
   the plan to the runner so the relayer deploys jobs on-chain:

   ```bash
   curl -sS -X POST "$ONEBOX_URL/onebox/execute" \
     -H "Authorization: Bearer $ONEBOX_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @storage/demo/simulate.json > storage/demo/execute.json
   ```

   Receipts include job IDs, transaction hashes, and a CID pointer for
   downstream auditors.【F:routes/onebox.py†L1955-L2215】 Poll
   `/onebox/status` to surface live job states for dashboards and
   reporting.【F:routes/onebox.py†L2332-L2376】

## 4. Agent and validator walkthrough

1. **Assign agents.** For each posted job, have the chosen agent account
   opt in via the registry CLI or Hardhat console following
   `docs/job-lifecycle.md`.

2. **Submit deliverables.** Agents call the delivery entry point with
   IPFS references prepared by the orchestrator toolset in
   `shared/attachments.ts`. Validators review artefacts, then vote or
   attest according to the flow in `docs/job-validation-lifecycle.md`.

3. **Finalise and settle.** Employers (the AI government) invoke the
   finalisation path once validator quorum passes. Reward splits honour
   the thermodynamic role weights defined in
   `config/thermodynamics.json` and distributed by the RewardEngine
   module.【F:config/thermodynamics.json†L1-L40】

4. **Energy telemetry.** The agent gateway records CPU/GPU spans in
   `data/energy-metrics.jsonl`, fuelling the thermodynamic incentives
   documented in `docs/thermodynamic-incentives.md`. Use the
   `scripts/energy-dashboard.ts` helper for live inspection when needed.【F:docs/thermodynamic-incentives.md†L1-L81】

## 5. Adaptive policy updates

1. **Adjust thermodynamics.** Modify
   `config/thermodynamics.json` (for example, raising the global
   temperature to widen participation), then run:

   ```bash
   npx hardhat run scripts/v2/updateThermodynamics.ts --network localhost
   npx hardhat run scripts/v2/updateThermodynamics.ts --network localhost --execute
   npm run hamiltonian:report -- --network localhost --out reports/thermo.json
   ```

   The dry-run/execution pair keeps governance changes auditable, while
   the Hamiltonian report captures the new free-energy allocation.【F:scripts/v2/updateThermodynamics.ts†L24-L238】【F:scripts/hamiltonian-tracker.ts†L21-L212】

2. **Re-route treasury flows.** When reallocating public funds, update
   `config/fee-pool.json` and apply it with:

   ```bash
   npx hardhat run scripts/v2/updateFeePool.ts --network localhost
   npx hardhat run scripts/v2/updateFeePool.ts --network localhost --execute
   ```

   This preserves the owner’s ability to divert platform fees into the
   designated treasury safe.【F:scripts/v2/updateFeePool.ts†L33-L241】

3. **Emergency controls.** If anomalies surface, pause all job modules in
   one transaction and resume after remediation:

   ```bash
   npx hardhat run scripts/v2/updateSystemPause.ts --network localhost
   npx hardhat run scripts/v2/updateSystemPause.ts --network localhost --execute
   ```

   The helper validates ownership and pauser assignments before issuing
   transactions, ensuring the owner can always halt execution paths.【F:scripts/v2/updateSystemPause.ts†L38-L237】

## 6. Settlement and audit artefacts

1. **Epoch settlement.** Run the dry-run harness to exercise staking,
   delivery, validation, and reward distribution end-to-end:

   ```bash
   npm run owner:testnet:dry-run -- --network localhost --json > reports/demo-dry-run.json
   ```

   Use the JSON output as the canonical ledger of execution for the
   simulated epoch.【F:scripts/v2/testnetDryRun.ts†L39-L350】

2. **Mission-control snapshot.** Generate the owner governance report and
   Mermaid control diagram for archives:

   ```bash
   npm run owner:mission-control -- --network localhost --format markdown --out reports/demo-mission.md
   ```

   The output enumerates every governance command executed and their
   resulting contract hashes.【F:scripts/v2/ownerMissionControl.ts†L35-L276】

3. **Governance kit manifest.** Combine the plan of record with dry-run,
   thermodynamic, and mission-control artefacts into a hashed dossier:

   ```bash
   npm run demo:asi-takeoff:kit -- --report-root reports/localhost/asi-takeoff --summary-md reports/localhost/asi-takeoff/asi-takeoff-report.md --bundle reports/localhost/asi-takeoff/receipts
   ```

   The generated `governance-kit.{json,md}` files provide a turnkey audit
   bundle for non-technical owners, showing integrity hashes and control
   checklist entries produced by `scripts/v2/lib/asiTakeoffKit.ts`.【F:scripts/v2/lib/asiTakeoffKit.ts†L1-L340】

4. **Branch protection evidence.** Attach the latest
   `npm run ci:verify-branch-protection` transcript and test matrix from
   `.github/workflows/` to the release dossier to prove CI gating is
   enforced as part of the demo acceptance.

5. **Continuous observability.** Collect Prometheus metrics from
   `/onebox/metrics` and structured logs keyed by the `planHash` so the
   audit trail ties API activity to blockchain receipts.【F:routes/onebox.py†L209-L237】【F:routes/onebox.py†L1765-L1905】

## 7. Extending the simulation

- **Parallel programmes.** Repeat the plan → simulate → execute flow with
  additional directives (for example, nationwide telemedicine rollout) to
  exercise orchestrator parallelism. The job registry status feed keeps
  each initiative isolated for reporting.
- **Contingency drills.** Script deadline expiries or dispute triggers
  using the existing dispute module walkthrough in `docs/disputes.md` to
  validate slashing, reissuance, and treasury clawbacks.
- **Upgrade rehearsals.** Stage protocol upgrades with
  `npm run owner:update-all -- --network localhost --only rewardEngine,thermostat`
  to rehearse zero-downtime parameter rotations before mainnet release.

Following this checklist yields a reproducible national governance
simulation that demonstrates autonomous planning, execution, economic
steering, and full-spectrum owner control without introducing new smart
contracts. Every command is already guarded by dry-run tooling so a
non-technical contract owner can operate the system safely while keeping
CI green.
