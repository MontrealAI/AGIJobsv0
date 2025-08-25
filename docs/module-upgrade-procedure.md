# Module Upgrade Procedure

Upgrading a deployed module requires coordination to avoid disrupting
ongoing jobs. Follow these steps to replace a module while preserving
state:

1. **Pause**
   - Call `pause()` on `JobRegistry` and any modules being replaced to
     prevent new activity during the upgrade.
2. **Deploy the new module**
   - Deploy the upgraded contract and configure any constructor
     parameters. Transfer governance of `JobRegistry` to the
     `ModuleInstaller` if using the helper.
3. **Migrate state**
   - Wire the new module using the installer or a migration script. For
     validation modules this can be performed with
     `scripts/v2/migrateValidationModule.ts`, which invokes
     `ModuleInstaller.replaceValidationModule` to copy references and
     restore governance.
4. **Unpause**
   - After verifying the new module, transfer governance back to the
     original owner and call `unpause()` on previously paused contracts
     to resume normal operation.

This process ensures upgrades occur safely with minimal downtime while
retaining on‑chain state.
