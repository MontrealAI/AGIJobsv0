# Owner control playbook

The `owner:plan` helper generates a consolidated update plan for the
`JobRegistry`, `StakeManager`, and `FeePool` modules using the committed
configuration JSON files. It shows the exact calldata for each required setter,
optionally writes a machine-readable call plan, and can execute the updates when
run by the module owner. Behaviour is controlled via the `OWNER_PLAN_*`
environment variables (see below); Hardhat forwards script arguments only via
environment variables to avoid flag parsing conflicts.

## Quick start

```bash
# Inspect the call plan without sending transactions
OWNER_PLAN_JSON=false npm run owner:plan

# Emit JSON (stdout) for safe execution tooling
OWNER_PLAN_JSON=1 npm run owner:plan

# Persist the plan for a multisig (Gnosis Safe, Zodiac, etc.)
OWNER_PLAN_OUT=call-plan/mainnet-$(date +%Y%m%d).json npm run owner:plan

# Generate a Safe Transaction Builder bundle alongside the plan
npm run owner:plan:safe

# Custom Safe bundle location/metadata (works cross-platform)
npm run owner:plan -- --safe ops/mainnet-safe.json --safe-name "AGIJobs Mainnet Controls" \
  --safe-description "Owner updates generated $(date +%Y-%m-%d)"

# Apply all outstanding updates using the connected signer
OWNER_PLAN_EXECUTE=1 npm run owner:plan
```

The script loads the target addresses from `config/agialpha*.json` for the
active Hardhat network. Module-specific thresholds and addresses are pulled from
`config/job-registry.json`, `config/stake-manager.json`, and
`config/fee-pool.json` (including per-network overrides when present).

### What the plan includes

For each module the plan lists:

- the resolved contract address and current owner
- the config file that produced the desired state
- every setter that needs to change, including the calldata and human-readable
  `current → desired` values
- treasury allowlist and rewarder toggles (FeePool) with deterministic ordering
- safety notes (for example, when the zero address burns dust or when
  version/owner checks are required)

The JSON output mirrors the console plan and is structured so downstream
automation can submit calls without reimplementing the diff logic. Each action
exposes `to`, `value`, `method`, `args`, and `calldata` fields.

### Safe transaction bundles

Operations teams that rely on [Safe](https://safe.global) multisigs can export a
ready-to-import transaction bundle using the new `--safe` switches. The helper
produces a JSON document compatible with the Safe Transaction Builder, complete
with function signatures, argument metadata, and human-readable descriptions.

- `OWNER_PLAN_SAFE_OUT` – absolute or relative file path for the Safe bundle.
- `OWNER_PLAN_SAFE_NAME` – overrides the bundle name (defaults to “AGIJobs
  Owner Control Plan”).
- `OWNER_PLAN_SAFE_DESCRIPTION` – optional descriptive text embedded in the
  bundle metadata.

Example:

```bash
OWNER_PLAN_SAFE_OUT=ops/2025-guardrail-safe.json \
OWNER_PLAN_SAFE_NAME="AGIJobs v2 Ops" \
OWNER_PLAN_SAFE_DESCRIPTION="Treasury + fee update for March 2025" \
  npm run owner:plan
```

Upload the resulting JSON at <https://app.safe.global/transactions/builder>,
review each step, and submit it through your usual governance approval flow.

### Execution safeguards

- The helper refuses to execute a module when the connected signer is not the
  contract owner.
- Version checks ensure that `FeePool`, `StakeManager`, and the linked modules
  expose the expected `version() == 2` interface before encoding transactions.
- Treasury updates automatically stage allowlist entries to prevent accidental
  reverts mid-execution.

When `--execute` is omitted the helper acts as a dry run, enabling governance to
review or hand the plan to a multisig for offline execution.
