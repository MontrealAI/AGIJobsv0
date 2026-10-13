# source-v2.1.0-rc.6 — compiler and verification remediation

New contract builds use Solidity **0.8.37**, containing fixes for the four compiler advisories shown on the first deployment. This is a source prerelease. It sends no blockchain transactions and does not update bytecode or remove notices at existing Ethereum addresses.

## What changes

- Pin the remediated compiler across Hardhat, Foundry, Truffle, coverage, demos and static analysis. Production builds retain viaIR, 200 optimizer runs and Cancun.
- Correct first-party compiler diagnostics while preserving public ABI names, error selectors and forwarding behavior. Regenerate bundled bytecode for local tooling and demos.
- Reject wrong compiler builds, altered production settings, stale source dependencies, ABI/bytecode mismatches, oversized contracts, unreviewed warnings and truncated diagnostic streams before public staged deployment.
- Save the original full Standard JSON inputs, compiler outputs and artifacts with checksums before the first public deployment transaction. Retain original encoded constructor arguments and fully qualified names for all implementations, controllers and the coordinator.
- Correct explorer CLI flags and linked-library handling. Failed, interrupted or missing verification processes no longer become successful evidence.
- Review gas snapshots under the new compiler; preserve existing gas and bytecode ceilings. Keep the prior deployment journal, chain-specific address book and successful 39-source Escrow replay intact.

## Validation and release evidence

The compiler remediation was exercised by 848 Hardhat tests, 233 root Foundry tests including fuzz/invariants, 39 CULTURE Foundry tests, deployment/verification regressions and local settlement commissioning. Native replay of the archived Standard JSON reproduced the creation bytecode, runtime bytecode and ABI of all 66 deployable v2 artifacts exactly. All fit EIP-170/EIP-3860; the largest runtime is 24,334 bytes, leaving 242 bytes of headroom.

Publication additionally requires successful checks on the exact merged release commit. The attached `provenance.json` records that commit, its tree, the release producer and qualifying checks. `compiler-provenance.json` binds the compiler archive to its successful contracts workflow and GitHub artifact digest. The producer downloads and verifies every release asset before publication.

`compiler-evidence.zip` contains the compiler report and verification bundle. Its index maps each deployable contract to the original Standard JSON, build-info and artifact, with per-file SHA-256 digests. Pair these files with a future deployment's own journal; release artifacts alone contain no new deployed addresses or constructor values. The attached deployment records describe the original rc.4 mainnet deployment.

## Visible notices and operating boundary

The 13 OpenZeppelin 5.4.0 future-keyword notices remain visible and are admitted only for exact reviewed source hashes, codes and counts. Hardhat 2.29.1 reports incomplete debugging support for Solidity 0.8.37. Foundry's test-support libraries can emit their own future-keyword notices. This release does not claim every tool is warning-free or that contracts are flawless.

The existing 24 mainnet contracts retain source `source-v2.1.0-rc.4` / `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`. Their dated 24/24 explorer verification and configuration/handoff evidence are preserved. The shared AGIALPHA token remains `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`. The deployed job stake remains fixed at 500 AGIALPHA; a requested percentage-based stake is not implemented by this compiler update.

Compiler replacement requires new deployments for immutable contracts and an explicit reconciliation/cutover plan for jobs, commitments, stake and escrow. Use the original release to resume or verify the old coordinator. Source publication does not authorize activation or unpausing.

Maintainer production signing, independent security review, fresh chain-bound ownership/configuration checks and independent live commissioning remain outstanding. Local settlement uses simulated token/work and is not independent production approval. Review the compiler/verification guide, mainnet deployment record and production readiness document before an operational decision.
