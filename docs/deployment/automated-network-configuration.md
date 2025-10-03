# Automated Network Configuration

The one-click deployment flow removes nearly every manual blockchain task. Operators
feed a JSON configuration into the helper CLI and it deploys or wires the contracts,
initialises launch parameters, and publishes the generated addresses for the rest of
the stack.

## 1. Describe the target network

Start from [`deployment-config/deployer.sample.json`](../../deployment-config/deployer.sample.json)
and copy it to a network-specific file (for example `deployment-config/sepolia.json`).
The file captures the governance multisig, staking economics, ENS integration details,
and secure defaults that are enforced immediately after deployment.

Key fields:

| Field | Purpose |
| --- | --- |
| `governance` | Address that owns the deployed modules. |
| `econ` | Fee percentages, staking thresholds, dispute timing, and job stake limits. |
| `identity` | ENS registry/namewrapper addresses plus agent/validator root nodes. |
| `secureDefaults` | Launch guardrails such as pausing the system and capping job budgets. |
| `output` | Optional custom location for the generated address book artifact. |

Helper commands populate the ENS namehashes referenced by the identity block:

```bash
npm run namehash:sepolia           # writes deployment-config/sepolia.json in place
npm run namehash:mainnet           # updates deployment-config/mainnet.json
```

## 2. Execute the deployment plan

Run the automated bootstrapper with your JSON file and the desired Hardhat network. The
helper orchestrates Hardhat, copies the address book, and applies the secure defaults in
a single pass:

```bash
npm run deploy:oneclick -- --config deployment-config/sepolia.json --network sepolia --yes
```

Behind the scenes the script:

1. Deploys the full contract suite with sane constructor parameters.
2. Sets ENS registry and root nodes via `IdentityRegistry`.
3. Connects `JobRegistry`, `StakeManager`, and `ValidationModule` together.
4. Locks down the launch configuration (pause switch, staking minimums, job caps,
   validator commit/reveal windows, slashing distribution). The deployment script
   boots the `ValidationModule` with a 60 second commit window and a 60 second
   reveal window, so validators always begin with non-zero deadlines before any
   overrides are applied.
5. Writes the resulting addresses to both `docs/deployment-addresses.json` and the
   configured `output` path for operators.

Use the optional `--appealFee`, `--disputeWindow`, or treasury overrides defined in the
JSON to customise the deployment without editing any Solidity.

## 3. Update environment variables automatically

Feed the generated address book into the `.env` template that ships with the repository.
The helper preserves comments and unrelated settings while rewriting the address keys
consumed by Docker Compose:

```bash
npm run deploy:env -- --input deployment-config/latest-deployment.json --template deployment-config/oneclick.env
```

The command validates every address, normalises casing, and refuses to overwrite an
existing file unless `--force` is supplied.

## 4. Launch the stack in one command

Fire up the entire off-chain platform – orchestrator, APIs, gateways, notifications,
front-ends, and optional mock AA infrastructure – without touching Docker manually:

```bash
npm run deploy:oneclick:auto -- --config deployment-config/sepolia.json --network sepolia
```

The wrapper ensures the `.env` file exists, executes the deployment, updates the
environment file, and starts Docker Compose in detached mode. Add `--attach` to stream
logs or `--no-compose` to skip container startup.

## 5. Secure defaults out of the box

Deployments begin in a locked-down posture:

- `SystemPause.pauseAll()` is executed if the pause contract is present.
- Job rewards and durations are capped, and validator commit/reveal windows are
  populated from `secureDefaults.validatorCommitWindowSeconds` and
  `secureDefaults.validatorRevealWindowSeconds` (falling back to the
  `econ.commitWindow`/`econ.revealWindow` strings). The out-of-the-box
  configuration sets these windows to non-zero values, so validators never start
  in a "disabled" state unless operators explicitly override them to `0`.
- Slashing sends 100% of funds to the treasury by default, preventing accidental user
  payouts.
- Only the configured governance address can relax these controls through the dedicated
  owner-control scripts.

These defaults prevent an operator from unintentionally launching an unsafe configuration
while still giving them straightforward knobs to adjust once they are ready. To change
the validator timing guardrails, edit the `secureDefaults` block in the relevant
`deployment-config/*.json` file before running the helper.

## 6. Production playbooks for non-technical operators

Every command above is documented with screenshots, expected outputs, and troubleshooting
notes in the [Non-Technical Deployment Guide](../owner-control-non-technical-guide.md) and
[Master Operations Guide](../operations_guide.md). The new one-click helper integrates
with those playbooks so an operations manager can follow the numbered checklist, paste
commands, and record the resulting artifacts without writing code or using Etherscan.
