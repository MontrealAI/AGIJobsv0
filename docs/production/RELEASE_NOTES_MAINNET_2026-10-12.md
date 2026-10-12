# AGI Jobs v2 — paused mainnet evidence source prerelease (2026-10-12)

**Source/documentation prerelease only — NOT a production release, deployment action, or approval to unpause.** The published source package remains `2.1.0-rc.4`; this `source-v2.1.0-rc.4-mainnet-evidence.1` tag is a supplemental dated evidence/documentation snapshot, not a new Solidity version or production `v*` tag.

## New in this snapshot

- Record the actual paused mainnet staging/finalization of AGIJobsv0 at the existing coordinator, anchored to the exact deployed source commit `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e` and finalization transaction `0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f`.
- Publish a clear 24-contract address inventory, plain-language governance topology and exact Etherscan links without publishing any private signing or RPC credentials.
- Report **23/24 Etherscan source verifications based on October 12 operator evidence**, after browser verification of StakeManager, Configuration, Staking and Slashing; report **StakeManagerEscrow as NOT yet verified**. All five StakeManager-family contracts have separate independent exact-source verification evidence; independent success is not Etherscan success.
- Document the 267-source Escrow compiler replay and why browser verification remains blocked, without altering Solidity, optimizer settings or deployed bytecode.
- Carry forward the accessible bilingual first-example onboarding merged in PR #3923 (not part of the original deployed contract commit).
- Preserve the production readiness blockers: Ledger acceptance for IdentityRegistry, coordinator handoff from the temporary deployer, FeePool review, release signing, independent review and real worker/provider commissioning.

## Evidence and limits

- [Dated deployment and verification record](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.4-mainnet-evidence.1/docs/production/ethereum-mainnet-2026-10-12.md)
- [Public machine-readable register](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.4-mainnet-evidence.1/docs/production/ethereum-mainnet-2026-10-12.json)
- [Current production readiness](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.4-mainnet-evidence.1/docs/production/readiness.md)
- The 24-address snapshot is from operator-provided transaction receipts, local RPC/compile checks and Etherscan screenshots. The tagged code is **not** claimed to be the deployed source: the deployment was pinned to `b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e`.
- The GitHub Actions gate requires successful required CI checks at the exact release snapshot commit; publication records that commit. This prerelease **does not provide a maintainer-signed production tag or independently commissioned production artifacts**.

No Ethereum transaction, deployment, mainnet governance action or unpause is performed by the release workflow. `productionApproved` remains false.
