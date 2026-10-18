# Ethereum mainnet deployment: 18 October 2026

**25 deployed contracts, all exact-source verified. All eight managed modules remain paused.** This is a dated deployment and bounded readback record, not operational activation or an independent security audit. Production approval and activation readiness remain **false**.

## Exact source and observation times

- Deployed source: [`818b3a246871e4cd4dde86558dbb91ef82b15eef`](https://github.com/MontrealAI/AGIJobsv0/tree/818b3a246871e4cd4dde86558dbb91ef82b15eef), tree `b1c3bb0f4b8d64e0d23376d6b6ef3722c4c67b0d`. It is the source on [draft PR #3986](https://github.com/MontrealAI/AGIJobsv0/pull/3986), not the current main branch or a release tag.
- Compiler: Solidity `0.8.37+commit.f401782d`, Cancun, via-IR, 200 optimizer runs, IPFS metadata. Original Standard JSON SHA-256: `a962576832d4540c4cd682f9251b6eed2a333c87a1ce5fa61ed5716e7091b891`.
- State anchor: provider-reported finalized block [26,221,285](https://etherscan.io/block/26221285), hash `0x4bd7698479db125e9a7e4f031571fd2844224f822a630ba22b40aea48fb592e6`, at **2026-10-18 18:37:11 UTC**. Canonicality and provider-finalized status were rechecked; readback completed **18:55:20.035 UTC**.
- Explorer observations were separately timed between 18:54:46 and 18:55:16 UTC. Etherscan source metadata is not block-pinned chain state.

The [public snapshot](deployment-snapshot.json) retains each exact address, runtime hash, fully qualified source, compiler-input hash, constructor encoding, observed owner and explorer comparison. The [39 successful deployment receipts](deployment-receipts.json) retain creator nonces 308–346 and canonical receipt anchors from the completed deployment report. These are historical records, not instructions to sign or replay transactions.

## What was checked

- **25/25** exact runtime comparisons, including constructor-dependent immutable values.
- **25/25** Etherscan source-content, compiler, settings, contract-name and constructor-argument comparisons; **zero Similar Match**, unverified or incomplete results.
- **46/46** explicitly named finalized-state getter checks passed.
- **8/8** managed modules were paused and owned by SystemPause. The creator owned **none of these 25 contracts**.
- IdentityRegistry and TaxPolicy pending owners were zero.

Five StakeManager-family verifications used minimal 37-source import closures. Closure proofs retained exact source contents, settings, executable creation/runtime bytes, metadata, ABI and link references. Immutable declaration and patched-value equivalence were checked; compiler-internal AST IDs may differ after pruning. Verification does not change deployed code.

## Governance and configured policy

The owner-operated Ledger governance address is [`0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`](https://etherscan.io/address/0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99). Chain readback proves the recorded address values, not physical key custody or an exhaustive absence of indirect permissions.

- SystemPause: [`0x887782AE59A56D1E9923947A6784A4453193e303`](https://etherscan.io/address/0x887782AE59A56D1E9923947A6784A4453193e303#code), governed by the address above.
- StakeManager treasury and FeePool governance: [`0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201`](https://etherscan.io/address/0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201).
- FeePool treasury: `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`.
- Creator: `0x6c8B8897Fb6b08B4070387233B89b3E9A94eD00E`; it is absent from the two explicitly checked treasury allowlists and owns none of the recorded contracts.

The completed configuration records **10% per-job collateral (1000 basis points)**, distinct from the **1000 AGIALPHA** general minimum stake; fee 5%, burn 1%, employer/treasury slash split 10%/90%, validator slash reward 0%, and 86,400-second commit and reveal windows. Amounts use the existing [18-decimal AGIALPHA token](https://etherscan.io/token/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA). These economic settings come from the completed configuration record; the final readback freshly queried only the listed 46 getters. They are not all fresh economic observations.

TaxPolicy points to the [immutable participant tax responsibilities policy](https://github.com/MontrealAI/AGIJobsv0/blob/d825fa884261be248e96d6910355df3d3d4c5691/docs/tax-policy.md). That policy does not promise a tax exemption or replace independent advice. Full ENS roots and configuration fields remain in the public snapshot.

## Address directory

| Contract | Ethereum mainnet address | Observed owner |
| --- | --- | --- |
| Deployer | [0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740](https://etherscan.io/address/0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| StakeManagerConfiguration | [0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b](https://etherscan.io/address/0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| StakeManagerStaking | [0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0](https://etherscan.io/address/0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| StakeManagerEscrow | [0xc10978057A9F23976A29f27c78E795ED415b3E8E](https://etherscan.io/address/0xc10978057A9F23976A29f27c78E795ED415b3E8E#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| StakeManagerSlashing | [0x11C066651558f0a4211ab5696A1e48b3553ef318](https://etherscan.io/address/0x11C066651558f0a4211ab5696A1e48b3553ef318#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| StakeManager | [0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1](https://etherscan.io/address/0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| JobRegistryConfiguration | [0x54deeE2A22b3D06965522530De78081d92Df43a9](https://etherscan.io/address/0x54deeE2A22b3D06965522530De78081d92Df43a9#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| JobRegistryLifecycle | [0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4](https://etherscan.io/address/0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| JobRegistrySettlement | [0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0](https://etherscan.io/address/0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| JobRegistry | [0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6](https://etherscan.io/address/0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| ValidationModuleConfiguration | [0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561](https://etherscan.io/address/0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| ValidationModuleVoting | [0x9c88Ee891144A0841012685A1D118C95Ec667c69](https://etherscan.io/address/0x9c88Ee891144A0841012685A1D118C95Ec667c69#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| ValidationModuleSelection | [0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF](https://etherscan.io/address/0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| ValidationModule | [0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3](https://etherscan.io/address/0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| ReputationEngine | [0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5](https://etherscan.io/address/0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| ArbitratorCommittee | [0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC](https://etherscan.io/address/0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| DisputeModule | [0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b](https://etherscan.io/address/0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| CertificateNFT | [0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B](https://etherscan.io/address/0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| TaxPolicy | [0x680dD5f7107952F6b26b1dE620b8AC6BC241627C](https://etherscan.io/address/0x680dD5f7107952F6b26b1dE620b8AC6BC241627C#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| FeePool | [0x81686E65649B95F12CC50d5E3846343Ed0Cfae93](https://etherscan.io/address/0x81686E65649B95F12CC50d5E3846343Ed0Cfae93#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| IdentityRegistry | [0x217B7709FfeD0e4C7A9415be64e323c56E0F8773](https://etherscan.io/address/0x217B7709FfeD0e4C7A9415be64e323c56E0F8773#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| PlatformRegistry | [0x543693a69C3ddbcE8DB590235989E502cBb9FEdb](https://etherscan.io/address/0x543693a69C3ddbcE8DB590235989E502cBb9FEdb#code) | `0x887782AE59A56D1E9923947A6784A4453193e303` |
| JobRouter | [0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7](https://etherscan.io/address/0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| PlatformIncentives | [0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF](https://etherscan.io/address/0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |
| SystemPause | [0x887782AE59A56D1E9923947A6784A4453193e303](https://etherscan.io/address/0x887782AE59A56D1E9923947A6784A4453193e303#code) | `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` |

## Source release and operational boundaries

This new stack is separate from the [12 October deployment](../mainnet-deployment-2026-10-12.md). The old addresses, source, receipts, fixed-stake policy and obligations remain historical and unchanged. Publication does not migrate funds, extinguish obligations, alter old approvals or repoint a wallet/client profile.

The publication branch starts from main `af71b175fb4930cfe6b4f5bfc29987fa863bda05`. Comparison against deployed source `818b3a246871e4cd4dde86558dbb91ef82b15eef` found identical `contracts/`, `config/solidity-compiler.json` and `config/implementation-modules.json`; deployment and qualification tooling differs. This limited source comparison is not whole-tree equality or a claim that compiling the release recreates the deployment artifact. The exact deployed source remains the authority for reproduction.

The public directory is informational. No live transaction route, deployment profile, funding, unpause, migration or production signing is enabled by this publication. Contracts are **paused**, not permanently locked; any later governance action requires its own authorization and applicable readiness evidence. Named getter checks do not establish exhaustive historical/indirect authority, ENS/operator readiness, full obligation reconciliation, or a security certification. Provider/worker commissioning, monitoring/recovery and independent acceptance remain separate gates. External audit and Sepolia rehearsal were not performed (owner-accepted omissions); automated and AI-assisted checks are not an external audit. See [current readiness](../readiness.md).

## Evidence integrity

Original completed deployment report SHA-256: `bad23bc71cde7a888f824b310d3ef7762ebc4ce6f1ac82eb8859521ff9986e7c`.

Finalized source/governance readback SHA-256: `ae80dd19133da0a3fbaacb4612f8a07df0c11fbd137615487311fb8ab5f8dec2`.

Five-closure proof manifest SHA-256: `d6430dee1c4059e1aec65448fc9112a7753178052acb0c7eff162c9fb7cda2ce`.

These identify retained original evidence. Public JSON files are deliberately scoped projections and have their own checksums in the release inventory; their hashes must not be substituted for the original reports. Local paths, process/lease details and private operational data are excluded.
