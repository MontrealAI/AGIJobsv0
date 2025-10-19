# Owner Command Bundle

*Owner:* 0xA1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1
*Pauser:* 0xB2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2
*Treasury:* 0xC3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3

| # | Action | Impact | Command |
| --- | --- | --- | --- |
| 1 | Recalibrate Hamiltonian monitor | Locks the energy coupling coefficient and inertial metric to the antifragile optimum computed in the dossier. | <code>$ npm run owner:command-center -- --network mainnet --target HamiltonianMonitor --set-lambda 0.94 --set-inertia 1.08</code> |
| 2 | Adjust reward engine burn curve | Aligns emission schedule with the Landauer-calibrated burn policy. | <code>$ npm run reward-engine:update -- --network mainnet --burn-bps 600 --treasury-bps 200</code> |
| 3 | Rotate governance sentinels | Refreshes slashing guardians while keeping owner override authority. | <code>$ npm run owner:rotate -- --network mainnet --role Sentinel --count 3</code> |
| 4 | Update tax policy disclosure | Publishes the latest regulatory acknowledgement without touching business logic. | <code>$ npm run owner:update-all -- --network mainnet --module TaxPolicy --acknowledgement "Participants accept AGI Jobs v2 tax terms."</code> |

Timelock enforced: 691200 seconds. Queue urgent actions via Safe or Etherscan with the commands above.