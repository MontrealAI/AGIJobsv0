# Ethereum mainnet — paused deployment and verification (2026-10-12)

**Status: deployed on Ethereum mainnet, kept paused; not commissioned for paid jobs.** This is a dated operator-evidence record, **not** a GitHub-controlled transaction, independent security audit, continuous live monitoring service, or production approval. It must not be substituted for the [production readiness checklist](readiness.md).

The real staged deployment completed on the existing coordinator after reconciling an interrupted transaction. The operator's retained run reported `EXISTING_COORDINATOR_RECOVERY_COMPLETED — ALL EIGHT MANAGED MODULES PAUSED`, with no creation of a second coordinator. The original Solidity source was pinned to [`b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`](https://github.com/MontrealAI/AGIJobsv0/commit/b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e); later website/documentation commits must **not** be described as deployed contract code.

**Latest browser-evidence snapshot:** **23 of 24 Etherscan source verifications reported complete**; `StakeManagerEscrow` is still missing Etherscan's verified-source publication. The five StakeManager-family contracts separately achieved independent exact-match verification at Sourcify, but this is **not equivalent** to Etherscan publication or an audit. The source verification state is dated October 12, 2026 and must be refreshed from the explorer before claiming a current count.

[Machine-readable 24-contract address/status register](ethereum-mainnet-2026-10-12.json) · [Source prerelease](https://github.com/MontrealAI/AGIJobsv0/releases/tag/source-v2.1.0-rc.4) · [Current onboarding](https://montrealai.github.io/AGIJobsv0/start/)

## Operator-recorded deployment identity

| Field | Value |
| --- | --- |
| Network / chain ID | Ethereum mainnet / `1` |
| AGIALPHA token | `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA` |
| Source commit actually deployed | `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e` |
| Solidity profile | `v0.8.25+commit.b61c2a91`, optimizer 200, `viaIR`, Cancun |
| Coordinator | [`0xeF1Be4B8251a9C4a584140C113508B95fd8B2543`](https://etherscan.io/address/0xeF1Be4B8251a9C4a584140C113508B95fd8B2543) |
| Paused finalization | [`0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f`](https://etherscan.io/tx/0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f) |
| Ledger governance address | `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201` |
| Temporary deployment-only EOA | `0x6c8B8897Fb6b08B4070387233B89b3E9A94eD00E` |
| SystemPause | `0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2` |
| TaxPolicy | Deliberately omitted for this paused launch |

**Historical checks, not live claims:** The verifier reported that Ledger governance owned SystemPause and three direct-owner modules, and that all eight SystemPause-managed modules were paused and owned by SystemPause. These checks are separate from accepting every pending owner transfer. The initial staged-recovery report recorded additional network fees of 0.003648063190538963 ETH; that figure does not include earlier deployment transactions, explorer costs, or future governance transactions.

## Public contract addresses and source verification

“Verified (reported)” is based on a combination of Etherscan V2 readback recorded in operator evidence and the subsequent browser success screenshots—not a fresh automated read by the repository. Click any address to examine its current source directly.

| Contract | Mainnet address | Etherscan source (dated evidence) |
| --- | --- | --- |
| `Deployer` | [`0xeF1Be4B8251a9C4a584140C113508B95fd8B2543`](https://etherscan.io/address/0xeF1Be4B8251a9C4a584140C113508B95fd8B2543#code) | Verified (reported) |
| `StakeManager` | [`0xFd970F60363984A6274342776D34423EC37b5432`](https://etherscan.io/address/0xFd970F60363984A6274342776D34423EC37b5432#code) | Verified (reported) |
| `JobRegistry` | [`0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084`](https://etherscan.io/address/0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084#code) | Verified (reported) |
| `ValidationModule` | [`0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA`](https://etherscan.io/address/0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA#code) | Verified (reported) |
| `ReputationEngine` | [`0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664`](https://etherscan.io/address/0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664#code) | Verified (reported) |
| `ArbitratorCommittee` | [`0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1`](https://etherscan.io/address/0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1#code) | Verified (reported) |
| `DisputeModule` | [`0x946A84df069764f18eE4A472Cc67890d585AC6Bd`](https://etherscan.io/address/0x946A84df069764f18eE4A472Cc67890d585AC6Bd#code) | Verified (reported) |
| `CertificateNFT` | [`0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D`](https://etherscan.io/address/0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D#code) | Verified (reported) |
| `FeePool` | [`0xa6091C773f3e400124744cc2bb47f16D347cA091`](https://etherscan.io/address/0xa6091C773f3e400124744cc2bb47f16D347cA091#code) | Verified (reported) |
| `IdentityRegistry` | [`0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC`](https://etherscan.io/address/0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC#code) | Verified (reported) |
| `PlatformRegistry` | [`0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21`](https://etherscan.io/address/0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21#code) | Verified (reported) |
| `JobRouter` | [`0xb471BE24a09345C503eaA55B2A490f4d9488A37E`](https://etherscan.io/address/0xb471BE24a09345C503eaA55B2A490f4d9488A37E#code) | Verified (reported) |
| `PlatformIncentives` | [`0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0`](https://etherscan.io/address/0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0#code) | Verified (reported) |
| `SystemPause` | [`0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2`](https://etherscan.io/address/0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2#code) | Verified (reported) |
| `JobRegistryConfiguration` | [`0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf`](https://etherscan.io/address/0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf#code) | Verified (reported) |
| `JobRegistryLifecycle` | [`0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6`](https://etherscan.io/address/0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6#code) | Verified (reported) |
| `JobRegistrySettlement` | [`0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e`](https://etherscan.io/address/0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e#code) | Verified (reported) |
| `StakeManagerConfiguration` | [`0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E`](https://etherscan.io/address/0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E#code) | Verified (reported) |
| `StakeManagerStaking` | [`0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A`](https://etherscan.io/address/0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A#code) | Verified (reported) |
| `StakeManagerEscrow` | [`0x97A17aAC4F6bD865d9e38d53411526B3291e88ae`](https://etherscan.io/address/0x97A17aAC4F6bD865d9e38d53411526B3291e88ae#code) | **Not verified** |
| `StakeManagerSlashing` | [`0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5`](https://etherscan.io/address/0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5#code) | Verified (reported) |
| `ValidationModuleConfiguration` | [`0x53221f2DF17EbD5F022DBa1eAcc856957074c723`](https://etherscan.io/address/0x53221f2DF17EbD5F022DBa1eAcc856957074c723#code) | Verified (reported) |
| `ValidationModuleVoting` | [`0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A`](https://etherscan.io/address/0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A#code) | Verified (reported) |
| `ValidationModuleSelection` | [`0x5454686c3F6866fA958A4D6Ea87c596E56BbA625`](https://etherscan.io/address/0x5454686c3F6866fA958A4D6Ea87c596E56BbA625#code) | Verified (reported) |

**Progress boundary:** 19 sources were previously Etherscan-verified; browser submissions subsequently showed matching bytecode and ABI for `StakeManagerConfiguration`, `StakeManagerStaking`, `StakeManagerSlashing`, and `StakeManager`, yielding 23 reported verified. `StakeManagerEscrow` had independent exact-match evidence and an exact original 267-source local compiler replay, but Etherscan browser verification still lacked a matching published source. Its targeted verification remains **open**, not silently promoted to verified.

**Escrow compiler evidence:** On Ubuntu, the operator's original 267-source target-only replay matched the compiled contract in roughly 4.56 seconds. Pruned sets of 37–243 sources changed bytecode; the broad 267-source browser-output compilation exceeded a bounded time limit, and the attempted browser input returned empty compiled bytecode `0x`. This identifies a verifier/compilation-output problem to investigate; it is **not** proof that Escrow on-chain bytecode differs. Do not modify deployed Solidity or claim a matching smaller input without a full exact replay.

## What must still be completed

1. **Explorer:** obtain and independently read back the exact Etherscan verification for `StakeManagerEscrow`, including matching contract identity, ABI, compiler metadata and constructor arguments. Preserve prior submitted GUIDs and original source/bytecode.
2. **Ledger acceptance:** execute the pending two-step `IdentityRegistry` ownership acceptance from the Ledger address on its separate signing computer, then verify the real on-chain owner. Never paste a Ledger seed phrase or private key into a deployment terminal.
3. **Coordinator handoff:** separately prepare and verify the coordinator's transfer from the temporary deployment EOA to the Ledger governance address. Do not assert the temporary EOA is retired until confirmed. Never directly transfer the eight managed modules away from SystemPause.
4. **FeePool and economics:** independently inspect FeePool treasury and role/allowlist settings, plus the installed fee, burn, slashing and stake parameters; execute approved changes only through the documented governance path.
5. **Production gates:** independent security review, maintainer release signing, effective repository review protection, approved operational providers/workers, monitoring, end-to-end independent acceptance/settlement evidence and tested emergency recovery. **No unpause or paid intake without explicit governance commissioning.**

The original deployment and recovery journals remain private on the operator's machine. **Do not commit private keys, API keys, wallet seeds, signed raw transactions, browser storage, or unredacted provider configuration** to this public repository. Publish only the reviewed public-address and hash evidence.

## Source/publication boundaries

This source snapshot updates documentation, not Ethereum state. No deployment, signing, ownership transfer, tax activation, Escrow source verification, or change to the eight paused modules is performed by this publication. Public verification does not certify economic correctness or authorize production use.

For the maintained workflow see [the staged deployment guide](../deployment-v2-agialpha.md), [fixed implementations](fixed-implementations.md), and [current readiness](readiness.md). All historical demos and Mermaid diagrams are retained.
