# Compiler warnings: what changed and what happens next

**New builds use Solidity 0.8.37. Existing Ethereum addresses still contain their original bytecode.** Updating GitHub cannot remove a compiler-version notice from an already deployed contract.

## What the screenshot means

The screenshot of coordinator `0xeF1Be4B8251a9C4a584140C113508B95fd8B2543` shows Etherscan's known-bug notices for Solidity 0.8.25. This is a compiler-version advisory, not proof that the deployed contract exercises each bug and not an ordinary compilation failure. An exact source match also does not establish that a contract is free of vulnerabilities.

| Advisory | Fixed in | Trigger relevant to an assessment of the original build |
| --- | --- | --- |
| `MemoryByteArrayElementDeleteClearsWholeWord` | 0.8.37 | Deleting a memory byte-array element in the legacy pipeline; viaIR builds are excluded by the upstream condition. |
| `SpillSlotCollisionAcrossMutualRecursion` | 0.8.37 | viaIR stack spilling combined with a particular mutually recursive call graph. |
| `UnsoundSpillInMutualRecursion` | 0.8.36 | viaIR stack spilling and intersecting recursive call cycles. |
| `LostStorageArrayWriteOnSlotOverflow` | 0.8.32 | Array operations that cross the end of the storage address space. |

Sources: [Solidity's known-bug list](https://docs.soliditylang.org/en/latest/bugs.html), [version-pinned bug record](https://github.com/argotorg/solidity/blob/v0.8.37/docs/bugs.json), and [0.8.37 release](https://github.com/argotorg/solidity/releases/tag/v0.8.37). The review date is 13 October 2026 UTC. Later discoveries require a new assessment; this is not a claim that a compiler or contract is flawless.

## Changes in this source update

- Hardhat, Truffle, Foundry, coverage and the five dedicated demo build configurations use 0.8.37. The production build retains viaIR, 200 optimizer runs and Cancun. Each demo retains its own optimizer/pipeline settings, with an explicit Cancun target.
- Selective base imports eliminate duplicate-error shadow warnings while retaining controller error selectors. Explicit references to intentionally forwarded parameters preserve their ABI names, original calldata, caller, return data and revert data. Virtual fallback stubs retain their existing revert behavior.
- Thermostat's local variable no longer uses a future reserved identifier. CertificateNFT compares token addresses explicitly.
- New-deployment admission checks the exact compiler build identity, production settings, source dependency contents and diagnostics. It rejects 0.8.25 artifacts, fast/coverage artifacts, unexpected warnings and truncated diagnostic output. Regenerated local demo bundles use the new compiler.
- Public staged deployments archive the full original Standard JSON inputs, build-info and artifacts before their first transaction, with SHA-256 checksums. The deployment journal retains original constructor arguments, including ABI-encoded arguments and fully qualified names for the coordinator and implementations. Verification no longer passes the unsupported `--no-compile` flag, uses the correct library-file interface, and rejects interrupted or failed child processes.
- CI retains a machine-readable compiler report alongside the normal contract, deployment, fuzz, invariant, coverage and security checks. Run `node scripts/ci/check-solidity-build.cjs` after compiling to see the report.

## Remaining notices are visible

The pinned OpenZeppelin 5.4.0 sources emit 13 notices (`6335`) because `at` and `error` are scheduled to become reserved identifiers in a future language version. These are distinct from the four miscompilation advisories above. The current compiler accepts those identifiers. The report lists these notices individually; admission allows only their exact source files, SHA-256 identities, diagnostic code and bounded counts in [the compiler policy](../../config/solidity-compiler.json). All project-source warnings and other diagnostics fail admission. No compiler output is filtered or suppressed.

Hardhat 2.29.1 also prints an incomplete-support notice for Solidity 0.8.37; advanced stack traces may be limited. The compiler itself is the authentic 0.8.37 build. This release does not claim full Hardhat debugging support. Updating a framework or a contract library is a separately qualified compatibility change; changing security dependencies merely to hide these notices would not prove safer operation.

## If you operate the existing mainnet deployment

1. Keep the original release, compiler input, build-info, verification files, addresses and transaction evidence. The deployed source remains associated with `source-v2.1.0-rc.4`; new source must not be presented as an exact match for that old bytecode.
2. Use the original release for historical verification or recovery. Do not resume the old coordinator using newly compiled creation code. Recovery deliberately rejects changed creation-code hashes.
3. The three modular controllers have immutable implementation addresses. An owner action cannot install new compiler output into them. Their [fixed-implementation guide](fixed-implementations.md) explains this boundary.
4. If replacement is chosen, prepare and review a new deployment with the existing local rehearsal, read-only plan, paused staging and governance handoff. Inventory and reconcile existing jobs, commitments, stakes and escrow before planning any cutover. There is no automatic balance migration or universal sweep.
5. Verify every replacement controller and implementation against its own build, complete independent security review and operational commissioning, then separately authorize any activation. This source update sends no blockchain transactions.

## Keep verification reproducible

The first deployment's hardest verification was StakeManagerEscrow: its exact 0.8.25 replay required 39 original sources, including IERC1271 and IERC5267. A guessed source closure or a later whole-project compilation did not reproduce that historical build. Keep the rc.4 replay with the rc.4 deployment; do not apply it to 0.8.37 artifacts.

For a new build, export its original inputs before any cleanup:

```bash
node scripts/deploy/archive-verification.cjs --output reports/new-verification-bundle
```

The destination must be new. `index.json` maps every deployable contract to its original Standard JSON, full compiler output and artifact, and records checksums. Public `deployDefaults.ts` runs create this bundle automatically beside the deployment report, before sending transactions. Keep the entire bundle and the `.journal.jsonl` together. Use the recorded compiler long version, fully qualified contract name, full Standard JSON and original constructor arguments when retrying Etherscan verification. Constructor-free implementations have empty arguments (`0x`); do not substitute the controller's arguments.

If a transaction or explorer request times out, inspect the saved transaction hash and chain state before retrying. Do not restart deployment to fix verification. Resume the same coordinator only with its matching release and configuration, and use a new report filename to retain earlier evidence. A compiler archive, an exact explorer match and a completed local rehearsal are separate facts; none authorizes unpausing.

## Reproduce the source checks

Use the repository's pinned Node.js version and committed dependency lockfile:

```bash
nvm use
npm ci
npm run compile
node scripts/ci/check-solidity-build.cjs
node --test test/scripts/solidity-policy.test.cjs test/scripts/deployment-candidate.test.cjs test/scripts/verification-evidence.test.cjs
npx hardhat test --no-compile test/v2/FixedImplementations.test.js test/v2/Deployer.test.js test/v2/DeploymentScripts.test.js test/v2/DeploymentCli.test.js
npm test
```

For a new mainnet candidate, `npm run compile:mainnet` additionally checks the source and diagnostic policy. Compilation is local and does not require a wallet. [The deployment guide](../deployment-v2-agialpha.md) describes the read-only plan and subsequent authorized steps. [Production readiness](readiness.md) remains the source of truth for unresolved signing, review and commissioning gates.

## En français

**La mise à jour corrige le compilateur des nouvelles constructions. Elle ne modifie pas les contrats déjà déployés.** Les avertissements Etherscan liés à l'ancien compilateur peuvent donc rester visibles aux anciennes adresses. Conservez leurs fichiers de vérification originaux. Un remplacement exige un nouveau déploiement, une vérification, une revue indépendante et un plan explicite pour les missions et les soldes existants. Cette mise à jour n'envoie aucune transaction. Les 13 avis de dépréciation OpenZeppelin et la limite de prise en charge Hardhat restent déclarés; aucune absence totale de risque n'est certifiée.
