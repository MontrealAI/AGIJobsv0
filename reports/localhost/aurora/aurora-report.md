# Project AURORA — Mission Report


## Mission Summary

- Scope: aurora
- Version: 1.0
- Jobs executed: 1

## Job — AURORA-Flagship-Job

- **Job ID**: 1
- **Transaction**: `0x1e56e2df3ce08884b7b0439afd7ed7b77461cfdba0d8acfdcb35ecfead78669c`
- **Reward**: 5.0
- **Deadline**: 1760468798
- **Spec hash**: `0xed63e514f02d1452604435246f7ad73c4015bf8903c8080bc801f7fdecdce43a`
- **Worker**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Submission tx**: `0xb74e90d5cfb7f3cb9ac797dc590cbcdba3e7723faa5ad278919c594b675a11ec`
- **Result URI**: ipfs://aurora-demo-result
- **Validators**:
  - 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC: commit `0xbb7f8ccafd5b6a3165edb922e7921db6478939b20c6c77cda7475ef017f4fe0f`, reveal `0xfed42a8699a35180a0cf468f695ae986ba82a0cc094d19a27c31be71844419dd`
  - 0x90F79bf6EB2c4f870365E785982E1f101E93b906: commit `0x4db0acfe5cf6cff9be6972282043e311defb01a5972c75060924b8444c49ead3`, reveal `0x5ffd001dd42fcb021747ba0ca7047e8979987c4a282754c87de78b081a198483`
  - 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65: commit `0xfb73f0f52e01a91b94f411dc767081f37cad3b71ddfe8cd368a881603b470703`, reveal `0x8c9b0919cfa52ea4a2dd78fc49fed5e39425d441cf3b574e388c608f76741fb1`
- **Payouts**:
  - 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266: 994.75 → 994.75 (Δ 0.0)
  - 0x70997970C51812dc3A010C7d01b50e0d17dc79C8: 980.0 → 980.0 (Δ 0.0)
  - 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC: 950.0 → 950.0 (Δ 0.0)
  - 0x90F79bf6EB2c4f870365E785982E1f101E93b906: 950.0 → 950.0 (Δ 0.0)
  - 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65: 950.0 → 950.0 (Δ 0.0)

## Stake Operations

- agent `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` staked 20.0 (tx: `0xea8838c8538ba53800837e92660da21bb88300edfe819cbfc44746dadc5c2439`)
- validator `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` staked 50.0 (tx: `0x12c82b32e7dfdfb9029336d50847ef4e738b45c0b42e88d2c9746c366bb53a71`)
- validator `0x90F79bf6EB2c4f870365E785982E1f101E93b906` staked 50.0 (tx: `0x6870a4ee62d970d0ea7dd75b692037851eece2d52602cc08797b16c1070850ec`)
- validator `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` staked 50.0 (tx: `0xb9a1452f9d0b035096a91e68b7e0b5a328470be740825577a2bc93bee6497471`)

## Governance & Controls

- **SystemPause.pauseAll** (direct) — tx `0x6fba5df300b1fe9a56e9d3e750193828ea8b2513f2bbc786e05c2f3be4960a29`
  - Notes: Emergency drill: pause every core module
- **SystemPause.unpauseAll** (direct) — tx `0xadc2d9f3b3da7e0eb7bf09e63e28588248d4ba479e5cc857fc02071fc522872e`
  - Notes: Resume operations after pause drill
- **StakeManager.setRoleMinimums** (forwarded) — tx `0x3fa709b202e7be3282f9ff0ac68759cd0e035f6f861b66b7f8ea89a3a34a552d`
  - Notes: Lower minimum stakes so demo identities can onboard quickly
  - Params: ["10000000000000000000","25000000000000000000","12500000000000000000"]
  - Before: agent: 0.0, validator: 0.0, platform: 0.0
  - After: agent: 10.0, validator: 25.0, platform: 12.5
- **JobRegistry.setJobStake** (forwarded) — tx `0xcdbb331ebfe537d5e6bb44d3cf806aad2b3cb3b10c1363c7133f4bcf57b92e4a`
  - Notes: Align agent job stake requirements with the mission parameters
  - Params: ["20000000000000000000"]
  - Before: stake: 500.0
  - After: stake: 20.0
- **JobRegistry.setMinAgentStake** (forwarded) — tx `0x170ffcb4015cd80ffbcee6b7e5b2b9b23d10efc28242ee98a0d5b91dbe70055c`
  - Notes: Align minimum agent stake with the mission requirements
  - Params: ["20000000000000000000"]
  - Before: stake: 0.0
  - After: stake: 20.0
