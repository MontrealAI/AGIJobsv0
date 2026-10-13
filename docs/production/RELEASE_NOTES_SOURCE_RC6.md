# source-v2.1.0-rc.6 — compiler remediation and preserved deployment evidence

New contract builds use **Solidity 0.8.37**. The original deployed Ethereum contracts retain their existing bytecode and explorer compiler-version notices.

## What changes

- Pin the supported Hardhat, Foundry, coverage, historical Truffle and dedicated demo build paths to the reviewed compiler. Production builds retain viaIR, 200 optimizer runs and Cancun.
- Remove project-source compiler diagnostics while preserving ABI parameter names, calldata forwarding and fixed-implementation behavior. Refresh prebuilt demo artifacts.
- Require exact compiler identity, current source dependencies, deployable contract sizes and reviewed diagnostics before admitting new deployment artifacts. Contract CI retains its compiler report.
- Save original Standard JSON, compiler output, per-contract artifacts and checksums before public deployment transactions. Verification uses each constructor-free implementation's own arguments and preserves retry/recovery evidence.
- Preserve the original 24-contract deployment inventory, operator configuration readback, constructor/compiler evidence and Escrow reproduction recipe. Original deployed bytecode remains associated with `source-v2.1.0-rc.4`; the dated evidence publication is `source-v2.1.0-rc.5`.
- Explain how to reproduce checks, preserve historical verification/recovery inputs and plan a separately reviewed replacement if desired. Read the [operator guide](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.6/docs/production/compiler-warnings-2026-10-13.md).

The pinned OpenZeppelin sources still emit 13 future-keyword deprecation notices. The admission policy bounds their exact source hashes, diagnostic code and counts; project-source warnings and unexpected diagnostics fail. Hardhat's limited Solidity 0.8.37 stack-trace support notice remains visible. No compiler output is suppressed, and no claim of flawless operation is made.

## Qualification and provenance

The source publisher requires the exact merged main SHA to pass every checked-in required context, all named release workflows, Pages, actionlint, Escrow regression and every observed additional main-push workflow. Earlier PR results cannot substitute for that merged commit. The checked-in scope gate requires the reviewed compiler source checkpoint and preserves the original deployed evidence byte for byte.

The twelve attached assets include the source ZIP, original compiler archive and its producer provenance, compiler policy, operator guide, recorded mainnet address book, dated deployment/configuration evidence, release notes, `provenance.json` and `SHA256SUMS.txt`. The provenance records the exact source commit/tree, reviewed compiler checkpoint, historical evidence baseline, producer and hosted checks. Every payload is checksummed; the exact asset inventory is downloaded and verified before publication. Interrupted publication can resume only at the same SHA, published assets are read back without modification, and tags are never moved or deleted.

`compiler-evidence.zip` retains the successful exact-commit contracts workflow's full Standard JSON, build-info, artifacts and compiler report. `compiler-provenance.json` records the producer, artifact ID and GitHub SHA-256 digest; internal file checksums and contract inventories are verified before publication. Pair this archive with a future deployment's own journal and original constructor values. The attached mainnet records remain historical rc.4 evidence.

Local validation includes 848 Hardhat tests, 233 root Foundry tests with fuzz/invariants, 39 CULTURE Foundry tests and a 25-contract deployment rehearsal settling three jobs with three validators each. Native replay reproduced creation bytecode, runtime bytecode and ABI for all 66 deployable artifacts. All pass chain size limits; the largest runtime is 24,334 bytes, leaving 242 bytes of headroom. Local simulated settlement does not establish independent live commissioning.

## Existing deployments and remaining gates

Updating the repository cannot replace existing immutable controller implementations or remove old-address compiler advisories. Keep their original build inputs for verification and recovery. A replacement needs its own deployment, address inventory, source verification, jobs/stakes/escrow reconciliation and separately authorized cutover. This publisher sends no explorer submission or blockchain transaction, performs no migration and does not unpause contracts.

This is an **unsigned source prerelease**, not a signed or independently commissioned production release. Maintainer production signing, independent security review, effective protected-review enforcement and real provider/worker/reviewer/settlement/monitoring/recovery commissioning remain unresolved. The historical recorded managed modules remain paused, the validator pool was empty, and fresh pre-opening chain/configuration checks remain necessary. Earlier operator reports and screenshots are retained as dated evidence, not fresh independent RPC observations.

The signed `v*` production pipeline and its gates remain unchanged. Existing SUCCESSOR Ω, English/French onboarding, demos and flowcharts remain available. See [production readiness](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.6/docs/production/readiness.md).

## En français

Les nouvelles constructions utilisent Solidity 0.8.37; les contrats déjà déployés conservent leur bytecode et leurs avis Etherscan. Cette préversion conserve les preuves originales et explique la vérification, la reprise et un éventuel remplacement. Les avis OpenZeppelin et la limite de prise en charge Hardhat restent déclarés. Aucune transaction, migration, soumission à l'explorateur ou activation n'est effectuée; la signature de production, la revue indépendante et la mise en service restent requises.
