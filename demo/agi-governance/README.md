# 🎖️ Solving α-AGI Governance 👁️✨ – AGI Jobs v2 Grand Demonstration

> **Purpose.** Empower non-technical stewards to command a globally coordinated α-AGI governance lattice directly from the AGI Jobs v2 toolchain, proving that the platform is a production-ready superintelligent operations console.

## Why this demonstration matters

- **Production-grade control.** A single command deploys a Hamiltonian-governed council, quadratic voting exchange, global timelock, and antifragile monitoring primitives entirely from first principles.
- **Owner supremacy guaranteed.** The contract owner retains absolute authority—able to update parameters, pause execution layers, rotate pauser roles, and redirect treasuries instantly through the timelock and quadratic voting fabric.
- **Thermodynamic accountability.** Every action exports energy, entropy, and Gibbs free-energy diagnostics so operators can confirm that coordination efficiency asymptotically approaches the Landauer limit.
- **Zero-friction for non-technical leaders.** Plain-language prompts, auto-generated reports, and a defensive timeline make the entire governance drill executable by a strategic director without Solidity expertise.

## Prerequisites

| Requirement | Why it matters |
|-------------|----------------|
| Node.js 20.18.1 | Matches the repository toolchain for deterministic builds. |
| `npm install` (run once) | Installs Hardhat, Ethers, and supporting libraries. |
| Local Hardhat network | Automatically spawned by the demo; no manual node management needed. |

Ensure you have executed `npm install` at least once in the repository root.

## Quickstart – run the full α-AGI governance drill

```bash
npm run compile
npm run demo:agi-governance
```

The first command builds the v2 contracts. The second launches a 100% automated scenario that:

1. Boots a canonical AGI governance stack (votes token, timelock, AGI Governor, quadratic voting exchange, and the Global Governance Council) on the Hardhat network.
2. Mints governance power, distributes it across autonomous nations, and wires the Hamiltonian incentive surface.
3. Runs a quadratic-voting session that funds antifragile risk mitigations while logging dissipation and free-energy deltas.
4. Passes two global mandates through the AGI Governor, proving that the owner can pause/unpause the council, rotate pauser roles, and rewrite nation weights.
5. Emits a comprehensive mission dossier into `demo/agi-governance/reports/` including JSON analytics and an executive markdown brief.

## Output artefacts

After a successful run you will find the following generated files:

- `reports/mission-timeline.json` – canonical event log for replay or audit tooling.
- `reports/mission-timeline.md` – executive brief with plain-language annotations for each action.
- `reports/thermodynamics.json` – Gibbs free-energy, Hamiltonian flux, and entropy diagnostics.
- `reports/final-state.json` – Snapshot of smart contract parameters, balances, and risk envelope after all proposals land.

These artefacts are automatically overwritten on each run so you can re-execute the drill without manual cleanup.

## Interpreting the thermodynamic report

| Metric | Description |
|--------|-------------|
| `hamiltonianEnergy` | Aggregate kinetic+potential cost of governance actions derived from quadratic voting stakes. |
| `freeEnergyDelta` | Gibbs free-energy shift as the stack converges toward antifragile equilibrium (negative is better). |
| `entropyIndex` | Shannon-style entropy of the mandate landscape; values below 0.25 indicate tightly aligned incentives. |
| `landauerRatio` | Ratio of observed dissipation to the Landauer bound; values close to 1.0 prove maximal efficiency. |

The script validates each metric three ways: direct numeric computation, symbolic cross-check, and an auxiliary Monte-Carlo sampler.

## Extending to Ethereum mainnet

The scenario is local-first, yet all components are mainnet-ready:

1. Swap the Hardhat network for an anvil, Goerli, Sepolia, or mainnet endpoint using `--network` on the `hardhat run` command.
2. Point the script at production AGIALPHA and votes token addresses by editing the configuration block at the top of `scripts/v2/agiGovernanceDemo.ts`.
3. Commit to the timelock delay and confirm signers via multisig before executing live proposals.

Because the owner retains the treasury keys, pauser privileges, and proposal majority, migrating to mainnet preserves full operational control.

## Safety and rollback controls

- **Global pause:** The owner can halt the council instantly via a timelock proposal (demonstrated in the script).
- **Nation quarantine:** Mandates can deactivate any nation in a single transaction, freezing its voting weight.
- **Quadratic voting treasury sweep:** Idle quadratic voting balances automatically sweep to the treasury once rewards settle.
- **Replayable timeline:** Each action is timestamped, hashed, and written to disk for deterministic auditing and rollback simulations.

## Troubleshooting

| Symptom | Resolution |
|---------|------------|
| `MockVotesToken` artifact missing | Run `npm run compile` to regenerate build artefacts. |
| Script exits with `execution reverted: owner` | Ensure the script ran uninterrupted; ownership transfers happen mid-flight. Re-run to reset. |
| Hardhat gas estimation issues | Delete `cache/` and `artifacts/`, then re-run the quickstart commands. |

## Next steps

- Run `reports/mission-timeline.md` through your GRC tooling to ingest the canonical governance audit trail.
- Use `reports/final-state.json` as seed configuration for a mainnet timelock deployment.
- Extend `scripts/v2/agiGovernanceDemo.ts` with your own mandate catalogue or integrate it with CI to continuously verify governance readiness.

🎯 *AGI Jobs v2 does not merely demonstrate governance—it lets you command an antifragile superintelligence coordination plane with a single click.*
