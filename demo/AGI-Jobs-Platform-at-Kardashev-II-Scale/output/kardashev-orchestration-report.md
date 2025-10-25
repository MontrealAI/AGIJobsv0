# Kardashev II Orchestration Runbook

**Manifest hash**: 0xc285085cf97f46c1ad59df7e8b337161f922d24d0b653880755c567c0abd27e6
**Dominance score**: 90.0 / 100

---

## Governance actions
1. Load `output/kardashev-safe-transaction-batch.json` into Safe (or timelock). 
2. Verify manager, guardian council, and system pause addresses in review modals.
3. Stage pause + resume transactions but leave them unsent until incident drills.
4. Confirm self-improvement plan hash matches guardian-approved digest.

---

## Energy telemetry
* Captured GW (Dyson baseline): 420,000 GW.
* Utilisation: 57.62% (margin 0.13%).
* Regional availability: earth 82000 GW · mars 24000 GW · orbital 136000 GW.

---

## Compute & domains
* Aggregate compute 49.10 EF · 4,480,000,000 agents · deviation 0.45% (≤ 0.75%).
* **EARTH** – 18.40 EF, 2,800,000,000 agents, resilience 94.50%.
* **MARS** – 6.10 EF, 720,000,000 agents, resilience 93.50%.
* **ORBITAL** – 24.60 EF, 960,000,000 agents, resilience 95.90%.

---

## Scenario stress sweep
* **20% demand surge vs Dyson safety margin** — status NOMINAL (confidence 100.0%) · Dyson lattice absorbs surge with 129,600 GW spare.
  - Simulated demand: 290,400 GW (ok)
  - Remaining buffer: 129,600 GW (ok)
  - Thermostat margin: 52,500 GW (ok)
  - Utilisation: 69.14% (ok)
  - Recommended: Dispatch pause bundle for non-critical Earth workloads. · Increase stellar thermostat target via setGlobalParameters if surge persists.
* **Interplanetary bridge outage simulation** — status WARNING (confidence 53.1%) · Failover latency 113s leaves 8s slack within 120s failsafe.
  - Baseline latency: 90s (ok)
  - Failover latency: 113s (ok)
  - Failsafe budget: 120s (ok)
  - Slack: 8s (ok)
  - Recommended: Execute bridge isolation routine from mission directives if slack < 0. · Rebalance capital streams to spin up orbital relays before load crosses failsafe.
* **Sentinel outage (10 min) coverage test** — status NOMINAL (confidence 100.0%) · Guardian window stays protected under sentinel gap.
  - Minimum sentinel coverage: 1800s (ok)
  - Simulated coverage: 1200s (ok)
  - Guardian window: 900s (ok)
  - Coverage ratio: 133.33% (ok)
  - Recommended: Register standby sentinel via Safe batch if ratio < 100%. · Shorten guardian drill cadence until redundancy restored.
* **Compute drawdown (15%) resilience** — status WARNING (confidence 35.0%) · Deviation 14.62% exceeds tolerance 0.75%.
  - Projected compute: 48.88 EF (ok)
  - Stressed compute: 41.73 EF (check)
  - Deviation: 14.62% (check)
  - Tolerance: 0.75% (ok)
  - Recommended: Authorise capital stream expansion for orbital compute nodes. · Notify guardians to ratify temporary autonomy reduction if deviation persists.
* **Dyson phase slip (30 days)** — status NOMINAL (confidence 95.0%) · Schedule buffer absorbs slip with 490 days remaining.
  - Total timeline: 900 days (ok)
  - Slip: 30 days (ok)
  - Remaining buffer: 490 days (ok)
  - Slip ratio: 3.33% (ok)
  - Recommended: Accelerate self-improvement plan execution to reclaim schedule slack. · Reallocate capital from Earth infrastructure to Dyson assembly for this epoch.

---

## Bridges
* earthToMars: latency 90s, bandwidth 14.6 Gbps, operator 0xb12d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d.
* earthToOrbital: latency 2s, bandwidth 240 Gbps, operator 0xd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3.

---

## Dyson programme
* Seed Swarm: 1,200 satellites, 4,800 GW, 120 days.
* Helios Halo: 6,800 satellites, 64,000 GW, 260 days.
* Crown Array: 24,000 satellites, 420,000 GW, 520 days.

---

## Reflection checklist
- [ ] Guardian coverage ≥ guardian review window.
- [ ] Energy utilisation within safety margin.
- [ ] Bridge latency ≤ failsafe latency.
- [ ] Pause bundle verified on live SystemPause contract.
