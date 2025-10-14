# OmniDominion Owner Command Authority

The OmniDominion drill is explicitly designed so the contract owner (a multisig behind the timelock) can retune or pause every moving part. All entries below invoke commands that already live in the repository. Always run with `--dry-run` first on production networks.

| Control Surface | Purpose | Command | Notes |
| --- | --- | --- | --- |
| Global pause toggle | Freeze or resume all job lifecycle actions. | `npm run owner:command-center -- --network <network> --execute-pause-check` | Emits the exact calldata used to hit `SystemPause`. Remove `--execute-pause-check` for a report-only mode. |
| Thermostat temperature | Adjust reward temperature to attract agents or cool the economy. | `npx hardhat run scripts/v2/updateThermostat.ts --network <network> --temperature <value> --dry-run` | Append `--execute` after reviewing the dry run. Temperature boundaries are validated by the script. |
| Reward distribution shares | Change agent/validator/treasury splits. | `npm run reward-engine:update -- --network <network> --config config/thermodynamics.json` | Edit the JSON prior to running. Dry-run output lists the before/after shares. |
| Stake requirements | Raise or lower stake floors for agents/validators. | `npm run owner:update-all -- --only stakeManager --network <network> --dry-run` | Use `--execute` when satisfied. Keeps the plan in sync with `VALIDATORS_PER_JOB` and `REQUIRED_APPROVALS` env vars. |
| Treasury routing | Redirect protocol fees or replenish reserves. | `npx hardhat run scripts/v2/updateFeePool.ts --network <network> --dry-run` | Outputs calldata for timelock scheduling. Works with both multisig execution and direct owner ops. |
| Governor quorum / thresholds | Modify quadratic voting parameters. | `npm run owner:plan -- governance/quorum <value>` | Produces a governance bundle; feed into the timelock executor per normal procedure. |
| Identity overrides | Allowlist an emergency participant. | `npm run identity:update -- --network <network> --allowlist <ens-name>` | Leaves an audit trail via AllowlistUsed events. |
| Emergency dispute intervention | Trigger dispute resolution and slash recovery. | `npx hardhat run scripts/v2/ownerEmergencyRunbook.ts --network <network>` | Generates a prescriptive checklist referencing `docs/disputes.md`. |

## Owner situational awareness bundle

The plan automatically runs the following owner observability commands and stores their output under `reports/zenith-omnidominion`:

- `npm run owner:mission-control -- --network hardhat --format markdown`
- `npm run owner:parameters -- --network hardhat --format markdown`
- `npx hardhat run --no-compile scripts/v2/renderOwnerMermaid.ts --format markdown --title "OmniDominion Governance"`

The produced markdown files enumerate every configurable parameter, the current owner addresses, and the exact call graph between the multisig, timelock, governor, and subordinate modules.

## Operator discipline checklist

1. Confirm the multisig signers reviewed the dry-run outputs before executing any transaction on live networks.
2. Never execute thermostat or reward changes without copying the plan delta into the internal change log.
3. For every pause or resume event, append the transaction hash to the mission summary.
4. Run `npm run owner:verify-control` weekly (or after any deployment) to ensure no contract ownership drifted away from the expected multisig/timelock addresses.

These guardrails keep the OmniDominion scenario compliant with the platform’s core requirement: **the contract owner retains total, provable control at all times**.
