# System Pause

`SystemPause` lets governance halt or resume the core modules in one
transaction. After deployment you must complete two governance steps:

1. Wire module addresses using `setModules`.
2. Once ownership of each module is transferred to `SystemPause`, call
   `refreshPausers` so it regains the `setPauser` permissions required for
   `pauseAll` / `unpauseAll`.

Each module address passed to the constructor or `setModules` must be a
non-zero address pointing to a deployed contract. The contract reverts with
`InvalidJobRegistry`, `InvalidStakeManager`, `InvalidValidationModule`,
`InvalidDisputeModule`, `InvalidPlatformRegistry`, `InvalidFeePool`, or
`InvalidReputationEngine` if validation fails.

## Governance and Runbook

- Keep `SystemPause.owner()` pointed at the existing DAO timelock or multisig.
  That governance address is the only actor allowed to call
  `pauseAll()`, `unpauseAll()`, `setModules()`, or `refreshPausers()`.
- Transfer ownership of every pausable module (JobRegistry, StakeManager,
  ValidationModule, DisputeModule, PlatformRegistry, FeePool, ReputationEngine,
  ArbitratorCommittee) to the deployed `SystemPause` contract before wiring
  updates. Without ownership the helper cannot reapply pauser roles.
- Run a dry run to confirm wiring and ownership before sending transactions:

  ```bash
  npx hardhat run scripts/v2/updateSystemPause.ts --network <network>
  ```

  The script aborts if any module is not owned by `SystemPause`, ensuring a
  single on-chain switch guards every critical flow. The on-chain
  `SystemPause.setModules` call also reverts when a module has not transferred
  ownership to the pause contract, so governance cannot wire an address that
  cannot be halted during an emergency.
- Re-run with `--execute` once the dry run is clean to update module wiring and
  refresh the pauser roles under governance control.

### Emergency operations

1. **Pause** – From the timelock or multisig, call `SystemPause.pauseAll()` to
   halt job creation, staking, validation, disputes, and platform registry
   updates in a single transaction.
2. **Resume** – When the incident is resolved, call `SystemPause.unpauseAll()`
   from the same governance address to bring the system back online.

## Hardhat CLI

```sh
npx hardhat console --network <network>
> const pause = await ethers.getContractAt("SystemPause", "<pause>");
> const gov = await ethers.getSigner("<governance>");
> await pause.connect(gov).setModules(
    "<registry>",
    "<stake>",
    "<validation>",
    "<dispute>",
    "<platformRegistry>",
    "<feePool>",
    "<reputation>"
  );
> await pause.connect(gov).refreshPausers();
> await pause.connect(gov).pauseAll();
> await pause.connect(gov).unpauseAll();
```

## Etherscan

1. Open the SystemPause contract on Etherscan with your governance
   account connected.
2. In **Write Contract**, call `setModules` with the module addresses if
   not already configured.
3. After transferring module ownership to `SystemPause`, call
   `refreshPausers` so the helper can pause each contract.
4. Invoke `pauseAll` to stop the system or `unpauseAll` to resume.
