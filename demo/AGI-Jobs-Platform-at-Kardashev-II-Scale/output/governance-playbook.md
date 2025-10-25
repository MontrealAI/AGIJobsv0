# Kardashev II Governance Playbook

1. **Pause orchestration:** Execute `forwardPauseCall(SystemPause.PAUSE_ALL)` from the multisig, verify sentinels acknowledge, then resume with `forwardPauseCall(SystemPause.UNPAUSE_ALL)` once the guardian quorum signs.
2. **Retune guardrails:**
   - Set `guardianReviewWindow` to `900` seconds for interplanetary latency.
   - Adjust `globalAutonomyFloorBps` to `8500` to unlock orbital autonomy.
   - Update `energyOracle` to the live telemetry endpoint defined in `config/energy-feeds.json`.
   - Confirm `knowledgeGraph` pointer matches the knowledge mesh contract.
3. **Identity operations:** Register new agents via ENS + DID bundles, rotate certificates for Mars sentinels, and revoke stale identities; rerun `npm run demo:kardashev` to ensure reputation dispersion < 0.7 Gini.
4. **Capital stream oversight:** Call `configureCapitalStream` for each domain to reflect the captured MW; confirm RewardEngineMB temperature cooled by ≥4%.
5. **Manifest evolution:** Upload the new manifesto to IPFS, call `updateManifesto(uri, hash)`, then append a fresh self-improvement cadence with zk-proof placeholders recorded.

All actions are auditable; copy/paste-ready commands are available via `npm run demo:kardashev -- --print-commands`.
