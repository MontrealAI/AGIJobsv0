# Owner Control Field Guide

Governance authority belongs to the configured owner/governance contracts and authorized signers. The offline theatre holds no keys and invokes no governance methods. Pausing intake does not undo completed worker actions or transactions.

## 1. Generated control surfaces

The full `demo:agi-os:first-class` path can produce these files under `reports/agi-os/`:

- `owner-control-matrix.json` — module configuration and script-surface status.
- `grand-summary.md` / `.html` — executive narrative and authority matrix.
- `first-class/owner-control-map.mmd` — the existing Mermaid ownership/pause topology.
- `first-class/first-class-run.json` — per-step results, including `owner-verify` and `integrity-check`.
- `first-class/logs/` — command stdout/stderr logs when a stage executes.

A module marked `ready` means its reported configuration/script surface exists. It does not by itself prove a working live signer, independent validation, audited security or production readiness. Inspect all skipped and failed steps.

## 2. Inspect before acting

From a prepared local environment with compiled contracts and configured addresses:

```bash
HARDHAT_NETWORK=localhost npm run owner:dashboard
npm run owner:command-center -- --network localhost --format markdown
HARDHAT_NETWORK=localhost npm run owner:verify-control
```

`owner:command-center` **generates a guide**. It does not implement `pause-all`, `resume-all` or `execute` transaction subcommands. The first-class demo sets `HARDHAT_NETWORK` only for its child processes; it cannot persist that variable in your parent shell. Specify the network on every separate operation.

| Capability | Existing tooling | Verify |
| --- | --- | --- |
| Inspect governance state | `owner:dashboard`, `owner:verify-control` | Actual chain ID, deployed addresses, owner, governance and pausers |
| Generate command guide | `owner:command-center`, `owner:quickstart` | Commands are proposals, not proof they ran |
| Pause/resume governed modules | `scripts/v2/systemPauseAction.ts` | Authorized governance signer, simulated call, receipt and each module's state |
| Update module parameters | Module-specific script in the generated matrix | Config path, supported flags and actual post-transaction values |
| Rotate treasury/governance | `owner:rotate` | Review implementation and configuration before execution; it may broadcast |
| Generate emergency plan | `owner:emergency` | Apply the real stop/transaction procedure and inspect effects |
| Render governance diagram | `owner:diagram` | Keep the Mermaid map aligned with deployed addresses |

## 3. Correct local pause preview

`systemPauseAction.ts` reads custom arguments from `process.argv`. Run it directly through `ts-node` so Hardhat's `run` parser does not consume its `--action` or `--dry-run` flags:

```bash
HARDHAT_NETWORK=localhost npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/systemPauseAction.ts --action pause --dry-run
```

This requires the configured `SystemPause` deployment and signer. It queries module state and simulates the call; it does not broadcast in dry-run mode. Review errors and incomplete module responses; do not treat an aggregate label as proof that every module was queried successfully.

After verifying the exact deployment and authorizing a real **local** pause, remove `--dry-run`. The script asks for confirmation before broadcasting. To resume, use `--action unpause` with the same preview/review procedure. Neither successful simulation nor transaction submission guarantees finality: inspect the mined receipt and re-query each relevant module. For multisig/timelock governance, use that authority's actual approval/execution flow.

## 4. Governance forwarding (advanced)

`SystemPause.executeGovernanceCall(address target, bytes data)` is an owner/governance-gated contract method. Prepare and decode the target/calldata against the deployed ABI, simulate it and route it through the authorized governance system. There is no generic `owner:command-center -- execute` wrapper in this repository. Preserve calldata, proposal IDs and transaction receipts in the audit record.

## 5. Configuration and operational hygiene

Configurations live under `config/` (including network-specific files), not exclusively `config/v2/`. Inspect the loader and target script before selecting a file. Never assume all `owner:*` commands support `--dry-run`; inspect their documented arguments. Keep secrets in protected configuration, outside specifications and evidence.

Use the preview → simulate → confirm pattern for each consequential change. The offline theatre cannot verify deployed contract state. Rerunning the full stack may generate new evidence, but a UI screenshot or regenerated report alone cannot prove an owner action took effect.

For an incident: stop new admission, stop the affected worker at its runtime, preserve journals, and use authorized contract pause controls where necessary. Confirm which actions were already completed before recovery. Keep compute credentials, reviewer authority and settlement signers separate.
