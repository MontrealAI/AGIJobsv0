# Owner Control Matrix — Meta-Singularity

## Instant Command Scripts

| Action | Script | Outcome |
| --- | --- | --- |
| Pause entire platform | `scripts/v2/systemPauseAction.ts` | Immediately halts orchestrator + marketplace with guardian quorum notifications |
| Resume orchestrator | `scripts/v2/systemResumeAction.ts` | Restarts orchestrator once antifragility buffers are healthy |
| Update treasury routes | `scripts/v2/updateRewardEngine.ts` | Reconfigures fee splits, liquidity routes, and unstoppable reserves |
| Rotate guardians | `scripts/v2/rotateGovernance.ts` | Rotates primary/backup guardians and updates session keys |
| Upgrade modules | `scripts/v2/updateAllModules.ts` | Deploys latest module versions with timelock + CI verification |

## Mutable Parameters

- `job_fee_bps` — adjust marketplace fee in basis points (default 42 bps)
- `validator_bond` — guardian bond size in AGIALPHA (default 85k)
- `alpha_multiplier` — multiplier applied to opportunity ROI (default 1.85)
- `treasury_drawdown_limit` — max safe treasury drawdown % (default 3.0)

All parameters can be updated without redeploying contracts. Run
`python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_demo_v7.py --config <path>`
after editing the scenario to regenerate dashboards + reports.
