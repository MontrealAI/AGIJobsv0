
# α-AGI MARK – Foresight DEX & Risk Oracle Demo

This demo shows how AGI Jobs v0 (v2) empowers a non-technical operator to deploy an on-chain foresight market, complete with a bonding curve treasury, validator-driven risk oracle, launchpad finalisation, and sovereign vault custody.

## Quickstart

```bash
npx hardhat --config demo/alpha-agi-mark/hardhat.config.ts test
npx hardhat --config demo/alpha-agi-mark/hardhat.config.ts run demo/alpha-agi-mark/scripts/runDemo.ts
```

The test suite verifies bonding curve math, validator gating, and owner failsafes. The demo script deploys the full stack and simulates validators and investors collaborating to green-light a Nova-Seed.

## Components

- **AlphaAgiMark.sol** – ERC-20 bonding curve market with pausing, whitelisting, owner overrides, and launch finalisation / abort controls.
- **ValidatorRiskOracle.sol** – Validator council that casts approvals. Threshold, membership, and overrides remain fully owner-configurable.
- **NovaSeedNFT.sol** – Minimal ERC-721 capturing the foresight artefact that the market finances.
- **SovereignVault.sol** – Receives the treasury after a successful launch and allows owner-managed disbursement.

## Owner Control Surface

Run the Hardhat console to inspect parameters at any time:

```bash
npx hardhat --config demo/alpha-agi-mark/hardhat.config.ts console --network hardhat
```

Key capabilities:

- Pause/unpause the market instantly.
- Toggle KYC whitelist enforcement and update allowed participants.
- Adjust validators, approval thresholds, and override validation outcomes.
- Lock or update pricing parameters before launch.
- Abort or finalise the launch, directing funds to a sovereign vault of choice.

## Continuous Integration

Add the workflow `.github/workflows/demo-alpha-agi-mark.yml` to ensure tests and the scripted walkthrough execute on every pull request.
