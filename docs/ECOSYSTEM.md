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

Both public deployment records identify this same address. Their contracts use it for configured funding, stakes, fees and settlement operations. Each suite retains its own market, interfaces and admission rules. The token is a shared dependency, separate from the 30 contract instances below. The public examples and planners can be explored without a wallet or token payment.

Sources: [Alpha deployment record](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/deployments/ethereum-mainnet/2026-10-11/manifest.json) · [Jobs deployment record](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-snapshot.json).

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

The source-pinned public records identify **5 retained Alpha instances + 25 new Jobs instances = 30** on Ethereum mainnet. The Jobs count comprises **14 protocol components, 1 deployment coordinator and 10 fixed implementations**. These are components of two suites, not 30 separate protocols. Every full address links to its Etherscan source page.

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
| Deployer | Assembles the deployment and coordinates its initial configuration. | [0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740](https://etherscan.io/address/0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740#code) |
| StakeManager | Holds participant stakes and job funds under the protocol rules. | [0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1](https://etherscan.io/address/0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1#code) |
| JobRegistry | Records assignments, deadlines, submitted work and job outcomes. | [0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6](https://etherscan.io/address/0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6#code) |
| ValidationModule | Coordinates validator selection and commit/reveal review rounds. | [0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3](https://etherscan.io/address/0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3#code) |
| ReputationEngine | Records the reputation effects of work and review outcomes. | [0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5](https://etherscan.io/address/0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5#code) |
| ArbitratorCommittee | Coordinates committee decisions for escalated disputes. | [0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC](https://etherscan.io/address/0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC#code) |
| DisputeModule | Tracks challenges to job outcomes and their resolution. | [0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b](https://etherscan.io/address/0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b#code) |
| CertificateNFT | Issues transferable certificates for completed work under its rules. | [0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B](https://etherscan.io/address/0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B#code) |
| TaxPolicy | Records participant tax responsibilities and acknowledgement rules. | [0x680dD5f7107952F6b26b1dE620b8AC6BC241627C](https://etherscan.io/address/0x680dD5f7107952F6b26b1dE620b8AC6BC241627C#code) |
| FeePool | Collects and distributes protocol fees under its configuration. | [0x81686E65649B95F12CC50d5E3846343Ed0Cfae93](https://etherscan.io/address/0x81686E65649B95F12CC50d5E3846343Ed0Cfae93#code) |
| IdentityRegistry | Checks participant identity and the names or aliases admitted by governance. | [0x217B7709FfeD0e4C7A9415be64e323c56E0F8773](https://etherscan.io/address/0x217B7709FfeD0e4C7A9415be64e323c56E0F8773#code) |
| PlatformRegistry | Registers participating platforms and their protocol standing. | [0x543693a69C3ddbcE8DB590235989E502cBb9FEdb](https://etherscan.io/address/0x543693a69C3ddbcE8DB590235989E502cBb9FEdb#code) |
| JobRouter | Routes work through the configured platform relationships. | [0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7](https://etherscan.io/address/0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7#code) |
| PlatformIncentives | Coordinates configured platform participation incentives. | [0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF](https://etherscan.io/address/0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF#code) |
| SystemPause | Provides coordinated pause controls for managed protocol components. | [0x887782AE59A56D1E9923947A6784A4453193e303](https://etherscan.io/address/0x887782AE59A56D1E9923947A6784A4453193e303#code) |

### Jobs: fixed implementations

| Contract | Plain-language role | Ethereum mainnet address |
| --- | --- | --- |
| JobRegistryConfiguration | Fixed implementation of job configuration and administrative logic. | [0x54deeE2A22b3D06965522530De78081d92Df43a9](https://etherscan.io/address/0x54deeE2A22b3D06965522530De78081d92Df43a9#code) |
| JobRegistryLifecycle | Fixed implementation of job creation, application and submission logic. | [0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4](https://etherscan.io/address/0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4#code) |
| JobRegistrySettlement | Fixed implementation of job finalization and settlement logic. | [0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0](https://etherscan.io/address/0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0#code) |
| StakeManagerConfiguration | Fixed implementation of stake and economic parameter configuration. | [0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b](https://etherscan.io/address/0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b#code) |
| StakeManagerStaking | Fixed implementation of participant stake operations. | [0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0](https://etherscan.io/address/0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0#code) |
| StakeManagerEscrow | Fixed implementation of job funding, escrow and payout operations. | [0xc10978057A9F23976A29f27c78E795ED415b3E8E](https://etherscan.io/address/0xc10978057A9F23976A29f27c78E795ED415b3E8E#code) |
| StakeManagerSlashing | Fixed implementation of penalties and related stake accounting. | [0x11C066651558f0a4211ab5696A1e48b3553ef318](https://etherscan.io/address/0x11C066651558f0a4211ab5696A1e48b3553ef318#code) |
| ValidationModuleConfiguration | Fixed implementation of review parameters and administrative logic. | [0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561](https://etherscan.io/address/0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561#code) |
| ValidationModuleVoting | Fixed implementation of commit/reveal voting and review completion. | [0x9c88Ee891144A0841012685A1D118C95Ec667c69](https://etherscan.io/address/0x9c88Ee891144A0841012685A1D118C95Ec667c69#code) |
| ValidationModuleSelection | Fixed implementation of validator selection logic. | [0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF](https://etherscan.io/address/0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF#code) |

## What the evidence establishes

### Alpha: recorded 11 October 2026

The [pinned manifest](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/deployments/ethereum-mainnet/2026-10-11/manifest.json) and [dated deployment guide](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/755f678954be8e334e69e4d37f56f3fe10da2d84/docs/agent/MAINNET_DEPLOYMENT.md) identify the five deployed instances. The record does not establish participant commissioning or readiness for public funding. The deployed contracts use the archived Solidity 0.8.24 source bundle; current source includes later settlement hardening that is not part of those instances. See the [current Alpha readiness guidance](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/main/docs/agent/MAINNET_DEPLOYMENT.md) before considering a live workflow.

### Jobs: recorded 18 October 2026, paused

The [pinned new deployment record](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-snapshot.json) identifies all **25** contracts, including TaxPolicy. All 25 exact runtime/source comparisons and 46 explicitly named state checks passed. All eight managed modules were paused at provider-finalized block **26,221,285**, timestamp **18:37:11 UTC**, canonicality rechecked at the **18:55:20 UTC** closeout. Explorer observations are separately timed, not block-pinned.

The exact deployed source is [`818b3a246871e4cd4dde86558dbb91ef82b15eef`](https://github.com/MontrealAI/AGIJobsv0/tree/818b3a246871e4cd4dde86558dbb91ef82b15eef), on draft PR #3986. Current main and the source release retain different deployment tooling. The [dated guide](production/mainnet-2026-10-18/README.md) explains Ledger-address governance, distinct treasury roles, the configured 10% per-job collateral policy, original evidence hashes and bounded conclusions.

The [original 12 October directory](https://github.com/MontrealAI/AGIJobsv0/blob/af71b175fb4930cfe6b4f5bfc29987fa863bda05/docs/ECOSYSTEM.md#the-deployed-contract-directory) and its [exact JSON archive](../website/data/ecosystem-2026-10-12.json) preserve all earlier addresses and provenance. The [old deployment record](production/mainnet-deployment-2026-10-12.md) remains unchanged. No old obligations, funds or approvals are migrated by this publication.

This is an informational directory, not an active wallet profile. Paused does not mean permanently locked. Production approval and activation readiness remain false; no funding, unpause or live transaction route is enabled. See [current readiness](production/readiness.md).

Source verification, correct deployment, operational commissioning and successful real work are distinct questions. The directory answers which published instances belong to the two suites and where to inspect their source evidence. It makes no performance, revenue or token-return promise.

## Start with a task you can explain and check

[Open the guided welcome page](https://montrealai.github.io/AGIJobsv0/start/), define what a useful result looks like, and choose its evidence requirements. For a live service, follow the deployed release's operator guidance and complete the necessary admission, configuration and independent review.
