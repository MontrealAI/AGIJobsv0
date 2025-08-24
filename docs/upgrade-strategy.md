# Upgrade Strategy

Upgrades to deployed modules should minimize disruption and preserve
on-chain state. Follow this sequence whenever replacing a module:

1. **Pause activity** – call `pause()` on the `JobRegistry` and every
   affected module. Pausing halts new jobs or disputes while keeping
   existing state accessible.
2. **Deploy the replacement module** – deploy the new contract version
   and initialise it with values read from the old module so behaviour is
   preserved.
3. **Migrate state (if required)** – copy configuration or live records
   from the old module to the new one. Helper scripts such as
   `scripts/migrateDisputeModule.ts` can automate this process.
4. **Re-point `JobRegistry`** – update references to the new module. This
   can be done directly via `JobRegistry.setModules` or by wiring
   everything at once through `ModuleInstaller.initialize` (see
   `scripts/v2/initializeInstaller.ts`).
5. **Transfer ownership back to governance** – once modules are wired,
   reclaim ownership using each module's `transferOwnership` function.
6. **Resume service** – after verifying the new module, call `unpause()`
   on previously paused contracts to restore normal operation.

> **Warning**
> Upgrading while a job is in progress can lead to unexpected behaviour
> if state is not migrated correctly. The test
> `test/v2/MidJobUpgrade.test.js` demonstrates swapping the validation
> module mid-job and asserts that job data remains intact.

Following this strategy allows upgrades to occur safely while maintaining
compatibility with existing on-chain data.
