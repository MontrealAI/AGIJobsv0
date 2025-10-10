# System Pause

`SystemPause` lets governance halt or resume the core modules in one
transaction. After deployment you must complete two governance steps:

1. Wire module addresses using `setModules`.
2. Delegate pauser management to `SystemPause` by calling
   `setPauserManager(systemPauseAddress)` on every module (JobRegistry,
   StakeManager, ValidationModule, DisputeModule, PlatformRegistry, FeePool,
   ReputationEngine, ArbitratorCommittee) from governance/owner.
3. Once ownership of each module is transferred to `SystemPause`, call
   `refreshPausers` so it regains the `setPauser` permissions required for
   `pauseAll` / `unpauseAll`.

Each module address passed to the constructor or `setModules` must be a
non-zero address pointing to a deployed contract. The contract reverts with
`InvalidJobRegistry`, `InvalidStakeManager`, `InvalidValidationModule`,
`InvalidDisputeModule`, `InvalidPlatformRegistry`, `InvalidFeePool`,
`InvalidReputationEngine`, or `InvalidArbitratorCommittee` if validation fails.

All wiring metadata lives alongside the other protocol manifests inside
`config/agialpha.json` (and optional network overrides such as
`config/agialpha.mainnet.json`). Populate the `modules.systemPause` section with
the deployed `SystemPause` address together with module pointers for
`jobRegistry`, `stakeManager`, `validationModule`, `disputeModule`,
`platformRegistry`, `feePool`, `reputationEngine`, and `arbitratorCommittee`.
`scripts/v2/updateSystemPause.ts` reads the manifest automatically and accepts
`--config <path>` when a bespoke JSON file is required.

## Governance and Runbook

- Keep `SystemPause.owner()` pointed at the existing DAO timelock or multisig.
  That governance address is the only actor allowed to call
  `pauseAll()`, `unpauseAll()`, `setModules()`, or `refreshPausers()`.
- Transfer ownership of every pausable module (JobRegistry, StakeManager,
  ValidationModule, DisputeModule, PlatformRegistry, FeePool, ReputationEngine,
  ArbitratorCommittee) to the deployed `SystemPause` contract before wiring
  updates. Without ownership the helper cannot reapply pauser roles.
- After ownership transfer, set each module's `pauserManager` to the
  `SystemPause` address so on-chain delegation succeeds without manual pauser
  rotations.
- Run a dry run to confirm wiring, ownership, and pauser status before sending
  transactions:

  ```bash
  npx hardhat run scripts/v2/updateSystemPause.ts --network <network>
  ```

  Run without `--execute` to inspect differences and ownership status. The
  helper aborts when a module is not owned or pausable by `SystemPause`, keeping
  the emergency switch authoritative. Re-run with `--execute` once the dry run
  is clean to update module wiring and refresh the pauser roles under
  governance control.
- Pass explicit overrides (for example `--arbitrator-committee <address>`) to
  test new module deployments before the manifest is updated.
- After any change, record the dry-run and execution artefacts under
  `runtime/<network>/` and attach them to the owner control ticket.

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
    "<reputation>",
    "<arbitratorCommittee>"
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
5. Update the corresponding `config/agialpha.<network>.json` entry and commit
   the manifest change so future dry runs stay in sync.
