# AGI Alpha Agent + AGI Jobs: the shared ecosystem

**[Explore the public ecosystem guide](https://montrealai.github.io/AGIJobsv0/ecosystem/) · [Inspect all deployed contracts](https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts) · [Explore the Alpha view](https://montrealai.github.io/AGI-Alpha-Agent-v0/ecosystem/)**

AGI Alpha Agent helps explore candidate ideas and develop a plan. AGI Jobs gives a bounded task its work order, evidence, review and payment rules. Used together, they can turn a selected idea into accountable digital work. Their shared token is **$AGIALPHA on Ethereum mainnet**.

## The shared token

| Identity       | Recorded value                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Name / symbol  | AGI ALPHA / AGIALPHA                                                                                                |
| Network        | Ethereum mainnet, chain ID 1                                                                                        |
| Decimals       | 18                                                                                                                  |
| Token contract | [0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA](https://etherscan.io/token/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA) |

Both public deployment records identify this same address. Their contracts use it for configured funding, stakes, fees and settlement operations. Each suite retains its own market, interfaces and admission rules. The token is a shared dependency, separate from the 30 contract instances below. The public examples and planners can be explored without a wallet or token payment.

Sources: [Alpha deployment record](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/deployments/ethereum-mainnet/2026-10-18/manifest.json) · [Jobs deployment record](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-snapshot.json).

## Why the combination is useful

| Contribution             | AGI Alpha Agent                                                                                                   | AGI Jobs                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Decide what to pursue    | Explore ideas, compare approaches and develop a committed plan.                                                   | Turn the chosen scope into a specific assignment and acceptance criteria.                                                       |
| Coordinate participation | The deployed Ascension suite includes identity admission, plan ownership, staked risk review and a funded market. | Identity, stakes, job routing, validation and dispute mechanisms define participation in the Jobs protocol.                     |
| Make outcomes reviewable | Preserve the plan, its evidence commitments and lineage.                                                          | Collect a result and its evidence, coordinate review and apply the configured finalization rules.                               |
| Learn from useful work   | Retain useful methods for future authorized work.                                                                 | Use the review record and outcomes to inform later tasks; SUCCESSOR can preserve mission knowledge within its documented scope. |

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

Sources: [Alpha deployment guide](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/docs/agent/CURRENT_MAINNET_DEPLOYMENT.md) · [Jobs deployed source](https://github.com/MontrealAI/AGIJobsv0/tree/818b3a246871e4cd4dde86558dbb91ef82b15eef) · [Jobs computer-work integration](computer-work.md). These pages do not assert that aliases or a mainnet cross-market adapter are currently commissioned.

## The deployed contract directory

The source-pinned public records identify **5 current Alpha instances + 25 current Jobs instances (18 October) = 30** on Ethereum mainnet. Historical Alpha and Jobs instances remain in the linked archives; they are not the current directory entries. The Jobs count comprises **14 protocol components, 1 deployment coordinator and 10 fixed implementations**. These are components of two suites, not 30 separate protocols. Every full address links to its Etherscan source page.

The website publishes the same [static JSON directory](../website/data/ecosystem.json). It makes no live RPC calls and does not infer current ownership, pause state, security or funding readiness from the addresses.

### Alpha: ideas, admission, risk and funded work

| Contract            | Plain-language role                                                           | Ethereum mainnet address                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| AscensionAccess     | Checks ENS identity and participant admission.                                | [0x9eE41dF6d076Fa4F89b102b76DEf1c503a1e7C3A](https://etherscan.io/address/0x9eE41dF6d076Fa4F89b102b76DEf1c503a1e7C3A#code) |
| NovaSeed            | Records ownership of the token representing a committed plan and its lineage. | [0x31BD0736DcD55DA2f9a2BB586C8a98695F86f19E](https://etherscan.io/address/0x31BD0736DcD55DA2f9a2BB586C8a98695F86f19E#code) |
| AscensionRiskOracle | Coordinates staked risk review and reviewer availability.                     | [0x198FC6EBee21c6A0B34E4d055AFD6D811AA6dE58](https://etherscan.io/address/0x198FC6EBee21c6A0B34E4d055AFD6D811AA6dE58#code) |
| AscensionJobMarket  | Runs auctions, work review and settlement for the Alpha market.               | [0xc1d3d7fb064C23c46C4EB20d24ab6EA650FF0ceE](https://etherscan.io/address/0xc1d3d7fb064C23c46C4EB20d24ab6EA650FF0ceE#code) |
| AscensionMark       | Restricts funding to the committed work plan in its fixed Alpha market.       | [0x6D5323b2609E36fDc4dB3B2501B7BcF0E131033c](https://etherscan.io/address/0x6D5323b2609E36fDc4dB3B2501B7BcF0E131033c#code) |

### Jobs: protocol components and deployment coordinator

| Contract            | Plain-language role                                                            | Ethereum mainnet address                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Deployer            | Assembles the deployment and coordinates its initial configuration.            | [0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740](https://etherscan.io/address/0x6CC341f43b5aeB8C54Bf73EA75301CE3449A1740#code) |
| StakeManager        | Holds participant stakes and job funds under the protocol rules.               | [0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1](https://etherscan.io/address/0x0b7E8E6aeEc675950E493E495D54d947E3B7bee1#code) |
| JobRegistry         | Records assignments, deadlines, submitted work and job outcomes.               | [0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6](https://etherscan.io/address/0x8b230eB346369B2a3EFaaa615CbEb8e3b2f167e6#code) |
| ValidationModule    | Coordinates validator selection and commit/reveal review rounds.               | [0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3](https://etherscan.io/address/0x84eBBAb4755726782F20Dc2d23FB968CA5200bF3#code) |
| ReputationEngine    | Records the reputation effects of work and review outcomes.                    | [0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5](https://etherscan.io/address/0x7e2F3cb2555052AE712c1904d0Ae1b522B018ce5#code) |
| ArbitratorCommittee | Coordinates committee decisions for escalated disputes.                        | [0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC](https://etherscan.io/address/0x7E61d59476A929DCd4ba943a9aeB4c528D7536DC#code) |
| DisputeModule       | Tracks challenges to job outcomes and their resolution.                        | [0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b](https://etherscan.io/address/0x6be805CEbA58A8922eDa4ce627a89bb073c07A5b#code) |
| CertificateNFT      | Issues transferable certificates for completed work under its rules.           | [0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B](https://etherscan.io/address/0x2651Bf7c343143BF12CF6d34590E9ECA5A1AbE4B#code) |
| TaxPolicy           | Records participant acknowledgment of the immutable tax-responsibility policy. | [0x680dD5f7107952F6b26b1dE620b8AC6BC241627C](https://etherscan.io/address/0x680dD5f7107952F6b26b1dE620b8AC6BC241627C#code) |
| FeePool             | Collects and distributes protocol fees under its configuration.                | [0x81686E65649B95F12CC50d5E3846343Ed0Cfae93](https://etherscan.io/address/0x81686E65649B95F12CC50d5E3846343Ed0Cfae93#code) |
| IdentityRegistry    | Checks participant identity and the names or aliases admitted by governance.   | [0x217B7709FfeD0e4C7A9415be64e323c56E0F8773](https://etherscan.io/address/0x217B7709FfeD0e4C7A9415be64e323c56E0F8773#code) |
| PlatformRegistry    | Registers participating platforms and their protocol standing.                 | [0x543693a69C3ddbcE8DB590235989E502cBb9FEdb](https://etherscan.io/address/0x543693a69C3ddbcE8DB590235989E502cBb9FEdb#code) |
| JobRouter           | Routes work through the configured platform relationships.                     | [0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7](https://etherscan.io/address/0x4E3cb2036c3b67Ca48BBF868B937B87E9524e6b7#code) |
| PlatformIncentives  | Coordinates configured platform participation incentives.                      | [0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF](https://etherscan.io/address/0x50e1aeD5f0bcf440154B0A779a6f6701D5A57bcF#code) |
| SystemPause         | Provides coordinated pause controls for managed protocol components.           | [0x887782AE59A56D1E9923947A6784A4453193e303](https://etherscan.io/address/0x887782AE59A56D1E9923947A6784A4453193e303#code) |

### Jobs: fixed implementations

| Contract                      | Plain-language role                                                     | Ethereum mainnet address                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JobRegistryConfiguration      | Fixed implementation of job configuration and administrative logic.     | [0x54deeE2A22b3D06965522530De78081d92Df43a9](https://etherscan.io/address/0x54deeE2A22b3D06965522530De78081d92Df43a9#code) |
| JobRegistryLifecycle          | Fixed implementation of job creation, application and submission logic. | [0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4](https://etherscan.io/address/0x1db3f79F669fCbA0c3bf02DD32696f6d498703E4#code) |
| JobRegistrySettlement         | Fixed implementation of job finalization and settlement logic.          | [0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0](https://etherscan.io/address/0x6674abC659c29b8D9A89F2C1E5ca9A5238e03cd0#code) |
| StakeManagerConfiguration     | Fixed implementation of stake and economic parameter configuration.     | [0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b](https://etherscan.io/address/0x5108C2C2d5fc18C357c257488734C7F32b05Ee9b#code) |
| StakeManagerStaking           | Fixed implementation of participant stake operations.                   | [0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0](https://etherscan.io/address/0x1CD694F6ABbCCaB90bF7F8c87dEB22cD5B5D0Ff0#code) |
| StakeManagerEscrow            | Fixed implementation of job funding, escrow and payout operations.      | [0xc10978057A9F23976A29f27c78E795ED415b3E8E](https://etherscan.io/address/0xc10978057A9F23976A29f27c78E795ED415b3E8E#code) |
| StakeManagerSlashing          | Fixed implementation of penalties and related stake accounting.         | [0x11C066651558f0a4211ab5696A1e48b3553ef318](https://etherscan.io/address/0x11C066651558f0a4211ab5696A1e48b3553ef318#code) |
| ValidationModuleConfiguration | Fixed implementation of review parameters and administrative logic.     | [0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561](https://etherscan.io/address/0xC9985d012e88CCD809D588BE5e2Cc77BeeabC561#code) |
| ValidationModuleVoting        | Fixed implementation of commit/reveal voting and review completion.     | [0x9c88Ee891144A0841012685A1D118C95Ec667c69](https://etherscan.io/address/0x9c88Ee891144A0841012685A1D118C95Ec667c69#code) |
| ValidationModuleSelection     | Fixed implementation of validator selection logic.                      | [0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF](https://etherscan.io/address/0xDc7B5A7bc02C6Aa60b9E3BE527E74856097a7dcF#code) |

## What the evidence establishes

### Alpha: current suite recorded 18 October 2026

The [pinned manifest](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/deployments/ethereum-mainnet/2026-10-18/manifest.json) and [current deployment evidence guide](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/docs/agent/CURRENT_MAINNET_DEPLOYMENT.md) identify the fresh five-contract suite, deployed from source commit [`c0fc5217e364a39a4cd123d17a8317c06b80f820`](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/tree/c0fc5217e364a39a4cd123d17a8317c06b80f820) / tree `6c0ed7b1a5d40662bcd3e124a6d2aedd6447fcf2`. The public record contains five Etherscan **EXACT_MATCH** results and finalized receipts for the two governor-only one-time bindings.

At authority block **26,220,072** (`0x8a3357d17a61a8f37c99dc836ac1176c6ee44b6261a81c41893527046c88a088`), the three owner-bearing contracts name governor `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99` with zero pending owners. No creator deployment privilege was observed within this exact five-contract graph. This is a point-in-time trusted-provider observation; external token, proxy, ENS, controller and off-chain authority remain outside its scope.

**Activation and public funding remain unapproved. No global pause exists.** Independent security review, exact-candidate real-dependency fork evidence and operator, economic and participant commissioning remain separate gates. External authority closeout is recorded complete; the original manual binding intent/fee deviations remain documented and are not retroactively approved. The [11 October manifest](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7/deployments/ethereum-mainnet/2026-10-11/manifest.json) remains a historical archive and is not relabeled as this suite. See the [current Alpha readiness guidance](https://github.com/MontrealAI/AGI-Alpha-Agent-v0/blob/main/docs/agent/CURRENT_MAINNET_DEPLOYMENT.md) before considering a live workflow.

### Jobs: current suite recorded 18 October 2026

The [pinned deployment snapshot](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/deployment-snapshot.json) and [closeout guide](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/README.md) identify **25 instances**, deployed from commit [`818b3a246871e4cd4dde86558dbb91ef82b15eef`](https://github.com/MontrealAI/AGIJobsv0/tree/818b3a246871e4cd4dde86558dbb91ef82b15eef) / tree `b1c3bb0f4b8d64e0d23376d6b6ef3722c4c67b0d` using Solidity `0.8.37+commit.f401782d`. This source is on draft PR #3986; it is not the current main branch or a published source tag. Whole-tree equivalence is not assumed.

The record retains **25 runtime comparisons**, **25 exact explorer source-metadata comparisons** and **46 named state checks**. State was anchored to provider-reported finalized block **26,221,285**, hash `0x4bd7698479db125e9a7e4f031571fd2844224f822a630ba22b40aea48fb592e6`, at **2026-10-18 18:37:11 UTC**. All eight managed modules were paused and the creator owned none of the 25 contracts. Explorer source observations were separately timed and are not block-pinned. The static directory performs no fresh chain-state check.

**Production approval and activation remain false.** Named checks are bounded; they are not exhaustive historical/indirect authority or security qualification. Configured-at-deployment economics include **10% per-job collateral**, distinct from **1000 AGIALPHA** general minimum stake; the final readback freshly checked only its listed getters. For roles, policy and operational limits, use the [current deployment guide](production/CURRENT_MAINNET_DEPLOYMENT.md).

An [exact local copy of the public snapshot](../website/data/jobs-mainnet-2026-10-18.json) has SHA-256 `b4335f5763f73e8da664c3cd45ac7ca8fa6f0d3beb2780b209e50fd1e3def23f`. The [12 October record](https://github.com/MontrealAI/AGIJobsv0/blob/a1dea46d2f9dfa5680d11e24529f107d65cd4369/docs/deployments/ethereum-mainnet-2026-10-12.json) and its address map remain historical and unchanged. Publishing a source release does not migrate or extinguish old obligations, alter approvals or activate either stack.

Source verification, deployment, commissioning and successful real work remain separate questions. This directory identifies published instances and their evidence; it grants no authority, funding or performance claim.

## Start with a task you can explain and check

[Open the guided welcome page](https://montrealai.github.io/AGIJobsv0/start/), define what a useful result looks like, and choose its evidence requirements. For a live service, follow the deployed release's operator guidance and complete the necessary admission, configuration and independent review.
