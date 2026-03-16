# Solstice Epoch Manifests

The Solstice pipeline captures deterministic transaction transcripts directly from the existing Hardhat scripts. Each command in `pipeline.solstice.yml` pipes stdout through `tee` into the `*.log` files below.

- `thermodynamics.mainnet.log` — Output of `npm run reward-engine:update -- --network mainnet --execute`.
- `thermostat.mainnet.log` — Output of `npm run thermostat:update -- --network mainnet --execute`.
- `platform.mainnet.log` — Output of `npm run platform:registry:update -- --network mainnet --execute`.

When the scripts report "No changes required" the log becomes the canonical artifact proving idempotence. When actions are queued, copy-paste the `Planned actions` block into a governance proposal and link the log from the CI run. The repository already treats these scripts as authoritative, so no new code is necessary.

> **Tip:** Attach the ENS identity audit from `npm run identity:update -- --network <network>` as `identity.<network>.log` in the same directory to present a complete control picture.
