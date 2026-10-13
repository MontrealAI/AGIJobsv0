# AGI Alpha Agent + AGI Jobs: the shared ecosystem

**[Explore the public ecosystem guide](https://montrealai.github.io/AGIJobsv0/ecosystem/) · [Inspect all deployed contracts](https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts) · [Explore the Alpha view](https://montrealai.github.io/AGI-Alpha-Agent-v0/ecosystem/)**

AGI Alpha Agent helps explore candidate ideas and develop a plan. AGI Jobs gives a bounded task its work order, evidence, review and payment rules. Used together, they can turn a selected idea into accountable digital work. Their shared token is **$AGIALPHA on Ethereum mainnet**.

## The shared token

| Identity | Recorded value |
| --- | --- |
| Name / symbol | AGI ALPHA / AGIALPHA |
| Network | Ethereum mainnet, chain ID 1 |
| Decimals | 18 |
| Token contract | [0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA](https://etherscan.io/token/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA) |

Both public deployment records identify this same address. Their contracts use it for configured funding, stakes, fees and settlement operations. Each suite retains its own market, interfaces and admission rules. The token is a shared dependency, separate from the 29 contract instances below. The public examples and planners can be explored without a wallet or token payment.

Sources: [Alpha deployment record](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/deployments/ethereum-mainnet/2026-10-11/manifest.json) · [Jobs deployment record](https://github.com/MontrealAI/AGIJobsv0/blob/a1dea46d2f9dfa5680d11e24529f107d65cd4369/docs/deployments/ethereum-mainnet-2026-10-12.json).

## Why the combination is useful

| Contribution | AGI Alpha Agent | AGI Jobs |
| --- | --- | --- |
| Decide what to pursue | Explore ideas, compare approaches and develop a committed plan. | Turn the chosen scope into a specific assignment and acceptance criteria. |
| Coordinate participation | The deployed Ascension suite includes identity admission, plan ownership, staked risk review and a funded market. | Identity, stakes, job routing, validation and dispute mechanisms define participation in the Jobs protocol. |
| Make outcomes reviewable | Preserve the plan, its evidence commitments and lineage. | Collect a result and its evidence, coordinate review and apply the configured finalization rules. |
| Learn from useful work | Retain useful methods for future authorized work. | Use the review record and outcomes to inform later tasks; SUCCESSOR can preserve mission knowledge within its documented scope. |

The practical benefit is a clearer connection between an idea and a result that someone can inspect. Bounded digital tasks are a useful starting point: software fixes, structured research, document comparisons and reconciliations with explicit acceptance checks. Performance depends on the selected task, worker and reviewer. A contract does not establish that an idea is correct or valuable, and a source deployment is not evidence of autonomous general intelligence or economic returns.

See the [machine labor workflow](MACHINE_LABOR.md), [evidence review guide](EVIDENCE_REVIEW.md) and [SUCCESSOR guide](successor/README.md) for their actual execution and verification boundaries.

## A practical example: improve an open-source tool

This is an illustrative workflow, not a report of a completed paid job or a live automatic bridge.

1. **Choose an approach.** An Alpha Agent workflow compares fixes for a CSV import bug and prepares a plan with expected behavior and acceptance tests.
2. **Define a bounded assignment.** The requester identifies the permitted files, deadline and criteria. The deliverable is a patch, a minimal reproduction case and test output.
3. **Deliver and review.** An admitted worker prepares the result. An independent reviewer reproduces the problem and checks the submitted patch. Evidence that fails the criteria remains a failed check.
4. **Complete the agreed process.** The selected market's validation, dispute and finalization rules determine whether payment can happen. The team can retain the reviewed method for a later task with its own permissions.

Visitors can [try the guided example](https://montrealai.github.io/AGIJobsv0/start/example/) or [design a request](https://montrealai.github.io/AGIJobsv0/work/) without connecting a service or funding a job.

## The integration boundary

A shared token does not automatically connect the two deployed markets. An operator must connect compatible job interfaces and admit the right identities.

- The deployed Alpha MARK contract has an **immutable Alpha market address**. It cannot simply be repointed to the Jobs JobRegistry. A Jobs connection needs a separately configured and reviewed adapter or workflow.
- The projects use different ENS identity namespaces. Jobs must explicitly activate the necessary Alpha identity aliases or another supported admission path. Owning tokens alone grants no participant role.
- Integration work must use the actual deployed interfaces and source. Repository updates can contain changes absent from the existing contracts.

Sources: [Alpha deployment guide](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/docs/agent/MAINNET_DEPLOYMENT.md) · [Jobs deployed source](https://github.com/MontrealAI/AGIJobsv0/tree/b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e) · [Jobs computer-work integration](computer-work.md). These pages do not assert that aliases or a mainnet cross-market adapter are currently commissioned.

## The deployed contract directory

The source-pinned public records identify **5 Alpha instances + 24 Jobs instances = 29** on Ethereum mainnet. The Jobs count comprises **13 protocol components, 1 deployment coordinator and 10 fixed implementations**. These are components of two suites, not 29 separate protocols. Every full address links to its Etherscan source page.

The website publishes the same [static JSON directory](../website/data/ecosystem.json). It makes no live RPC calls and does not infer current ownership, pause state, security or funding readiness from the addresses.

### Alpha: ideas, admission, risk and funded work

| Contract | Plain-language role | Ethereum mainnet address |
| --- | --- | --- |
| AscensionAccess | Checks ENS identity and participant admission. | [0x36f8C079fEEBC81c5AF30D71be5017037246a32e](https://etherscan.io/address/0x36f8C079fEEBC81c5AF30D71be5017037246a32e#code) |
| NovaSeed | Records ownership of the token representing a committed plan and its lineage. | [0xFA4737Ba7cF111EBb0840aA300BC61D84d303449](https://etherscan.io/address/0xFA4737Ba7cF111EBb0840aA300BC61D84d303449#code) |
| AscensionRiskOracle | Coordinates staked risk review and reviewer availability. | [0x06cb4D684628846B048d88CCf8C03c4Cfb74f149](https://etherscan.io/address/0x06cb4D684628846B048d88CCf8C03c4Cfb74f149#code) |
| AscensionJobMarket | Runs auctions, work review and settlement for the Alpha market. | [0x86f84E173A7a1a4588f4e757552F20f7C58e61E8](https://etherscan.io/address/0x86f84E173A7a1a4588f4e757552F20f7C58e61E8#code) |
| AscensionMark | Restricts funding to the committed work plan in its fixed Alpha market. | [0xa28dA507f7F9AFF8910f1F7cB5d5b8238F5Db625](https://etherscan.io/address/0xa28dA507f7F9AFF8910f1F7cB5d5b8238F5Db625#code) |

### Jobs: protocol components and deployment coordinator

| Contract | Plain-language role | Ethereum mainnet address |
| --- | --- | --- |
| Deployer | Assembles the deployment and coordinates its initial configuration. | [0xeF1Be4B8251a9C4a584140C113508B95fd8B2543](https://etherscan.io/address/0xeF1Be4B8251a9C4a584140C113508B95fd8B2543#code) |
| StakeManager | Holds participant stakes and job funds under the protocol rules. | [0xFd970F60363984A6274342776D34423EC37b5432](https://etherscan.io/address/0xFd970F60363984A6274342776D34423EC37b5432#code) |
| JobRegistry | Records assignments, deadlines, submitted work and job outcomes. | [0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084](https://etherscan.io/address/0x72Ec2CcC9403b643C4d6CA3eF05E06ca8faa3084#code) |
| ValidationModule | Coordinates validator selection and commit/reveal review rounds. | [0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA](https://etherscan.io/address/0xCcfC0Adae434446D1809f0551b34990dE5fBe3eA#code) |
| ReputationEngine | Records the reputation effects of work and review outcomes. | [0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664](https://etherscan.io/address/0x863B985A3a1a5fFf292178aC91Cd75d62F2b7664#code) |
| ArbitratorCommittee | Coordinates committee decisions for escalated disputes. | [0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1](https://etherscan.io/address/0xF8eBD86d66CDda12C3F881a38c5e5db4FeCeb2d1#code) |
| DisputeModule | Tracks challenges to job outcomes and their resolution. | [0x946A84df069764f18eE4A472Cc67890d585AC6Bd](https://etherscan.io/address/0x946A84df069764f18eE4A472Cc67890d585AC6Bd#code) |
| CertificateNFT | Issues transferable certificates for completed work under its rules. | [0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D](https://etherscan.io/address/0xd3851E3525080d8914e282Cc89Ff40cD7D4be77D#code) |
| FeePool | Collects and distributes protocol fees under its configuration. | [0xa6091C773f3e400124744cc2bb47f16D347cA091](https://etherscan.io/address/0xa6091C773f3e400124744cc2bb47f16D347cA091#code) |
| IdentityRegistry | Checks participant identity and the names or aliases admitted by governance. | [0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC](https://etherscan.io/address/0xFfE52FB27d66dcCCDF03376b400d6E399DeC3EEC#code) |
| PlatformRegistry | Registers participating platforms and their protocol standing. | [0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21](https://etherscan.io/address/0x1cfd99F0a4937BD279aBa93c1184a270FEe6FE21#code) |
| JobRouter | Routes work through the configured platform relationships. | [0xb471BE24a09345C503eaA55B2A490f4d9488A37E](https://etherscan.io/address/0xb471BE24a09345C503eaA55B2A490f4d9488A37E#code) |
| PlatformIncentives | Coordinates configured platform participation incentives. | [0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0](https://etherscan.io/address/0x243c6D5B1104d76c7dfE31418b14Ea1a4DB2a0d0#code) |
| SystemPause | Provides coordinated pause controls for managed protocol components. | [0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2](https://etherscan.io/address/0xcAEf0CD10Bf7DfB3894362D2Ddd69D26D771BCd2#code) |

### Jobs: fixed implementations

| Contract | Plain-language role | Ethereum mainnet address |
| --- | --- | --- |
| JobRegistryConfiguration | Fixed implementation of job configuration and administrative logic. | [0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf](https://etherscan.io/address/0x175B9087a8d088073C9896F0CbF7b072b6ED11Bf#code) |
| JobRegistryLifecycle | Fixed implementation of job creation, application and submission logic. | [0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6](https://etherscan.io/address/0x4f40CE804DD40A87667bDD0e03d8D5A2bA402FB6#code) |
| JobRegistrySettlement | Fixed implementation of job finalization and settlement logic. | [0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e](https://etherscan.io/address/0x70EBFBa633E1519c9b4a5A659A9137Fd31662d0e#code) |
| StakeManagerConfiguration | Fixed implementation of stake and economic parameter configuration. | [0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E](https://etherscan.io/address/0x6D46fF00d11acF432E4E8f882EABB9C974F0d72E#code) |
| StakeManagerStaking | Fixed implementation of participant stake operations. | [0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A](https://etherscan.io/address/0x44dA2237A94B4b07B9C1e3E44742C9AF4AA77a7A#code) |
| StakeManagerEscrow | Fixed implementation of job funding, escrow and payout operations. | [0x97A17aAC4F6bD865d9e38d53411526B3291e88ae](https://etherscan.io/address/0x97A17aAC4F6bD865d9e38d53411526B3291e88ae#code) |
| StakeManagerSlashing | Fixed implementation of penalties and related stake accounting. | [0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5](https://etherscan.io/address/0xEbB4c5FB19fe64712Fe8996638bEf092aa8347F5#code) |
| ValidationModuleConfiguration | Fixed implementation of review parameters and administrative logic. | [0x53221f2DF17EbD5F022DBa1eAcc856957074c723](https://etherscan.io/address/0x53221f2DF17EbD5F022DBa1eAcc856957074c723#code) |
| ValidationModuleVoting | Fixed implementation of commit/reveal voting and review completion. | [0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A](https://etherscan.io/address/0x04af6F94C7F74933BEeE4f6D39ceC4B2d9f7A42A#code) |
| ValidationModuleSelection | Fixed implementation of validator selection logic. | [0x5454686c3F6866fA958A4D6Ea87c596E56BbA625](https://etherscan.io/address/0x5454686c3F6866fA958A4D6Ea87c596E56BbA625#code) |

## What the evidence establishes

### Alpha: recorded 11 October 2026

The [pinned manifest](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/deployments/ethereum-mainnet/2026-10-11/manifest.json) and [dated deployment guide](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/docs/agent/MAINNET_DEPLOYMENT.md) identify the five deployed instances. The record does not establish participant commissioning or readiness for public funding. The deployed contracts use the archived Solidity 0.8.24 source bundle; current source includes later settlement hardening that is not part of those instances. See the [current Alpha readiness guidance](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/main/docs/agent/MAINNET_DEPLOYMENT.md) before considering a live workflow.

### Jobs: recorded 12 October 2026

The [pinned deployment record](https://github.com/MontrealAI/AGIJobsv0/blob/a1dea46d2f9dfa5680d11e24529f107d65cd4369/docs/deployments/ethereum-mainnet-2026-10-12.json) and [address map](https://github.com/MontrealAI/AGIJobsv0/blob/a1dea46d2f9dfa5680d11e24529f107d65cd4369/docs/deployment-addresses.mainnet.json) identify all 24 instances. The publication records exact-source Etherscan observations for all 24. It does not approve production or open live intake, and it is not a fresh chain-state check.

The deployed source is [source-v2.1.0-rc.4, commit `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`](https://github.com/MontrealAI/AGIJobsv0/tree/b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e). A newer source release, website publication or documentation revision does not redeploy these instances. Consult the [dated deployment guide](https://github.com/MontrealAI/AGIJobsv0/blob/a1dea46d2f9dfa5680d11e24529f107d65cd4369/docs/production/mainnet-deployment-2026-10-12.md) and [current Jobs production readiness](production/readiness.md) for their separate evidence and commissioning requirements.

Source verification, correct deployment, operational commissioning and successful real work are distinct questions. The directory answers which published instances belong to the two suites and where to inspect their source evidence. It makes no performance, revenue or token-return promise.

## Start with a task you can explain and check

[Open the guided welcome page](https://montrealai.github.io/AGIJobsv0/start/), define what a useful result looks like, and choose its evidence requirements. For a live service, follow the deployed release's operator guidance and complete the necessary admission, configuration and independent review.
