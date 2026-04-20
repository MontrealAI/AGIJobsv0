# Owner Control Parameter Playbook (V2)

This playbook gives the contract owner a single reference for adjusting AGI Jobs v2 parameters across the deployed module set. It complements the existing owner-control documentation and focuses on the `OwnerConfigurator` facade that batches privileged changes.

```mermaid
flowchart TD
    A[Owner console / Safe] -->|encode setter| B(OwnerConfigurator)
    B -->|configure| C{Target module}
    C -->|emit events| D[Subgraph / telemetry]
    B -->|ParameterUpdated| D
```

## Core tool: `OwnerConfigurator`

The [`OwnerConfigurator`](../contracts/v2/admin/OwnerConfigurator.sol) contract exposes two methods:

| Method | Purpose | When to use |
| --- | --- | --- |
| `configure` | Execute a single setter on a target module. | Quick one-off parameter update. |
| `configureBatch` | Execute multiple setters in sequence. | Release workflows or multi-module rollouts. |

Both functions are payable: send ETH with `configure` (via `msg.value`) or populate the per-call `value` field when batching. The contract verifies that the forwarded amount exactly matches the declared values and rejects stray transfers, so owners can confidently fund deposits (for example, staking buffers) without leaving dust on the configurator.

Both methods require the caller to be the configured owner (Safe or EOA). Ownership can be rotated using the inherited `transferOwnership` flow, giving the platform operator full control.

## Preparing a change

1. **Identify the module:** Use `docs/v2-module-interface-reference.md` to locate the contract exposing the setter you need (e.g., `JobRegistry`, `StakeManager`).
2. **Confirm governance state:** Verify that the new owner address is set in `Governable` contracts if a timelock coordinates the change. The [governance runbooks](owner-control-handbook.md) explain how to update timelock addresses.
3. **Capture current values:** Read the module's getter (via CLI or block explorer) and record the value in the change ticket.
4. **Encode calldata:** With `ethers` or `cast`, encode the setter call—for example:

   ```bash
   cast calldata "setCommitWindow(uint256)" 1800
   ```

5. **Populate metadata:** Choose descriptive `moduleKey` / `parameterKey` pairs (e.g., `keccak256("JOB_REGISTRY")`) to keep analytics dashboards consistent.

## Executing via Safe transaction

1. Open the Safe app connected to the deployment network.
2. Add a **Contract interaction** targeting the `OwnerConfigurator` address.
3. Paste the encoded calldata for `configure` or `configureBatch`.
4. Insert the `moduleKey`, `parameterKey`, `oldValue`, and `newValue` fields as hex strings. The console export tool can autofill these values.
5. Submit the transaction for signatures and execute once the threshold is met.

The emitted `ParameterUpdated` event includes all metadata, enabling real-time monitoring in the owner console and subgraph.

## System-wide pause and resume

- `SystemPause` owns the pauser role for every runtime-critical module. Use the configurator to call `SystemPause.pauseAll()` / `SystemPause.unpauseAll()` during incident response so every dependent contract halts together.
- The owner CLI (`npm run owner:update-all`) keeps the module roster in sync, but you can also submit a manual `configureBatch` with the encoded `setModules` payload when onboarding a new contract. Include descriptive `moduleKey`/`parameterKey` pairs such as `SYSTEM_PAUSE` / `PAUSE_ALL` so dashboards flag the action immediately.
- Because pause/unpause requires no ETH, set the batch `value` fields to `0`. Deposits for follow-up remediation (for example, topping up escrow) can ride in the same batch with explicit `value` amounts.

## Validation checklist

- [ ] The target contract supports the setter being called (cross-check `abi:diff` reports when upgrading).
- [ ] Required governance approvals (timelock delay, Safe signatures) are met.
- [ ] Monitoring alerts (Hamiltonian Monitor, Thermostat) stay green after the change.
- [ ] The change ticket references the relevant documentation and includes before/after values.

## Emergency rollback

If a parameter change behaves unexpectedly, submit a new `configure` call reverting to the previous value captured in the ticket. Because ownership remains with the platform operator, no external coordination is required.

## Integration with CI & audits

- CI enforces access-control coverage on contracts under `contracts/v2/admin` and `contracts/v2/governance`, ensuring mutator functions stay guarded by owner or governance modifiers.
- The audit trail from `ParameterUpdated` is ingested into `docs/owner-control-pulse.md`. Update that log whenever a production change is executed.

Following this playbook ensures the contract owner retains complete operational control of AGI Jobs v2 while keeping documentation, telemetry, and governance processes synchronized.
