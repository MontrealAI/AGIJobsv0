# Protocol Migration Runbook

This document tracks contract and configuration migrations required when deploying new releases of AGI Jobs v2. Every ABI-affecting change **must** be recorded here alongside the operational steps for Safe/EOA owners.

## Template

```
## vX.Y.Z

### Summary
- Describe the high-level change.

### Required Owner Actions
- [ ] Update Safe/EOA ownership of affected modules.
- [ ] Execute governance bundles with trace IDs.
- [ ] Perform post-migration health checks (`npm run owner:health`).

### Contract Upgrades
- Contract: `<Name>` (address `<0x...>`)
  - Action: `upgrade` / `reconfigure` / `pause`
  - Notes: ...

### Configuration Updates
- Parameter: `<path>`
  - Old value: `...`
  - New value: `...`
  - Change ticket / trace ID: `...`

### Verification
- [ ] `npm run owner:doctor`
- [ ] `npm run owner:pulse`
- [ ] `npm run owner:verify-control`
```

> _Keep this document in sync with every governance or deployment change so institutional operators always have a single source of truth._

## CI expectations

- All migration-related pull requests must keep the `ci (v2) / HGM guardrails` status check green. The job validates the AGIALPHA profile configuration, runs the HGM regression suites, lints the demo assets, and smoke-tests the guided launcher.
- Run `ci/hgm-suite.sh` locally (after `npm ci` and `pip install -r requirements-python.txt`) before raising change-control requests so the HGM guardrails job passes deterministically in CI.

## Mainnet deployment guard (AGIALPHA)

Execute these steps when promoting agijobs-sovereign-labor-v0p1 to Ethereum mainnet:

1. **Verify manifests** – `npm run verify:agialpha -- --network mainnet` checks that `config/agialpha.mainnet.json` references the canonical 18-decimal AGIALPHA token (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`) and synchronises metadata with on-chain values.【F:scripts/verify-agialpha.ts†L1-L214】【F:config/agialpha.mainnet.json†L1-L26】
2. **Refresh deployment plan** – Review `deployment-config/mainnet.json` to confirm treasury, pause defaults, and ENS wiring match the release intent. Update the file if governance requested changes, then commit it for auditability.【F:deployment-config/mainnet.json†L1-L43】
3. **Run Truffle migrations** – `npx truffle migrate --network mainnet --f 1 --to 5` executes the canonical migration suite. Migration `2a_validate_mainnet_token` enforces the token address/decimals, `2_deploy_protocol` deploys the deterministic module set, and `3_wire_protocol` wires governance + ENS roots.【F:migrations/2a_validate_mainnet_token.js†L1-L118】【F:migrations/2_deploy_protocol.js†L1-L45】【F:migrations/3_wire_protocol.js†L1-L120】
4. **Capture owner artefacts** – `npm run owner:command-center -- --network mainnet --out reports/owner-control` regenerates the governance dossier for compliance archives and the CI owner-control job.【F:package.json†L372-L375】【F:.github/workflows/ci.yml†L414-L439】
5. **Upload deployment addresses** – Update `docs/deployment-addresses.json` with the emitted contract addresses and commit the change so downstream services align with the new release.【F:migrations/3_wire_protocol.js†L1-L92】

Every step is automated inside CI v2; running the checklist locally ensures the on-chain state matches the manifests before branch protection unlocks the release PR.
