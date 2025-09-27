# Thermodynamics Operations Playbook

This guide explains how governance can safely rebalance reward weights and
tune the thermodynamic controllers that drive AGIJobs v2. The workflow is
split into two steps:

1. Update the JSON configuration to describe the intended parameters.
2. Dry-run and then execute `scripts/v2/updateThermodynamics.ts` to apply the
   changes through the governance signer or timelock.

The helper script validates every value, prints a full transaction plan and
only submits transactions when `--execute` is supplied. It covers the
`RewardEngineMB` distribution, settlers, thermodynamic constants and the
`Thermostat` PID loop.

### Thermostat-only adjustments

Governance teams that only need to retune the `Thermostat` can use the focused
helper instead of running the full thermodynamics pipeline:

```
AGIALPHA_NETWORK=mainnet npx hardhat run scripts/v2/updateThermostat.ts --network mainnet
```

The script reads either `config/thermostat.json` or the thermostat section of
`config/thermodynamics.json`, prints the planned changes and supports `--execute`
and `--json` just like the broader helper. It automatically falls back to the
thermostat address recorded in `config/agialpha.json` or the reward-engine
section when the thermostat config omits an explicit address.

## Configuration file

Populate `config/thermodynamics.json` (or the
`config/thermodynamics.<network>.json` override) with the current deployment
addresses and desired settings. All numeric fields are integers; values that
represent 18‑decimal fixed point numbers (such as kappa, temperatures and
shares) must be expressed without decimal points. Example template:

```json
{
  "rewardEngine": {
    "address": "0x...",
    "treasury": "0x...",
    "thermostat": "0x...",
    "roleShares": {
      "agent": 65,
      "validator": 15,
      "operator": 15,
      "employer": 5
    },
    "mu": { "agent": "0", "validator": "0" },
    "baselineEnergy": { "agent": "0" },
    "kappa": "1000000000000000000",
    "maxProofs": 100,
    "temperature": "1000000000000000000",
    "settlers": {
      "0xSettler": true,
      "0xRetired": false
    }
  },
  "thermostat": {
    "address": "0x...",
    "systemTemperature": "1000000000000000000",
    "bounds": { "min": "500000000000000000", "max": "2000000000000000000" },
    "pid": { "kp": "0", "ki": "0", "kd": "0" },
    "kpiWeights": { "emission": "1", "backlog": "1", "sla": "1" },
    "integralBounds": {
      "min": "-1000000000000000000",
      "max": "1000000000000000000"
    },
    "roleTemperatures": {
      "validator": "900000000000000000",
      "employer": "unset"
    }
  }
}
```

Notes:

- Role share entries accept either percentages (`0`–`100`) or objects with a
  `wad` property. When any role share changes the script uses the new
  four-value `RewardEngineMB.setRoleShares` method to update every role in a
  single transaction and enforces that the total equals exactly `1e18`.
- Setting a settler value to `false` removes its permission.
- Thermostat role temperatures accept the literal string `"unset"` or `null`
  to clear an override.

## Dry run

```
AGIALPHA_NETWORK=mainnet npx hardhat run scripts/v2/updateThermodynamics.ts --network mainnet
```

The script prints the resolved configuration path, compares every on-chain
value with the requested state and shows a list of planned transactions.
Running without `--execute` never touches the chain and exits with the diff.

## Execute changes

After reviewing the dry run output, re-run the command with `--execute` from
the governance signer or through the timelock execution environment:

```
AGIALPHA_NETWORK=mainnet npx hardhat run scripts/v2/updateThermodynamics.ts --network mainnet --execute
```

Each transaction hash is printed as it is mined. If the connected signer is not
the recognised governance owner the script refuses to submit transactions and
remains in dry-run mode.

## Safety checklist

- Commit any configuration changes before running `--execute` so that the
  executed plan can be audited.
- Ensure the `roleShares` values add up to exactly `100`. The script checks
  this and aborts otherwise.
- When adjusting Thermostat PID values provide all three gains (`kp`, `ki`,
  `kd`) together, otherwise the existing values are preserved.
- The helper script honours per-network overrides. To target Sepolia, place the
  settings in `config/thermodynamics.sepolia.json` or pass `--config` with an
  explicit path.
