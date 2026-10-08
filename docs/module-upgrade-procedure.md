# Module Upgrade Procedure

A module replacement changes references. It does not copy validation rounds,
commitments, reveals, stake locks or other module-local state. JobRegistry job
records remain in the same registry, but this alone does not make an in-flight
validation migration safe. Never treat a pause or a `ValidationModuleMigrated`
event as proof that the entire system is ready.

## Prepare a drained maintenance window

1. Stop accepting new work and let existing jobs reach `Finalized` or `Cancelled`.
   Resolve disputes and finish validation rounds and validator stake unlocking
   before revoking the old module's permissions.
2. Pause JobRegistry and both old and replacement validation modules. Preserve
   the old module and its evidence. Do not renounce its ownership or discard
   historical addresses.
3. Deploy the replacement using the current implementation deployment helper.
   Review its bytecode, identity policy, economic and timing configuration,
   validator selection settings, pauser and governance destination.
4. Prepare a reviewed governance transaction batch that updates **all** links:
   the replacement's JobRegistry, StakeManager, ReputationEngine and
   IdentityRegistry; StakeManager's validation module; ReputationEngine's new
   caller authorization and old caller revocation; and JobRegistry's validation
   module. Remove any old validator lock-manager authorization after verifying
   all its locks are released. Preserve other registry modules and permissions.
5. For a SystemPause-managed deployment, update the pause controller's module
   references and delegated pauser permissions as part of that governance plan.
   Verify ownership of every managed module. A direct EOA migration script cannot
   impersonate SystemPause, a timelock or a multisig.

For an upgrade with nonterminal jobs or required module-local state migration,
stop here and design, audit and rehearse an explicit state migration. The generic
helper does not support that operation.

## Narrow EOA completion script

`scripts/v2/migrateValidationModule.ts` can finish an already prepared, drained,
EOA-governed reference replacement. Before its first transaction it checks:

- The connected signer owns the installer, old ValidationModule, StakeManager
  and ReputationEngine; the installer owns JobRegistry and the replacement.
- JobRegistry and both validation modules are paused, and the current version-2
  interface is readable.
- The replacement's full references, StakeManager's replacement reference, new
  reputation permission, and removal of the old module's extra permissions.
- Every recorded job is finalized or cancelled, with no unknown job state,
  untallied old round, remaining validator stake lock, or conflicting replacement
  round for those job IDs. Read failures abort the operation.

The preceding ownership and wiring preparation is itself privileged maintenance:
review it before signing, and keep the registry paused throughout. The preflight
is not an atomic substitute for governance coordination. Use one controlled
maintenance process; do not send competing governance transactions while it runs.

```sh
INSTALLER=0x... REGISTRY=0x... NEW_VALIDATION=0x... \
  npx hardhat run scripts/v2/migrateValidationModule.ts --network <network>
```

On a confirmed transaction the script verifies the installed reference, returned
ownership and complete dependency wiring against the receipt's block. It leaves
the registry and replacement paused for final operator checks. Its work is a
reference replacement, not a validation state migration.

The underlying historical `ModuleInstaller.replaceValidationModule` tolerates
failed optional setter calls. Do not call it directly as a current live upgrade
procedure. The script's strict preparation and postcondition checks constrain
that legacy helper; arbitrary callers and unsupported modules do not gain those
checks automatically. Use a reviewed native governance batch for multisig or
SystemPause-managed stacks.

## Verify before unpausing

Record the old and new addresses, creation and governance receipts, full module
references, owners/pending owners, caller permissions, paused states and the
terminal-job/lock inventory. Rehearse one current commit/reveal/verification and
settlement cycle on a disposable chain with the exact configuration. Check
certificate creation, fee routing, dispute handling and global pause operation.
Only then unpause through the authorized governance account and resume work.
