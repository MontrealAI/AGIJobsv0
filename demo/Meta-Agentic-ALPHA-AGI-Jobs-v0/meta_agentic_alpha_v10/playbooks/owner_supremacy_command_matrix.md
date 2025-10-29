# Owner Supremacy Command Matrix (V10)

The Supremacy Console exposes the entire control surface as structured,
non-technical actions. Owners can rotate guardians, reshard treasury streams,
and escalate curriculum difficulty without touching code.

## Immutable Guarantees

- Guardian quorum: 6/7 primaries, 4 failover guardians
- Timelock: 2 hours with guardian fast-track
- Emergency pause: instant, owner and guardian co-signed
- CI V2: enforced before any unstoppable switch executes

## Supremacy Switches

| Switch | Latency | Impact |
| ------ | ------- | ------ |
| `activate-emergency-pause` | 12s | Freeze all execution pathways, maintain telemetry |
| `rotate-guardian-mesh` | 18s | Promote antifragility guardians, adjust quorum weights |
| `deploy-unstoppable-treasury` | 22s | Rebalance reserves towards unstoppable alpha factories |
| `escalate-open-ended-challenges` | 16s | Increase curriculum difficulty, spawn new mission threads |

## Gasless Controls

- `paymaster_topup`: instant 4337 paymaster refill
- `session_keys_rotate`: rotate session keys and broadcast to guardians
- `bundler_refresh`: refresh bundler relays and enforce policy checks

## Autopilot Modes

1. `guardian_mesh` — rotates guardians, enforces unstoppable threshold
2. `treasury_allocator` — streams capital into reserves, factories, and antifragility buffers
3. `alpha_factory` — spins new opportunities, instrumented with antifragility probes
4. `curriculum_escalator` — evolves training curriculum across domains
5. `market_bridge` — executes cross-chain arbitrage via sponsored 4337 bundles

## Owner Prompts

- Approve guardian quorum update
- Authorize treasury supremacy sweep
- Launch new alpha thread
- Escalate curriculum complexity
- Dispatch antifragility probes

Every action writes to the Supremacy Scoreboard so owners can audit and rollback
using human-readable checkpoints.
