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
* **EARTH** – 18.40 EF, 2,800,000,000 agents, resilience 94.50%.
* **MARS** – 6.10 EF, 720,000,000 agents, resilience 93.50%.
* **ORBITAL** – 24.60 EF, 960,000,000 agents, resilience 95.90%.

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
