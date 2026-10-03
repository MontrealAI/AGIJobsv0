# Fixed implementations and staged deployment

The v2.0.0 candidate resolves the four oversized production contracts without removing job, staking, validation, settlement, or governance operations. This is a deployment architecture change and needs security review and the remaining release gates before production use.

## What is deployed

Each controller retains its public functions, events, errors, and state. Its write functions delegate to separately deployed implementations. Implementation addresses are immutable; governance cannot replace them. Configuration setters still control the same protocol parameters and external module references.

| Controller | Implementations, in constructor order |
| --- | --- |
| `JobRegistry` | `JobRegistryConfiguration`, `JobRegistryLifecycle`, `JobRegistrySettlement` |
| `StakeManager` | `StakeManagerConfiguration`, `StakeManagerStaking`, `StakeManagerEscrow`, `StakeManagerSlashing` |
| `ValidationModule` | `ValidationModuleConfiguration`, `ValidationModuleVoting`, `ValidationModuleSelection` |

`config/implementation-modules.json` records this ordering. Every implementation uses its controller's shared base layout. Authorization, pause checks, and reentrancy guards execute against the controller's storage with the original caller. Events originate from the controller. Direct calls to implementation write entry points revert. Read and inherited ownership methods on an implementation affect only that implementation's separate state.

Controller constructors validate implementation code presence and module identifiers. Deployment tooling creates implementations from the compiled repository artifacts; manual deployments must verify the implementation source and runtime bytecode. A module identifier alone is not a cryptographic guarantee of correct code.

The existing storage fields retain their offsets. `ValidationModule.DOMAIN_SEPARATOR` moves from an immutable value to an appended storage field, calculated once in the controller constructor. This preserves controller-specific vote commitments across delegate calls. Compatibility tests compare every old storage field and every function, event, and error signature, and require identical layouts across a controller and its implementations.

## Size limits

With Solidity 0.8.25, viaIR, 200 optimizer runs, and the Cancun EVM target:

| Contract | Previous runtime bytes | Candidate runtime bytes | Candidate initcode bytes |
| --- | ---: | ---: | ---: |
| JobRegistry | 48,855 | 8,004 | 11,847 |
| StakeManager | 45,337 | 7,881 | 10,396 |
| ValidationModule | 28,199 | 6,368 | 8,980 |
| Deployer | 234,082 | 20,864 | 20,987 |

All 66 non-mock deployable v2 artifacts, including the ten implementations, fit the 24,576-byte runtime and 49,152-byte initcode limits. Constructor arguments add to initcode and must also fit. Normal Hardhat tests enforce these limits, with a 30 million block gas limit and automatic transaction gas estimation. Staged deployment tests additionally require every component transaction and final wiring to use less than 16,777,216 gas.

Reproduce the checks:

```bash
npm run compile
npm run release:check-size
npx hardhat test --no-compile test/v2/FixedImplementations.test.js test/v2/Deployer.test.js
npm test
forge test --fuzz-runs 256 --match-contract 'CommitReveal|Stake|Fee|Slashing|Validator|JobRegistryDeadline'
forge test --match-path 'test/v2/invariant/*.t.sol'
```

## Direct controller deployment

The last constructor argument is now `address[3]` for JobRegistry and ValidationModule, and `address[4]` for StakeManager. The preceding arguments retain their order and meaning. The deployment helper reuses implementations on the same provider and detects stale entries after a local snapshot or reset.

```javascript
const { ethers } = require('hardhat');
const { deployImplementations } = require('./scripts/deploy/implementations.cjs');

const [signer] = await ethers.getSigners();
const implementations = await deployImplementations('StakeManager', signer);
const factory = await ethers.getContractFactory(
  'contracts/v2/StakeManager.sol:StakeManager', signer
);
const stake = await factory.deploy(
  0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress,
  signer.address, implementations
);
```

The Solidity type and event declarations shared by implementations live in `JobRegistryBase`, `StakeManagerBase`, and `ValidationModuleBase`. Solidity callers using expressions such as `StakeManager.Role.Agent` or `emit StakeManager.FeePctUpdated(...)` should import the corresponding base declaration. Their ABI encodings and event topics remain unchanged.

The labour-market and national supply-chain demos keep their no-compile startup. Their bundled controller and implementation artifacts are refreshed after `npm run compile` with `node scripts/deploy/export-prebuilt.cjs`. Compatibility tests require those bundles to match the compiled ABI and creation bytecode. Production deployment helpers continue to use freshly compiled artifacts.

This is for new deployments. Matching storage offsets does not turn an existing non-upgradeable deployment into an upgradeable one. Any migration of existing jobs, balances, or commitments needs an explicit, reviewed migration procedure.

## Whole-stack deployment and recovery

`Deployer` no longer embeds the creation code for the entire stack. The workflow is:

1. Deploy the small coordinator and record its address.
2. Deploy the fixed implementations, then send each component's creation code to `deployComponent` in a separate transaction. The coordinator records component addresses and creation-code hashes. Controllers are paused atomically when created.
3. Register the component set. Registration checks code presence, distinct addresses, and coordinator ownership, including any pending two-step ownership transfers.
4. Call the existing `deploy`, `deployDefaults`, or tax-policy-free variant. It validates and wires the stack, unpauses controllers, and transfers control to governance atomically. A revert leaves the staged controllers paused.

`scripts/deploy/stage-protocol.cjs` implements staging. Supply the same `econ` configuration to staging and finalization, including any custom minimum stake. It reuses recorded components on retry and rejects changed constructor configuration or bytecode. The existing `scripts/v2/deployDefaults.ts` and Truffle migration use this helper.

The deployment script prints the coordinator address before staging. After an interruption, set `DEPLOYER_ADDRESS` to that address and rerun with the same network, signer, configuration, and compiled artifacts. A completed coordinator reports its stored addresses rather than deploying another stack. The script also accepts `--resume-deployer` when called through a runner that forwards script arguments.

Keep the coordinator address, all component and implementation addresses, creation-code hashes, runtime code hashes, compiler settings, receipts, and governance acceptance transactions in the deployment record. Two-step ownership acceptance for IdentityRegistry and TaxPolicy remains required where applicable. Verify the deployed implementations as well as their controllers.

## Release status

Passing bytecode and local deployment checks removes the size blocker. It does not supply authorized signing keys, mainnet governance configuration, independent security review, network commissioning, or passing CI for a future release commit. See the [readiness record](readiness-2026-10-03.md) for those remaining requirements. The repository's existing architecture diagrams and demonstrations are retained.
