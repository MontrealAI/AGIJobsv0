# Hypernova Owner Control Matrix

The browser workbench and proposal exporter grant no runtime or signing authority. This matrix preserves the original control categories while using the options actually parsed by the repository scripts. An installed contract deployment, valid addresses, correct chain and authorized signer remain prerequisites for state-changing operations.

## Governance topology and parameter inventory

The deterministic kit generates the complete dossier and diagrams:

```bash
npm run demo:zenith-hypernova
```

For an already configured deployment, the report commands accept the network explicitly:

```bash
npm run owner:command-center -- --network localhost --format markdown --out reports/hypernova-command-center.md
npm run owner:parameters -- --network localhost --format markdown --out reports/hypernova-parameters.md
npm run owner:mission-control -- --network localhost --format markdown --out reports/hypernova-mission-control.md --bundle reports/hypernova-mission-bundle --bundle-name zenith-hypernova
npm run owner:blueprint -- --network localhost --out reports/hypernova-blueprint.md
```

Use real deployment configuration, not the plan’s illustrative `0xZENITH-*` placeholders. The kit bootstraps ephemeral Hardhat data for its own reports; an unrelated process does not inherit those deployed contracts.

The Mermaid renderer uses environment options rather than unsupported Hardhat script arguments:

```bash
OWNER_MERMAID_FORMAT=markdown OWNER_MERMAID_OUTPUT=reports/hypernova-governance.md OWNER_MERMAID_TITLE="Hypernova Governance Topology" npm run owner:diagram -- --network hardhat
```

## Preview and signing boundaries

| Control | Current interface | Verification |
| --- | --- | --- |
| System pause/resume | Inspect `owner:command-center`; authorize the actual pause controller call separately | Read contract pause state and corresponding transaction receipt |
| Thermodynamics | `scripts/v2/updateThermodynamics.ts --config <reviewed-config>`; optional `--reward-engine` and `--thermostat` | Compare desired settings, owner identity and read-back values |
| Treasury and fee recipients | `scripts/v2/updateFeePool.ts --config <reviewed-config>`; optional `--fee-pool`, `--json` | Check recipient, split, token, network and signer before applying |
| ENS / identity policy | `scripts/v2/updateIdentityRegistry.ts --config <reviewed-config>`; optional `--address`, `--json` | Verify current resolver/ownership and policy; a name string is not identity proof |
| Governor/delegate rotation | `scripts/v2/rotateGovernance.ts --config <owner-config>`; optional `--governance`, `--owner`, `--safe-out` | Inspect ownership transition and Safe bundle with authorized signers |
| Upgrade planning | `npm run owner:plan:safe -- --network localhost --out reports/hypernova-upgrade-plan.json --safe-out reports/hypernova-safe.json` | Inspect exact chain, addresses, calldata and approvals |
| Continuous assurance | `npm run owner:verify-control -- --network localhost` and `npm run owner:health -- --network localhost` | Inspect live read-back, not a historical green report |

`<reviewed-config>` and `<owner-config>` are placeholders for operator-reviewed files in the corresponding script’s schema; the Hypernova project plan is not one of those configuration files.

For scripts that parse their own CLI flags, invoke TypeScript directly with `HARDHAT_NETWORK` set, rather than passing arbitrary options to `hardhat run`. Example **preview only**, after preparing a valid thermodynamics configuration:

```bash
HARDHAT_NETWORK=localhost npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/updateThermodynamics.ts --config /absolute/path/to/reviewed-thermodynamics.json
```

The four update/rotation scripts above preview by default and use `--execute` to submit changes. This flag authorizes execution; it is not an interactive confirmation prompt. Do not append it until the owner has reviewed the concrete plan and signer. The old `--temperature`, `--preview`, `--load`, `--treasury` and `--plan` examples did not match these parsers and have been replaced. Do not assume every repository script shares this preview behavior.

## Incident, dispute and recovery drills

The complete kit/local lifecycle provides the supported rehearsal path and its logs. There is no registered `disputes:sim` command in the current package. Verify which scenarios actually ran before describing slashing, reissue, recovery or pause as tested. For a live dispute, use the deployed protocol’s documented dispute path and inspect receipts; do not substitute a generated governance report.

Keep creator, checker, independent reviewer and settlement signer separate. A single operator running multiple models has not established independent review. Stop work on exhausted limits, unknown side effects, unauthorized sources or ambiguous approvals. Reconcile outcomes before retrying mutations.

## Continuous assurance and retained evidence

`owner:pulse` is a Hardhat script; do not attach the formerly documented `--out` flag. Inspect its source and configured deployment before use. The normal assurance path is the generated mission-control/parameter dossier plus verified contract state.

Archive exact source revision, configuration hash, action record, receipt, reviewer decision and buyer acceptance. The Hypernova wrappers preserve older report directories. Browser content checks confirm the arithmetic of a synthetic plan; they cannot authenticate signer authority, reviewer independence, finality or payment.
