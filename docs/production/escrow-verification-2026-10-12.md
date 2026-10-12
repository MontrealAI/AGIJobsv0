# Escrow verification completed — the reproducible 39-source solution

**StakeManagerEscrow is source verified on Ethereum mainnet. No further submission is needed.** The operator's Etherscan success screen closed the last item in the [24-contract deployment inventory](mainnet-deployment-2026-10-12.md). The inventory records a subsequent public-page exact-match observation. This completes source publication, not permission to unpause or open live intake.

## What worked

The successful input was `StakeManagerEscrow-39sources-ETHERSCAN-v5.json`: **39 unchanged original source files, 244,730 bytes**. Its SHA-256 is:

```text
cbc1dc2b32036ae56239cb1caf8c26c2cbd2ebbeb18814203570f3b0d834e046
```

| Item | Pinned value |
| --- | --- |
| Network | Ethereum mainnet, chain ID 1 |
| Address | [`0x97A17aAC4F6bD865d9e38d53411526B3291e88ae`](https://etherscan.io/address/0x97A17aAC4F6bD865d9e38d53411526B3291e88ae#code) |
| Contract | `contracts/v2/implementation/StakeManagerEscrow.sol:StakeManagerEscrow` |
| Deployed source | `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`, `source-v2.1.0-rc.4` |
| Compiler | `v0.8.25+commit.b61c2a91` |
| Settings | Optimizer enabled, 200 runs; `viaIR: true`; Cancun |
| Constructor arguments | Empty |
| Code and economics changed | None |

The [machine-readable reproduction recipe](../deployments/evidence/escrow-exact39-v5.json) preserves all 39 source-content hashes, the exact input identity, compiler and original-build hashes, creation/runtime-template/metadata digests, and identities of the original native proof and successful operator screenshot.

## Why the previous attempts are history, not instructions

The full 267-source target-only compilation reproduced the saved build, but the browser showed an empty compiled candidate. Changing only the output selector to a file-level wildcard still failed. Those screens did not establish a Solidity defect or prove the deployed runtime was empty.

The ordinary 37-source metadata subset changed the compiled bytecode. Retaining two additional **original, unmodified** files produced the exact result:

- `@openzeppelin/contracts/interfaces/IERC1271.sol`
- `@openzeppelin/contracts/interfaces/IERC5267.sol`

These are not new contract dependencies or source edits. They retain compilation context that mattered in this measured case. The final input requests global ABI/bytecode/metadata outputs over the smaller 39-source set. Native comparisons matched creation code, runtime template, ABI, complete metadata, link references, method identifiers and immutable positions. AST identifiers for immutable groups may differ; grouped byte positions must not.

This establishes one working 39-source solution, **not a proof that 39 is the mathematical minimum**, nor a proven diagnosis of Etherscan's internal failure. Do not delete the two retained files just because they are absent from `metadata.sources`. Do not change optimizer settings, compiler version, source contents or constructor arguments to force a match. Preserve prior failed journals without treating them as new failures after the successful verification.

## Reproduce the result offline — maintainers only

The [portable replay tool](../../scripts/verification/escrow_exact39.py) reconstructs the exact input from your retained original build, verifies its SHA-256, and runs the existing checksum-pinned native compiler. It uses no workstation-specific paths and never installs software, downloads a compiler, reads wallet credentials, contacts a service, submits verification, or sends an Ethereum transaction.

Use Linux x86-64 and Python 3.10 or newer. Replace the example paths with your archived original files. The output directory must not already exist, and its parent must exist.

```bash
python3 scripts/verification/escrow_exact39.py \
  --build-info "/absolute/path/to/original/artifacts/build-info/7960f1a468b16d87eb814c54a2306753.json" \
  --solc "/absolute/path/to/solc-linux-amd64-v0.8.25+commit.b61c2a91" \
  --output-dir "/absolute/path/to/new-escrow-replay"
```

Alternatively, replace `--build-info` with `--original-input "/absolute/path/to/full267-target.input.json"`. Only the SHA-pinned original inputs are admitted. In this mode, the tool recompiles the full 267-source baseline with target-only outputs before comparing the 39-source candidate. The proof explicitly identifies which baseline was used.

A successful run writes the exact JSON, compiler diagnostics, and `REPLAY_PROOF.json` in the new directory and prints `EXACT_OFFLINE_REPLAY_MATCH`. A compiler error, timeout, malformed output, unexpected hash, source change, missing target, bytecode/metadata mismatch, or immutable-layout difference stops without producing a successful proof. Existing output directories are never overwritten. Each native compilation has a 90-second timeout.

**This is an archival reproduction command, not a request to reverify the already-verified address.** Its proof makes no fresh explorer, ownership, pause-state or immutable-value claim.

## Tests and evidence boundaries

Run the independent offline regression suite:

```bash
python3 -m unittest discover -s scripts/verification/tests -v
```

The synthetic unit fixtures exercise failure handling separately from native compiler evidence. The portable tool was also run against the original 267-source input with the checksum-pinned real compiler; both compilation scopes reproduced the same Escrow outputs. See the [repository replay validation record](../deployments/evidence/escrow-replay-tool-validation-2026-10-12.json).

The earlier v5 package had 32 offline regression tests and repeated exact native results. The portable repository tool has its own regression suite; those results must not be conflated with the browser acceptance or a current chain-state audit.

Source publication required no redeployment or unpause and no Etherscan staff intervention. Preserve the original build, verification input, journals and operator receipts. Keep the recorded eight-module pause posture and complete the [remaining readiness gates](readiness.md), including fresh block-bound owner/pause/immutable reconciliation, coordinator handoff, authorized production signing and independent security/provider/worker/settlement commissioning.
