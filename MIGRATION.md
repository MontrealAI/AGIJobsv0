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
