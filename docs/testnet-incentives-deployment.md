# Testnet Incentives Deployment

This preserved example rehearses the thermodynamic incentives stack on an isolated Hardhat chain. It deploys `ValidationStub` and is not a public-testnet or production deployment route. For public networks, deploy the real modular protocol with the [current staged guide](deployment-v2-agialpha.md), then review and wire the optional thermodynamic modules and their signer policies separately.

```bash
npx hardhat run scripts/deploy-v2.ts --network hardhat
```

Fixture parameters used by the script (not production recommendations):

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
