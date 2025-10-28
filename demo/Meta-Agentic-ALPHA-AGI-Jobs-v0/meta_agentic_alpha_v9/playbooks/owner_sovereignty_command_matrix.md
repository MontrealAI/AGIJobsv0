# Owner Sovereignty Command Matrix — V9

This matrix enumerates every lever the sovereign owner can pull instantly from
the Sovereignty Console. Adjust the YAML, rerun the CLI, and AGI Jobs v0 (v2)
regenerates all artefacts with these updated parameters.

## Core Commands

1. **Pause / Resume** — `scripts/v3/systemPauseAction.ts`,
   `scripts/v3/systemResumeAction.ts`
2. **Unstoppable Switches** — `scripts/v3/unstoppablePause.ts`,
   `scripts/v3/unstoppableResume.ts`, `scripts/v3/unstoppableRebalance.ts`
3. **Treasury Update** — `scripts/v3/updateRewardEngine.ts`
4. **Guardian Rotation** — `scripts/v3/rotateGovernance.ts`
5. **Module Upgrade** — `scripts/v3/updateAllModules.ts`
6. **Emergency Shutdown** — `scripts/v3/emergencyShutdown.ts`
7. **Redeploy Modules** — `scripts/v3/redeployModules.ts`
8. **Instantiate New Domain** — `scripts/v3/instantiateNewDomain.ts`
9. **Bootstrap Guardian Mesh** — `scripts/v3/bootstrapGuardianMesh.ts`

## Sovereign Parameters

- `job_fee_bps`: default 32 (owner can set any 0-100)
- `validator_bond`: default 112000 (owner can raise/lower instantly)
- `alpha_multiplier`: default 2.44 (owner tunes alpha amplification)
- `treasury_drawdown_limit`: default 2.2 (owner can tighten or loosen)
- `guardian_stake_floor`: default 72000 (owner enforces guardian strength)
- `autopilot_velocity`: default 1.2 (owner controls autopilot aggressiveness)

## Guardian Mesh

- Guardian quorum: 5 / 6 primaries
- Failover guardians: 4
- Circuit breaker: 8 minutes
- Emergency pause: enabled
- Unstoppable threshold: 94%

## Treasury Streams

| Stream | Cadence | Route | Amount |
| --- | --- | --- | --- |
| Alpha Factory Reinforcement | hourly | treasury/alpha-orbit | 52,000 |
| Guardian Mesh Sustainment | 4h | resilience/phoenix-buffer | 37,000 |
| Autopilot Liquidity | daily | execution/liquidity-grid | 41,000 |
| Curriculum Lab | 12h | expansion/metaverse-signal | 28,000 |
| Opportunity Acquisition | 6h | acquisition/convergence-fund | 45,000 |

## CI & Safety

- CI V2 checks: pytest, orchestrator-ci, foundry, static-analysis, fuzzing,
  scorecard, governance-invariants.
- Gas model: ERC-4337 bundler `sovereignty-bundler` + paymaster
  `account-abstraction/sovereignty-paymaster.json`.
- Session keys: 8, with rotation autopilot.
- Guardian override required for unstoppable threshold changes.

Adjust anything above and rerun `meta_agentic_demo_v9.py`. AGI Jobs v0 (v2)
rebuilds the entire sovereignty experience, proving non-technical owners can
command superintelligent economic infrastructure.
