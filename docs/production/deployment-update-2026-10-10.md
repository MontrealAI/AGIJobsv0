# Deployment and operator update — 2026-10-10

This record accompanies **source-v2.1.0-rc.2**, a source preview. It does not authorize a production deployment or assert that the platform has been independently audited or commissioned at global scale.

## What changed

- The maintained Hardhat deployment starts all eight SystemPause-managed modules paused and transfers their control to governance in the final wiring transaction. Existing contract entry points retain their earlier behavior; use the documented staged CLI for the paused path.
- Public-network deployment requires an explicit reviewed configuration. Before sending transactions it checks chain/token/dependency identity, compiler settings, current Solidity source dependencies and artifact provenance.
- A coordinator records the resolved configuration digest. Recovery rejects a changed plan, checks creation-code hashes, retains submitted transaction hashes, and writes private checkpoint reports with an append-only recovery journal. Keep old evidence and use a new output filename when resuming.
- Reviewed tax metadata is installed before ownership handoff. The final report separates pending two-step acceptance, pause state, explorer verification and remaining commissioning work.
- The launch-limits helper prepares read-only governance calls, supports SystemPause ownership, preserves omitted job reward/stake values, validates all requested calls before sending, and handles already or partly paused deployments.
- Network compilation now generates the target network's constants before compiling. The release workflow uses the same helper. Maintained demo implementation bytecode is refreshed to match the compiler output.
- The README, start guide, Hardhat guide, nontechnical coordinator guide, deployment handbook and release checklist point to the maintained path. Older Truffle instructions are explicitly historical. Original diagrams remain available.

Start with the [nontechnical coordinator guide](nontechnical-mainnet-deployment.md), then give the [Hardhat operator guide](../deployment-v2-agialpha.md) to the deployment operator. The [read-only deployment plan](../deployment-v2-agialpha.md#3-prepare-a-reviewed-public-network-configuration) is an inspection tool; a passing plan is not release authorization.

## Validation and evidence boundaries

The relevant regression checks cover paused handoff and authorization, legacy deployment compatibility, changed-plan rejection, finalized recovery without new deployment transactions, reviewed tax metadata, non-overwriting evidence files, governance call preparation and execution, wrong-chain rejection, omitted-value preservation, mixed pause recovery, stale-source rejection, ABI/storage compatibility and production bytecode limits.

All 66 non-mock deployable v2 artifacts fit EIP-170 and EIP-3860 with Solidity 0.8.25, viaIR, 200 optimizer runs and Cancun. The updated Deployer uses 12,435 runtime bytes and 12,558 creation bytes. Component and finalization tests also exercise transaction gas limits; bytecode size alone is not a deployment guarantee.

The rebuilt website passed all 69 page tests and 85 browser checks with all 267 original diagrams preserved.

Use the exact PR head's hosted checks and retained workflow artifacts as the final release evidence. Local-chain receipts and the reproducible production rehearsal use mock tokens, local identities, fault-injection providers and disposable signing keys. They cannot establish maintainer identity, independent acceptance or live-service commissioning.

## Gates that remain open

The production dependency audit completed at 2026-10-10 21:38 UTC and covered all 22 tracked npm/pnpm lockfiles. Twenty-one passed the critical/high policy; the root lockfile reported seven high affected-package records and no critical findings. The two direct advisory families include [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). At review time those advisories did not identify patched versions. The audited root lockfile SHA-256 was `22e1a1d8637d16c30d32ad745536a5762ef874c23d5f19c06f1c299e6ee2c5e1`. Do not force untested transitive overrides or disable the audit gate.

The configured maintainer signing material still contains invalid example OpenSSH data. Real maintainer-authorized keys and independently verified release evidence are required for production publication. Branch protection was not enabled when inspected; the workflow guard and a green source PR do not establish an enforced review policy.

Independent security review, isolated worker and provider commissioning, token/ENS/tax configuration, governance acceptance, monitored settlement and recovery drills remain necessary. Legacy Web3.Storage routes still require migration from the retired API. See [current readiness](readiness.md) for these separate boundaries.

A production `vX.Y.Z` release must pass the [release checklist](../release-checklist.md). This source preview leaves those gates intact and does not publish production qualification artifacts.