- **JobRegistry.setAcknowledger** (forwarded) — tx `0x302c0f838b9e5c10c14e61e4f7537e73391e93c408c5938955609b6578217614`
  - Notes: Allow StakeManager to acknowledge tax policy on behalf of participants
  - Params: ["0xa16E02E87b7454126E5E10d957A927A7F5B5d2be",true]
- **IdentityRegistry.addAdditionalAgent** (direct) — tx `0x0f870ca179ae8ea741f95817057e2dbf0a93051dd953535866b3bfbb4ed13f4b`
  - Notes: Allow flagship worker to onboard without ENS proof
- **IdentityRegistry.addAdditionalValidator** (direct) — tx `0x482c0457bbee1a5d0442ad235375b88fcf4e32eeb033ac3153f531eb7126913e`
  - Notes: Whitelist validator for flagship mission quorum
- **IdentityRegistry.addAdditionalValidator** (direct) — tx `0x4eee1c270712f3690293e1a28423794f451dba7c95849182a7e8e5244907d200`
  - Notes: Whitelist validator for flagship mission quorum
- **IdentityRegistry.addAdditionalValidator** (direct) — tx `0x1a777158e5ba2b3471357eb0852d6e90565cebe4f75c5ba3bb090c808b77ac34`
  - Notes: Whitelist validator for flagship mission quorum
- **StakeManager.setValidationModule** (forwarded) — tx `0x6309a39cf60bc8ead2517d6149b84c039c7ba69c408f1117a93e88896773752f`
  - Notes: Wire the validator stake locker to the active validation module
  - Params: ["0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883"]
- **ValidationModule.setValidatorPool** (forwarded) — tx `0x988f72bbcda81709cb54aa38d9040f2fea1d2941aeabe1af5cb40c2e0ca2280f`
  - Notes: Populate validator committee pool for demo mission
  - Params: [["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","0x90F79bf6EB2c4f870365E785982E1f101E93b906","0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"]]
- **ValidationModule.setValidatorBounds** (forwarded) — tx `0x63d9a1dffa766183d91a474faabc414e478d41a5ba8a4b4cc9cba10f4aea25d8`
  - Notes: Require at least 3 validators from a pool cap of 3
  - Params: [3,3]
  - Before: quorum: 2, pool: 3
  - After: min: 3, max: 3
- **ValidationModule.setValidatorsPerJob** (forwarded) — tx `0x153ca7edfd2b8884f090401b9b45217c0b309e1a25c6041014332b63dbc90e4e`
  - Notes: Assign 3 validators to each flagship job
  - Params: [3]
  - Before: requested: 3
- **ValidationModule.setRequiredValidatorApprovals** (forwarded) — tx `0x60f1941c6d913fc527bbfab9fa965470b23f28a1be815fa8c8f69d6c4ba11ff3`
  - Notes: Set quorum for validation success
  - Params: [2]
- **ValidationModule.setCommitWindow** (forwarded) — tx `0xad9f9c4b1cbcf8a767d497c883fdb733d624cfc988c8648fe39f47ff55d231b7`
  - Notes: Tighten commit window to 30 seconds for rapid demo cadence
  - Params: ["30"]
  - Before: commitWindow: 86400
  - After: commitWindow: 30
- **ValidationModule.setRevealWindow** (forwarded) — tx `0x8681a9e537c4cde870a5e56807e12921a62255ab6012171b02e4693aea5d55b0`
  - Notes: Match reveal horizon to five minutes
  - Params: ["300"]
  - Before: revealWindow: 86400
  - After: revealWindow: 300
- **StakeManager.setRoleMinimums** (forwarded) — tx `0xcccc2b52a35a735f27f28d88198a3ddb5cfccb1d7b19211ca8f2126e3517df1d`
  - Notes: Restore production minimum stake thresholds
  - Params: ["0","0","0"]
  - Before: agent: 10.0, validator: 25.0, platform: 12.5
  - After: agent: 0.0, validator: 0.0, platform: 0.0
- **JobRegistry.setJobStake** (forwarded) — tx `0x1c5750d89861f89b4c5c292bb3b898542bfadf0a5cb60e6a1c25ad6ee6757225`
  - Notes: Return job stake policy to its baseline value
  - Params: ["500000000000000000000"]
  - Before: stake: 20.0
  - After: stake: 500.0
