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
