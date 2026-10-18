# source-v2.1.0-rc.14 — verified paused mainnet deployment and preserved history

Production approval remains **false**. This source and public-evidence prerelease records the separate 18 October 2026 Ethereum deployment; all eight managed modules remain paused. It does not enable funding, unpause, migration, a wallet transaction route or operational activation.

## New deployment evidence

- **25/25** exact deployed runtime and Etherscan source-content/compiler/settings/constructor comparisons; no Similar Match, unverified or incomplete result.
- **46/46** named state checks passed at provider-reported finalized block **26,221,285**, hash `0x4bd7698479db125e9a7e4f031571fd2844224f822a630ba22b40aea48fb592e6`, timestamp **2026-10-18 18:37:11 UTC**. Canonicality and finalized status were rechecked; closeout completed **18:55:20.035 UTC**.
- Eight managed modules were paused under SystemPause. The creator owns none of these 25 contracts; IdentityRegistry and TaxPolicy pending owners are zero. This bounded observation does not prove exhaustive removal of historical or indirect authority.
- Governance is recorded at `0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99`; StakeManager treasury and FeePool governance at `0xa9eD0539c2fbc5C6BC15a2E168bd9BCd07c01201`; FeePool treasury at the governance address. Owner-operated Ledger custody is contextual information, not a property proven by blockchain getters.
- The completed configuration records **1000 bps (10%) per-job collateral**, separate from the **1000 AGIALPHA** eligibility stake, plus fee 5%, burn 1% and one-day commit/reveal windows. Those values are configuration-record evidence; the later observation freshly rechecked only the explicit 46 getter list.

The [dated deployment guide](https://github.com/MontrealAI/AGIJobsv0/blob/284351148d96c5390a655aec1f9db806284f2400/docs/production/mainnet-2026-10-18/README.md), public snapshot and 39 successful historical creator receipts retain full addresses, source/runtime hashes, constructor encodings, governance observations and precise limits. Etherscan observations are separately timed and are not block-pinned chain state. Five StakeManager-family verifications used proven 37-source closures; no deployed code changed.

## Distinct source identities

The exact deployed source is **`818b3a246871e4cd4dde86558dbb91ef82b15eef`**, tree **`b1c3bb0f4b8d64e0d23376d6b6ef3722c4c67b0d`**, on draft PR #3986. It uses Solidity `0.8.37+commit.f401782d`, Cancun, via-IR, 200 optimizer runs and IPFS metadata. The original Standard JSON SHA-256 is `a962576832d4540c4cd682f9251b6eed2a333c87a1ce5fa61ed5716e7091b891`.

This publication starts from main `af71b175fb4930cfe6b4f5bfc29987fa863bda05` and adds records, site copy, regression tests and release metadata. Its contracts and compiler/implementation configuration are byte-identical to the deployed source; deployment/qualification tooling differs. That limited comparison is not whole-tree equivalence, full compiler-input equality or a claim that this release reproduces the deployed artifacts. PR #3986 is not merged by this release, and its signing tools are not silently substituted into main.

The release's own source archive and compiler producer are separately bound to its exact merged commit by `provenance.json`, `compiler-provenance.json` and checksums. The frozen compiler-source baseline `3c17153942251116ee51163055eb1a25d652454b`, historical evidence baseline and all source-preservation predicates remain unchanged. No compiler-remediation or contract changes are included.

## Website and history

The homepage links directly to the new JobRegistry and paused-governance record. The ecosystem directory shows all 25 new Jobs addresses, including TaxPolicy, beside the retained five-instance Alpha record. The old 24-contract Jobs directory is preserved as an exact JSON archive and immutable linked page; the original deployment evidence and diagrams remain unchanged. This informational directory is not an active client or wallet profile.

Published rc.12, all earlier tags/assets and historical notes remain unchanged. The separate open rc.13 preparation PR #3985 is left intact; rc.14 uses a fresh, unoccupied release identity rather than replacing or republishing rc.12 or claiming rc.13 was published. Existing mainnet deployments, their funds, allowances and obligations are not migrated or extinguished by this publication. Alpha repository work remains separate.

## Qualification and assets

Publication requires successful independent targeted review and every checked-in required context, configured release workflow and observed main-push workflow on the exact merged source. Prior PR checks and deployment readback do not substitute for this qualification. The publisher retains the exact compiler workflow archive, verifies its source binding, downloads every release asset and verifies byte counts and SHA-256 inventory before publication. Interrupted publication may resume only for the same snapshot; no existing tag or published asset is replaced.

The **15 assets** comprise a full source ZIP, source provenance, compiler archive and provenance, compiler policy/guide, historical 12 October deployment/configuration/address records and guide, the new 18 October public guide/snapshot/39-receipt record, these notes and `SHA256SUMS.txt`. The 14 payloads are checksummed. Original private deployment/readback evidence hashes are identified inside the public projections without exposing local paths, leases or credentials.

## Remaining boundaries

Paused means governance can later act through the supported rules; it does not mean permanently locked. No activation is performed or implied. Complete authority/security review, provider and worker commissioning, independent acceptance, monitoring and recovery remain separate requirements. External audit and Sepolia rehearsal were **not performed (owner-accepted omissions)**; local tests, hosted CI and AI-assisted review are not an external security audit. Source verification is not a claim of flawless code, complete operational readiness or successful paid work.
