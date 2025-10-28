# Sovereign Control Playbook — Meta-Agentic α-AGI Jobs V5

| Control | Purpose | How the owner adjusts |
|---------|---------|-----------------------|
| Emergency pause | Freeze all dispatch pipelines instantly | `python demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/scripts/owner_controls.py --config demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v5/config/scenario.yaml --set scenario.owner.emergency_pause=true` |
| Guardian quorum | Define how many guardians must approve | `--set scenario.owner.approvals_required=4` |
| Unstoppable reserve | Capital portion permanently protected | `--set scenario.treasury.unstoppable_reserve_percent=26` |
| Antifragility buffer | Risk tolerance dial | `--set scenario.treasury.risk_limits.antifragility_buffer_percent=30` |
| Bundler/Paymaster | Swap account abstraction infrastructure | `--set scenario.gasless.bundler=new-bundler` |

All changes are simulation-first: rerun `meta_agentic_demo_v5.py` to regenerate dashboards
and ensure the orchestrator honours the new guardrails before any live execution.
