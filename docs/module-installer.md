# Module Installer Usage

`ModuleInstaller` is an optional owner-controlled helper for connecting an
already deployed module set. It is not the complete deployment coordinator.
For a new stack, use the [deployment guide](deployment.md); the staged
`deployDefaults.ts` path records a coordinator address for interrupted-run
recovery and supports a separate governance destination.

## Initialize and return ownership

1. Deploy `ModuleInstaller`. Its owner is the account authorized to call
   `initialize`; the helper returns module ownership to that account.
2. Before transferring modules, complete the dependencies that `initialize`
   does not set. For the current contracts, verify these links:

   | Module                  | Required preparation                                                      |
   | ----------------------- | ------------------------------------------------------------------------- |
   | ValidationModule        | JobRegistry, StakeManager and ReputationEngine references                 |
   | StakeManager            | ValidationModule and FeePool references                                   |
   | ReputationEngine        | JobRegistry and ValidationModule authorized as callers                    |
   | DisputeModule           | JobRegistry, StakeManager and committee references                        |
   | CertificateNFT          | JobRegistry and StakeManager references                                   |
   | TaxPolicy, when enabled | JobRegistry authorized as an acknowledger                                 |
   | IdentityRegistry        | ENS, optional NameWrapper, ReputationEngine and attestation configuration |

3. Transfer each module's ownership/governance to the installer. For
   `IdentityRegistry` and `TaxPolicy`, this nominates the installer as
   `pendingOwner`; `initialize` now accepts those nominations on-chain before
   protected configuration calls. No account impersonation is needed.
4. From the installer owner, call `initialize` with all twelve module addresses,
   the club and agent root nodes, validator and agent Merkle roots, and the
   additional acknowledger array. Only `taxPolicy` may be omitted with the zero
   address. Check the actual ABI instead of historical eleven-argument examples.
5. Confirm the transaction, module references and owners. Single-step modules
   return to the installer owner immediately. That owner must additionally call
   `acceptOwnership()` on `IdentityRegistry` and, when enabled, `TaxPolicy`.
   Until those receipts are confirmed, their handoff is pending.
6. Configure and verify pausers, economic settings, certificate metadata and
   participant identity rules before allowing work. Complete the
   [deployment readiness checklist](deployment-readiness-checklist.md).

Initialization is atomic and may succeed only once. A revert rolls back its
wiring and its ownership acceptances; it does not undo the separate transactions
that nominated or transferred modules to the helper. Retain every deployed
address and transaction receipt so the same installer can be inspected and retried.

## Script support

`scripts/v2/deploy.ts` performs the complete preparation above for its own new
stack. Its governance address must match the connected deployer. It waits for
configuration receipts and accepts the two-step ownership returns. For a distinct
multisig destination, use the staged deployment path and execute its reported
handoff actions through that governance account.

The older `scripts/v2/initializeInstaller.ts` is a low-level initialization
wrapper, not a deployer: it does not transfer ownership of all modules or perform
the preparation table. Its target installer and module state must already be
prepared, and its governance signer must actually be available. Do not use an
unavailable multisig address as though it were a local signer. Invoke the current
ABI from your governance wallet for that case. Its success message does not
replace the final `owner()` / `pendingOwner()` checks above.

For replacing a validation module, use the separate
[module upgrade procedure](module-upgrade-procedure.md). Initialization does not
migrate jobs, validation rounds, commitments, or escrow.
