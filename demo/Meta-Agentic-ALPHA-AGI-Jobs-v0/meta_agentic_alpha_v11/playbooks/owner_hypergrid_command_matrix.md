# Owner Hypergrid Command Matrix (V11)

The Hypergrid Console exposes the full control surface as intuitive actions. A
non-technical owner can rotate guardians, rewire treasury flows, or escalate the
curriculum from a single YAML-powered interface.

## Immutable Guarantees

- Guardian quorum: 7 primaries, 5 failover guardians
- Timelock: 90 minutes with guardian fast-track window
- Emergency pause: immediate, owner + guardian signature
- CI V2: all unstoppable actions require a green CI verdict
- Execution mesh: every call simulated via `eth_call`/`cast call` before commit

## Hypergrid Switches

| Switch | Latency | Impact |
| ------ | ------- | ------ |
| `activate-hypergrid-emergency-pause` | 10s | Freeze execution mesh while telemetry stays live |
| `rotate-hypergrid-guardians` | 15s | Promote failover guardians, rebalance quorum weights |
| `deploy-hyper-compounding` | 18s | Re-route treasury to alpha factories + reserves |
| `escalate-open-ended-curriculum` | 14s | Increase challenge difficulty, spawn new mission threads |
| `overclock-execution-mesh` | 20s | Increase throughput with rate limiting + antifragility probes |
| `refit-sovereign-governance` | 22s | Refresh delegation matrix and policy envelopes |

## Gasless & Account Abstraction Controls

- `paymaster_topup`: Instant ERC-4337 paymaster refill
- `sponsor_bundle`: Submit sponsored user operations with guardian guardrails
- `rotate_session_keys`: Rotate session keys, notify guardian mesh
- `renew_session_key`: Issue limited-scope override key for temporary missions
- `adjust_gasless_budget`: Tune monthly spend for sponsored transactions

## Autopilot Modes

1. `cruise` — Balance alpha queues, keep antifragility buffers warm
2. `overdrive` — Aggressively expand mission threads under antifragility cover
3. `sentinel` — Harden risk guardrails, gate overrides behind guardian approval
4. `nocturne` — Run nightly retrospectives, treasury sync, and CI report digestion
5. `launchpad` — Spin up new opportunity cells and align guardians automatically

## Owner Prompts & Actions

- Render Hypergrid Sovereignty Matrix
- List pending unstoppable overrides with timers
- Summarise treasury compounding cycle and reserves
- Forecast regulatory response window and compliance plan
- Outline next curriculum escalation + simulation coverage

Every action is checkpointed to the Hypergrid scoreboard, giving the owner a
complete audit trail and instant rollback surface.
