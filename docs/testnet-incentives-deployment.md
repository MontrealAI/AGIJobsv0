# Testnet Incentives Deployment

This example shows how to deploy the thermodynamic incentives stack on a public testnet such as Sepolia.

```bash
npx hardhat run scripts/deploy-v2.ts --network sepolia
```

Recommended starting parameters used by the script:

- **Thermostat**
  - initial temperature `1.0` (`1e18`)
  - min/max temperature `0.5`/`2.0` (`5e17`/`2e18`)
- **RewardEngineMB role shares**
  - Agents `65%`
  - Validators `15%`
  - Operators `15%`
  - Employers `5%`
- **μ defaults** – `0` for all roles
- **EnergyOracle signers** – add the deploying address as an authorised signer

Adjust parameters and signer addresses as needed for local testing.
