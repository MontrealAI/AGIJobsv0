# Ethereum mainnet: deployed contracts and commissioning status

**Updated 12 October 2026. The contracts are deployed; the recorded operational state is paused.** The public website remains a planning and demonstration experience. Deployment and explorer verification do not open live jobs or authorize payments.

## At a glance

| Question | Evidence and status |
| --- | --- |
| Which system? | **AGIJobsv0**, Ethereum mainnet, chain ID **1** |
| Settlement token | **AGIALPHA**, 18 decimals, [`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`](https://etherscan.io/address/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA) |
| Deployed source | [`source-v2.1.0-rc.4`](https://github.com/MontrealAI/AGIJobsv0/tree/source-v2.1.0-rc.4), commit `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e` |
| Contracts | **24**: coordinator, thirteen protocol components and ten fixed implementations |
| Recorded runtime comparison | **24/24 template matches** in the operator's saved run; compiler immutable locations were masked |
| Recorded operating state | All **eight** managed modules paused and owned by SystemPause |
| Current explorer observation | **24/24 exact source matches, including StakeManagerEscrow** |
| Governance | Ledger `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201`; ownership boundaries below |
| TaxPolicy | **Disabled** for this deployment |
| Open for live work? | **No commissioning approval is established by this record.** |

This is the AGIALPHA deployment of **AGIJobsv0**. **AGIJobManager / ENSJobPages is a separate system using USDC.** USDC amounts in commercial planning examples do not change this stack's contract token or settlement rules.

[Download/read the machine-readable address and evidence record](../deployments/ethereum-mainnet-2026-10-12.json). It includes all constructor arguments, fully qualified source names, original artifact/build identities, runtime-template digests and dated explorer observations. It is an informational inventory, not an executable deployment configuration.

The existing operational loaders use [the canonical address book](../deployment-addresses.json), now reconciled to this inventory: thirteen protocol components and the coordinator at the top level, with the ten fixed implementations under `implementations`. Its `network: mainnet` and `chainId: 1` fields are also understood by the environment generator. TaxPolicy and modules absent from this stack are explicitly zero; the separate legacy JobManager is not selected. For owner verification, select this inventory explicitly using the existing `OWNER_VERIFY_ADDRESS_BOOK` override and the mainnet network, as shown below. The protected verifier and its legacy default path are unchanged; do not rely on that default to select this inventory. Local and test-network reports require their own address book and network. Monitoring respects the book’s `network` tag and ignores zero placeholders, so another network or the older summary template cannot overwrite this selection. Explicit configuration, environment and command-line overrides still require operator review. The address book records locations only: it does not approve generic ownership-transfer commands, change the SystemPause topology or establish current ownership/pause state.

For a read-only mainnet owner report, after configuring the intended chain-1 provider and reviewed expected-owner settings:

```sh
OWNER_VERIFY_ADDRESS_BOOK=docs/deployment-addresses.json OWNER_VERIFY_STRICT=1 \
  npm run owner:verify-control -- --network mainnet
```

Strict verification fails on missing addresses, missing expected owners, ownership mismatches or read errors. Disabled/absent modules and the SystemPause ownership topology must be reconciled in the reviewed owner configuration; this example does not claim that commissioning already passes. It sends no ownership transaction. Check the report’s chain ID and selected address-book path before using the result.

## What happened

The existing coordinator [`0xeF1Be4B8251a9C4a584140C113508B95fd8B2543`](https://etherscan.io/address/0xeF1Be4B8251a9C4a584140C113508B95fd8B2543) was completed through the operator's controlled recovery. The transcript records eleven confirmed recovery transactions at nonces 262–272 and a final [`deployPaused` transaction](https://etherscan.io/tx/0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f). That final transaction is `0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f`. The earlier coordinator and ten fixed implementations were retained.

The final saved live verification run reports block **26172980**, matches for all 24 runtime templates, Ledger control of SystemPause and three direct-owner modules, and all eight managed modules paused under SystemPause. These are **operator-side observations** recovered from the supplied transcript, not a new RPC verification performed for this release. Separate `latest` reads and compiler-immutable masking mean they do not establish a single atomic snapshot or independently prove immutable values.

The deployment source tree is `4c95939614f0b21681ac94915e5365623f5bee48`. The recorded reviewed configuration SHA-256 is `5c16902d703dc8694c2f4b20deaaa98329ed2541d46f5051c6ca112d30ebe4be`. The new rc.5 source publication records this existing rc.4 deployment; its tag must not be substituted for the deployed-source identity when reproducing contract bytecode. Solidity, compiler settings, dependencies, token configuration and economic behavior are unchanged by this update.

## Contract address directory

Explorer observations were collected by read-only HTTPS requests from **2026-10-12T16:23:34.497469+00:00** through **2026-10-12T16:24:16.111647+00:00**, with StakeManagerEscrow checked again at **2026-10-12T17:12:43.458780+00:00** after its successful source publication. For each successful entry, Etherscan displayed **Source Code Verified — Exact Match** and the matching contract name. These are dated source-publication results, not a smart-contract security audit. The JSON record retains each page's SHA-256 and observation time.

| Contract | Ethereum address / explorer | Source publication |
| --- | --- | --- |
| Deployer | [`0xeF1Be4B8251a9C4a584140C113508B95fd8B2543`](https://etherscan.io/address/0xeF1Be4B8251a9C4a584140C113508B95fd8B2543#code) | Exact match |
| StakeManager | [`0xFd970F60363984A6274342776D34423EC37b5432`](https://etherscan.io/address/0xFd970F60363984A6274342776D34423EC37b5432#code) | Exact match |
| JobRegistry | [`0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084`](https://etherscan.io/address/0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084#code) | Exact match |
| ValidationModule | [`0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA`](https://etherscan.io/address/0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA#code) | Exact match |
| ReputationEngine | [`0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664`](https://etherscan.io/address/0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664#code) | Exact match |
| ArbitratorCommittee | [`0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1`](https://etherscan.io/address/0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1#code) | Exact match |
| DisputeModule | [`0x946A84df069764f18eE4A472Cc67890d585AC6Bd`](https://etherscan.io/address/0x946A84df069764f18eE4A472Cc67890d585AC6Bd#code) | Exact match |
| CertificateNFT | [`0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D`](https://etherscan.io/address/0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D#code) | Exact match |
| FeePool | [`0xa6091C773f3e400124744cc2bb47f16D347cA091`](https://etherscan.io/address/0xa6091C773f3e400124744cc2bb47f16D347cA091#code) | Exact match |
| IdentityRegistry | [`0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC`](https://etherscan.io/address/0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC#code) | Exact match |
| PlatformRegistry | [`0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21`](https://etherscan.io/address/0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21#code) | Exact match |
| JobRouter | [`0xb471BE24a09345C503eaA55B2A490f4d9488A37E`](https://etherscan.io/address/0xb471BE24a09345C503eaA55B2A490f4d9488A37E#code) | Exact match |
| PlatformIncentives | [`0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0`](https://etherscan.io/address/0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0#code) | Exact match |
| SystemPause | [`0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2`](https://etherscan.io/address/0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2#code) | Exact match |
| JobRegistryConfiguration | [`0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf`](https://etherscan.io/address/0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf#code) | Exact match |
| JobRegistryLifecycle | [`0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6`](https://etherscan.io/address/0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6#code) | Exact match |
| JobRegistrySettlement | [`0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e`](https://etherscan.io/address/0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e#code) | Exact match |
| StakeManagerConfiguration | [`0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E`](https://etherscan.io/address/0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E#code) | Exact match |
| StakeManagerStaking | [`0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A`](https://etherscan.io/address/0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A#code) | Exact match |
| StakeManagerEscrow | [`0x97A17aAC4F6bD865d9e38d53411526B3291e88ae`](https://etherscan.io/address/0x97A17aAC4F6bD865d9e38d53411526B3291e88ae#code) | Exact match |
| StakeManagerSlashing | [`0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5`](https://etherscan.io/address/0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5#code) | Exact match |
| ValidationModuleConfiguration | [`0x53221f2DF17EbD5F022DBa1eAcc856957074c723`](https://etherscan.io/address/0x53221f2DF17EbD5F022DBa1eAcc856957074c723#code) | Exact match |
| ValidationModuleVoting | [`0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A`](https://etherscan.io/address/0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A#code) | Exact match |
| ValidationModuleSelection | [`0x5454686c3F6866fA958A4D6Ea87c596E56BbA625`](https://etherscan.io/address/0x5454686c3F6866fA958A4D6Ea87c596E56BbA625#code) | Exact match |

## Governance and pause state

The mainnet parameter-change sentinel watches the deployed StakeManager, FeePool and JobRegistry. TaxPolicy is disabled and has no address to monitor; both `TaxPolicyUpdated` event conditions remain on those protocol emitters. All three checked-in sentinel templates resolve against this inventory without zero addresses. Rendering these files does not activate an external monitoring service; notification-channel mapping and operational commissioning remain required.

The eight managed contracts are **JobRegistry, StakeManager, ValidationModule, ReputationEngine, ArbitratorCommittee, DisputeModule, PlatformRegistry and FeePool**. Their recorded owner is **SystemPause**, whose governance authority is the Ledger address above. The saved later verifier also reports Ledger control of **CertificateNFT, IdentityRegistry and JobRouter**. Do not transfer the managed contracts directly to a wallet: the SystemPause ownership topology is intentional.

The recovery completion message initially left IdentityRegistry acceptance and coordinator handoff outstanding. The later verifier reports the three direct-owner modules under Ledger control, but does **not** prove coordinator ownership. Reconcile current `owner()` / `pendingOwner()` and all applicable acceptances before retiring the temporary deployer. This publication neither asserts coordinator handoff completion nor requests any ownership transaction or unpause.

## Explorer verification completed

The preserved API journal at **2026-10-12T02:47:18Z** records **19 verified / 5 failed**. Later operator-reported progress was **22/24**. The initial page inspection at 16:23–16:24 UTC found **23/24**, including **StakeManager**. The subsequent operator success screen and fresh StakeManagerEscrow page inspection at 17:12 UTC bring the current recorded total to **24/24 exact source matches**. Earlier 19/24, 22/24 and 23/24 results are retained as history, not current failures.

**StakeManagerEscrow is now source verified.** The latest supplied browser result shows successful generation of matching bytecode and ABI for `0x97A17aAC4F6bD865d9e38d53411526B3291e88ae`. The independent read-only page check displays **Source Code Verified — Exact Match**, contract name **StakeManagerEscrow**, and compiler **v0.8.25+commit.b61c2a91**. This supersedes the earlier 12:11 Toronto-time `err_code_5` result, empty selected contract name and `0x` compiled-bytecode display. Those earlier errors did not establish a Solidity defect. Source verification is complete for the recorded inventory; commissioning and current-state checks remain separate.

The original build uses Solidity **0.8.25+commit.b61c2a91**, optimizer **200** runs, **viaIR**, and **Cancun**. Preserve the original compiler input and settings, exact fully qualified target, constructor arguments and local replay proof when investigating. Do not redeploy or alter token economics, Solidity, ABI/events or compilation settings merely to obtain an explorer badge. Verification troubleshooting and source publication send no Ethereum transaction and require no wallet key.

The [Escrow verification retrospective and offline reproduction guide](escrow-verification-2026-10-12.md) preserves the successful **39-source v5 solution**, exact input and source hashes, portable replay tool, and regression evidence. It explains why the two additional original files must be retained for this input. The contract is already verified: use the tool for archival reproduction, not another submission.

## What remains before opening

Use the [current production readiness record](readiness.md) for the complete gates. Remaining work includes fresh, block-bound ownership/pause/immutable and configuration checks; coordinator handoff reconciliation; authorized production signing; independent security review; and real provider, worker, reviewer, settlement, monitoring and recovery commissioning. The source release does not waive any of these requirements.

The `source-v2.1.0-rc.5` tag publishes this source and evidence record. It does not trigger the signed production release workflow, which accepts `v*` tags. That workflow's generic full-stack manifest still requires TaxPolicy, RewardEngine and Thermostat addresses; those components are intentionally absent here. A future production release requires a reviewed deployment-specific inventory and its strict validation, in addition to signing and commissioning. This source update does not relax required-address or warning gates to make that production workflow pass.

You can use the [English welcome guide](https://montrealai.github.io/AGIJobsv0/start/), [French guide](https://montrealai.github.io/AGIJobsv0/start/fr/), saved job drafts and local SUCCESSOR Ω experiences now within their documented limits. The previously merged garden-club example in [PR #3923](https://github.com/MontrealAI/AGIJobsv0/pull/3923) is included in rc.5, alongside the rc.4 dependency and storage-credential repairs. Existing demos and flowcharts are retained.

For a **new, separately approved deployment**, use the [Hardhat guide](../deployment-v2-agialpha.md). To investigate this existing deployment, begin with its preserved evidence and addresses above; the checked-in generic configuration templates are not a command to deploy again.
