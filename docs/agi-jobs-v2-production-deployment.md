# AGI Jobs v2 Production Deployment

This guide explains how to deploy the modular AGI Jobs v2 stack on mainnet
using Etherscan. It focuses on production practices: verifiable contract
builds, address recording and safe ownership controls.

## Prerequisites
- **$AGIALPHA token:** Deployed ERC‑20 with 18 decimals and known address.
- **Governance account:** Multisig or timelock that will ultimately own the
  modules.
- **Etherscan access:** Browser wallet with ETH for gas and an API key for
  verifying contracts.
- **ENS data:** Namehashes for `agent.agi.eth` and `club.agi.eth` plus optional
  Merkle roots for allowlists.
- **Node environment:** `npm install` and `npx hardhat compile` completed so
  bytecode matches the source used for verification.

## Module Overview
- `JobRegistry` – central job coordination.
- `StakeManager` – escrows and burns tokens.
- `ValidationModule` – commit‑reveal validation.
- `ReputationEngine` – tracks validator performance.
- `FeePool` – splits protocol fees and burns tokens.
- `PlatformRegistry` / `PlatformIncentives` / `JobRouter` – platform support.
- `DisputeModule` – resolves challenges.
- `CertificateNFT` – on‑chain credentials.
- `TaxPolicy` (optional) – tax acknowledgement gate.
- `ModuleInstaller` – helper that wires modules and returns ownership.

## Step-by-Step Deployment via Etherscan
1. Deploy each contract from its **Contract → Deploy** tab. Supply constructor
   parameters in 18‑decimal units.
2. After each deployment:
   - Record the address in `docs/deployment-addresses.md` or a similar log.
   - Verify the source via **Verify and Publish** so bytecode is matched to
     the repository.
3. Prioritise deploying `ModuleInstaller` last if using it for wiring.

## ModuleInstaller Wiring
1. Transfer ownership of every module to the installer.
2. From the governance account, call `initialize` with all module addresses.
   Ownership is returned automatically.
3. Confirm `Initialized`/`OwnershipTransferred` events and record the final
   addresses. See [module-installer.md](module-installer.md) for details.

## Manual Wiring Fallback
If the installer is unavailable, wire contracts individually:
1. On `JobRegistry` call `setModules(validation, stake, reputation, dispute,
   certificate, feePool, new address[](0))`.
2. Call `setJobRegistry(jobRegistry)` on `StakeManager`, `ValidationModule` and
   `CertificateNFT`.
3. Authorise `PlatformIncentives` on `PlatformRegistry` and `JobRouter`.
4. Verify wiring with the provided `scripts/verify-wiring.ts` script.

## Post-Deployment Configuration
- Transfer ownership of every module to the governance contract.
- Enable emergency controls such as
  [SystemPause](system-pause.md) if required.
- Configure ENS roots, Merkle allowlists and protocol fees through their
  respective setters.
- Save final contract addresses for future upgrades and monitoring.

## Recording Deployment Addresses
All deployed contract addresses should be tracked in
[docs/deployment-addresses.json](deployment-addresses.json). After a contract is
verified on Etherscan, edit this file and replace the placeholder address with
the value from the deployment transaction:

```json
{
  "jobRegistry": "0x1234567890abcdef1234567890abcdef12345678"
}
```

Check the updated file into Git so other operators have a canonical record of
the current addresses.

## Best Practices
- **True token burning:** Set `burnPct` only if the `FeePool` forwards tokens to
  the zero address. Verify the burn destination and emitted events.
- **Owner updatability:** Ensure `transferOwnership` works for each module so
  governance can rotate keys or migrate to a new controller.
- **Verification & records:** Every contract should be verified on Etherscan
  and documented with its address and block number.
- **Pause readiness:** Keep the system pausable and test `pauseAll`/`unpauseAll`
  before user funds are at risk. See [system-pause.md](system-pause.md).

Following these steps results in a reproducible, auditable and upgradeable
AGI Jobs v2 deployment.
