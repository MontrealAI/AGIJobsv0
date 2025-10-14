# OMNIGENESIS GLOBAL SOVEREIGN SYMPHONY — OPERATOR RUNBOOK

This runbook expresses the full-fidelity rehearsal for mission engineers, treasury stewards, and validator captains. Every step references first-class tooling that already exists inside AGI Jobs v0 (v2).

---

## 0. Pre-Flight

1. **Sync dependencies**
   ```bash
   npm install
   ```
2. **Set environment**
   ```bash
   cp demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/env.example .env
   source .env
   ```
3. **Confirm toolchain**
   ```bash
   npm run ci:verify-toolchain
   npm run ci:verify-signers
   npm run ci:verify-branch-protection
   ```

---

## 1. Deterministic Bootstrap

| Step | Command | Purpose |
| ---- | ------- | ------- |
| 1.1 | `npm run compile` | Rebuild Solidity artefacts and regenerate constants consumed by governance scripts. |
| 1.2 | `NETWORK=localhost npm run demo:asi-takeoff:local` | Deploy protocol defaults, execute the Omnigenesis plan, and render mission receipts into `reports/localhost/omnigenesis-global-symphony`. |
| 1.3 | `npm run demo:asi-takeoff:kit -- --report-root $OMNIGENESIS_REPORT_ROOT --summary-md $OMNIGENESIS_REPORT_ROOT/omnigenesis-report.md --bundle $OMNIGENESIS_REPORT_ROOT/receipts` | Produce the governance kit that federates receipts, telemetry, and integrity hashes. |

> ℹ️ Set `OMNIGENESIS_REPORT_ROOT=${OMNIGENESIS_REPORT_ROOT:-reports/localhost/omnigenesis-global-symphony}` before invoking 1.3 to match CI defaults.

---

## 2. Executive Command Surfaces

1. **Mission Control Dossier**
   ```bash
   OWNER_REPORT_ROOT=$OMNIGENESIS_REPORT_ROOT npm run owner:mission-control > $OMNIGENESIS_REPORT_ROOT/owner-mission-control.md
   ```
2. **Governance Atlas**
   ```bash
   OWNER_REPORT_ROOT=$OMNIGENESIS_REPORT_ROOT npm run owner:atlas > $OMNIGENESIS_REPORT_ROOT/owner-atlas.md
   npm run owner:diagram -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```
3. **Parameter Matrix**
   ```bash
   npm run owner:parameters -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```

---

## 3. Thermodynamic & Observability Guarantees

1. **Entropy Ledger**
   ```bash
   REPORT_ROOT=$OMNIGENESIS_REPORT_ROOT npm run thermodynamics:report > $OMNIGENESIS_REPORT_ROOT/thermodynamics-report.md
   ```
2. **Monitoring Sentinels**
   ```bash
   REPORT_ROOT=$OMNIGENESIS_REPORT_ROOT npm run monitoring:sentinels > $OMNIGENESIS_REPORT_ROOT/monitoring-sentinels.json
   npm run monitoring:validate -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```
3. **Owner Pulse**
   ```bash
   npm run owner:pulse -- --report-root $OMNIGENESIS_REPORT_ROOT
   npm run owner:verify-control -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```

---

## 4. Validator Assurance & Emergency Rehearsal

1. **Validator CLI Proof**
   ```bash
   node examples/agentic/v2-validator.js --plan demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/project-plan.json --report-root $OMNIGENESIS_REPORT_ROOT
   ```
2. **Emergency Pause Drill**
   ```bash
   npm run owner:emergency -- --report-root $OMNIGENESIS_REPORT_ROOT
   npm run pause:test -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```
3. **Incident Tabletop**
   ```bash
   npm run incident:tabletop -- --report-root $OMNIGENESIS_REPORT_ROOT
   ```

---

## 5. Archival & Publication

1. **Bundle Artefacts**
   ```bash
   tar -czf reports/localhost/omnigenesis-global-symphony.tar.gz -C reports/localhost omnigenesis-global-symphony
   ```
2. **Integrity Hashing**
   ```bash
   shasum -a 256 reports/localhost/omnigenesis-global-symphony.tar.gz
   ```
3. **Upload to IPFS / CAR**
   ```bash
   npm run demo:asi-takeoff:kit -- --report-root $OMNIGENESIS_REPORT_ROOT --car-path $OMNIGENESIS_REPORT_ROOT/omnigenesis.car
   ```

---

## 6. Mainnet Escalation Notes

- Point the demo pipeline at production deployment artifacts:
  ```bash
  NETWORK=mainnet \
  ASI_TAKEOFF_PLAN_PATH=demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/project-plan.json \
  AURORA_REPORT_SCOPE=omnigenesis-global-symphony \
  npm run demo:asi-takeoff:local
  ```
- Swap RPC endpoints by exporting `MAINNET_PROVIDER_URL` and `ALCHEMY_API_KEY` as required by the existing Hardhat network definitions.
- Update `OWNER_SAFE_ADDRESS` in `.env` to route governance bundles into the correct multisig.

---

## 7. Verification Checklist

- [ ] All commands returned exit code 0.
- [ ] `reports/<network>/omnigenesis-global-symphony` contains receipts, governance kit, mission dossier, thermodynamics report, monitoring validation summary, and owner atlas artifacts.
- [ ] `monitoring:validate` and `owner:verify-control` produced no high-severity findings.
- [ ] Hashes recorded in the governance kit match locally recomputed checksums.
- [ ] Emergency pause drill executed successfully with receipts archived.

---

## Appendix — Accountability Matrix

| Domain | Primary | Backup | Evidence |
| ------ | ------- | ------ | -------- |
| Protocol Deployment | Automation Engineer | Owner Delegate | `deploy.json`, `governance-kit.md` |
| Mission Planning | Macroeconomic Strategist | Policy Council | `project-plan.json`, `mission.json` |
| Thermodynamics | Incentive Physicist | Validator Lead | `thermodynamics-report.md`, `owner:parameters` output |
| Monitoring | Sentinel Architect | Reliability Captain | `monitoring-sentinels.json`, `monitoring:validate` logs |
| Emergency Response | Control Tower | Safety Council | `owner:emergency` transcript, `pause:test` receipts |
