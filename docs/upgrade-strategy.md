# Upgrade Strategy

Upgrades to deployed modules should minimize disruption and preserve
on-chain state. A typical sequence is:

1. **Pause operations** – call `pause()` on the `JobRegistry` and any
   related modules to prevent new jobs or disputes during the migration.
2. **Deploy the replacement module** – deploy the new contract version
   and configure it using values read from the old module so behaviour is
   preserved.
3. **Migrate state** – if the module maintains persistent state (e.g.
   configuration values or active records), copy that data from the old
   module into the new one. Use helper scripts, such as
   `scripts/migrateDisputeModule.ts`, to automate the process.
4. **Update references** – point the `JobRegistry` or other coordinating
   contracts at the new module address.
5. **Resume service** – once checks confirm the new module is functioning
   correctly, call `unpause()` on previously paused contracts to restore
   normal operation.

Following this strategy allows upgrades to occur safely while maintaining
compatibility with existing on-chain data.
