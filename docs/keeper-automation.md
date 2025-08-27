# Validation Keeper Deployment

The `ValidationModule` exposes `checkUpkeep` and `performUpkeep` so a
keeper or Chainlink Automation job can automatically finalise jobs when
the reveal window closes.

## Registering Automation

1. Deploy the `ValidationModule` and wire it to the rest of the
   platform as normal.
2. On the Chainlink Automation UI create a new upkeep pointing at the
   `ValidationModule` address.
3. Encode the job identifier in the **check data** field using
   `abi.encode(uint256 jobId)`.
4. The automation network calls `checkUpkeep(checkData)` off‑chain. If it
   returns `upkeepNeeded`, the same `performData` is passed to
   `performUpkeep` on‑chain.
5. `performUpkeep` invokes `_finalize(jobId)` which tallies votes and
   notifies the `JobRegistry`.

Events `UpkeepPerformed(jobId, success)` are emitted for monitoring.
