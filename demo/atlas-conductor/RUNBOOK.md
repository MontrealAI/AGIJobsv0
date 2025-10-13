# Atlas Conductor Operator Runbook

This runbook choreographs the Atlas Conductor take-off demonstration end to end
using only the tooling that already ships with AGI Jobs v0 (v2).  Every command
is non-interactive and can be wired into CI or executed by an operations team
with a mainnet signer.

---

## 0. Pre-flight Integrity

1. **Verify repository hygiene**
   ```bash
   npm run lint:check
   npm run format:check
   npm run test
   ```
2. **Confirm owner wiring**
   ```bash
   npm run owner:doctor
   npm run owner:verify-control
   npm run owner:dashboard
   ```
3. **Refresh governance documentation**
   ```bash
   npm run owner:mission-control
   npm run owner:command-center
   npm run owner:atlas
   npm run owner:parameters
   npm run owner:surface
   ```
   Archive the Markdown outputs under `reports/owner/` for later comparison.

---

## 1. Deterministic Deployment Capsule

1. **Deploy defaults on the target network**
   ```bash
   npx hardhat run scripts/v2/deployDefaults.ts --network <network>
   ```
2. **Capture the wiring bundle**
   ```bash
   HARDHAT_NETWORK=<network> npm run owner:plan -- --output reports/<network>/atlas-conductor/owner-plan.md --format markdown
   HARDHAT_NETWORK=<network> npm run owner:plan:safe
   npm run owner:blueprint -- --network <network> --out reports/<network>/atlas-conductor/owner-blueprint.md --format markdown
   ```
3. **Render emergency posture**
   ```bash
   npm run owner:emergency -- --network <network>
   npm run owner:pulse -- --network <network>
   npm run owner:rotate -- --network <network>
   ```

---

## 2. Mission Execution

Use the deterministic harness to run the tri-sector mission graph.

### Option A — CI invocation

```bash
AURORA_REPORT_SCOPE=atlas-conductor \
AURORA_REPORT_TITLE="Atlas Conductor — Mission Report" \
AURORA_MISSION_CONFIG=demo/atlas-conductor/config/mission@v2.json \
AURORA_THERMOSTAT_CONFIG=demo/atlas-conductor/config/atlas-conductor.thermostat@v2.json \
NETWORK=${NETWORK:-localhost} \
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network ${NETWORK:-localhost}
```

### Option B — Local single command

```bash
demo/atlas-conductor/bin/atlas-conductor-local.sh
```

Both paths emit receipts under
`reports/<network>/atlas-conductor/receipts/` alongside deployment metadata.

---

## 3. Governance Synchronisation

1. **Produce consolidated mission report**
   ```bash
   AURORA_REPORT_SCOPE=atlas-conductor \
   AURORA_REPORT_TITLE="Atlas Conductor — Mission Report" \
   NETWORK=${NETWORK:-localhost} \
   npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts
   ```
2. **Generate deterministic kits**
   ```bash
   npm run demo:asi-takeoff:kit -- \
     --report-root reports/${NETWORK:-localhost}/asi-takeoff \
     --summary-md reports/${NETWORK:-localhost}/asi-takeoff/asi-takeoff-report.md \
     --bundle reports/${NETWORK:-localhost}/asi-takeoff/receipts \
     --logs reports/${NETWORK:-localhost}/asi-takeoff/receipts
   npm run demo:asi-global:kit
   ```
3. **Reconcile owner artefacts**
   ```bash
   npm run owner:command-center
   npm run owner:atlas
   npm run owner:parameters
   npm run owner:surface
   npm run owner:command-center -- --output reports/atlas-conductor/command-center.md --format markdown
   ```

---

## 4. Thermodynamic + Hamiltonian Oversight

```bash
npm run thermodynamics:report
npm run hamiltonian:report
npm run thermostat:update -- --config demo/atlas-conductor/config/atlas-conductor.thermostat@v2.json
npm run owner:change-ticket -- --output reports/atlas-conductor/change-ticket.md --format markdown
```

Validate the resulting entropy traces against the mission thermostat file and
commit hashes to the bundle manifest.

---

## 5. Financial Continuity + ENS

1. **Treasury cross-check**
   ```bash
   npm run reward-engine:update -- --network <network>
   npm run platform:registry:inspect -- --network <network>
   npm run platform:registry:update -- --network <network>
   ```
2. **ENS + identity registry**
   ```bash
   npm run identity:register
   npm run identity:update -- --network <network>
   ```
3. **Attestation sweep**
   ```bash
   npm run agent:validator
   npm run subgraph:e2e
   ```

---

## 6. Final Dossier Assembly

1. **Render governance diagram**
   ```bash
   npm run owner:diagram
   ```
2. **Produce audit dossiers**
   ```bash
   npm run audit:dossier
   npm run audit:package
   ```
3. **Lock manifest + SBOM**
   ```bash
   npm run release:manifest
   npm run release:manifest:summary
   npm run release:manifest:validate
   npm run sbom:generate
   ```
4. **Mermaid verification**

   ```mermaid
   stateDiagram-v2
     [*] --> DeployDefaults
     DeployDefaults --> MissionExecution
     MissionExecution --> GovernanceSync
     GovernanceSync --> ThermodynamicOversight
     ThermodynamicOversight --> FinancialContinuity
     FinancialContinuity --> AuditDossier
     AuditDossier --> [*]
   ```

5. **Publish bundle**
   ```bash
   tar -czf atlas-conductor-bundle.tgz reports/${NETWORK:-localhost}/atlas-conductor
   ```

---

## 7. Post-flight Retrospective

- Diff Owner Atlas, Mission Control, and Command Center outputs against the
  baseline committed in version control.
- Review thermodynamic deltas to confirm validator temperature adjustments
  follow the plan.
- Track Hamiltonian energy deltas to ensure labour velocity stays within
  mission bounds.
- File an owner change ticket with the computed hashes and attach the bundle.

The Atlas Conductor drill now stands ready for CI automation or mainnet
execution without any new code.
