# source-v2.1.0-rc.8 — bounded Alpha interoperability and preserved deployment evidence

This source prerelease adds an explicit AGI-Alpha-Agent-v0 integration for the modular AGIJobsv0 JobRegistry v2. It preserves the existing planner bridge, contract implementations, deployed-address evidence and prior releases. It inherits the Solidity 0.8.37 compiler remediation and hardened runtime images from rc.6 and rc.7.

## Bounded work and verifiable receipts

- Versioned work specifications commit SHA-256 of exact UTF-8 bytes before job creation. A separate assignment binding identifies the chain, token, registry, job and assigned worker without a circular job-ID commitment.
- The integration documents the JobRegistry ABI, lifecycle and deployment-profile requirements. Alpha's existing MARK / AscensionJobMarket route remains a separate protocol; sharing a token name does not establish compatibility with another market or executor.
- The read-only receipt verifier checks exact event fields, emitting registry, pinned runtime identity, successful canonical receipts, confirmation depth and nested log provenance. A finalization event proof does not establish profile approval, economic correctness or production admission.
- Artifact commitments use a shared 8 MiB byte limit with Alpha. Byte-exact fixtures are excluded from formatting. Artifact hashing alone does not verify an artifact signature or authorize a payout.
- Local fixture scripts refuse non-loopback RPC endpoints and chain IDs other than 31337. The fixtures execute assignment, bounded Alpha work, explicit local operator review, signed artifact export, submission and finalization against the actual modular registry, with clearly identified token, identity and validation mocks.

The retained small fixture and a 2,078,954-byte signed-artifact regression each completed the disposable-chain lifecycle and observed 100 mock token base units of payout. The larger regression crosses the former 2 MB verifier limit; separate tests cover the exact 8 MiB boundary. These are reproducible local integration proofs, not independent security review, production-market acceptance or live settlement evidence. Private disposable identities are not release assets.

See the [integration guide](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.8/integrations/alpha-agent/README.md) for commands, supported combinations, trust boundaries and limitations. Contract tests also reset fixed-address token state between suites so passing results do not depend on prior fixtures.

## Qualification and immutable release history

Publication requires all checked-in required contexts, named release workflows and observed main-push workflows to succeed on the exact merged source commit. PR results cannot substitute for that commit. The reviewed compiler checkpoint, Solidity 0.8.37 / Cancun / viaIR / 200 optimizer-run policy and historical deployment-evidence guards remain unchanged.

The twelve assets include the checksummed source archive, compiler producer archive and provenance, compiler policy and guide, original deployment and configuration evidence, recorded address book, deployment guide and these notes. The publisher verifies downloaded assets and exact source identity before publication. Interrupted publication can resume only for the same source snapshot; existing published assets are not replaced and tags are never moved or deleted. The rc.7 release remains immutable.

## Production boundaries

This is an **unsigned source prerelease**. It performs no blockchain transaction, migration, explorer submission or production activation. Historical deployments retain their original source and bytecode. Recorded mainnet inventory is not an approved current-source profile; production admission remains closed pending fresh chain reconciliation and commissioning.

Independent security review, effective protected review, approved pinned deployment profiles, production signing, provider and worker commissioning, validator and settlement readiness, monitoring and recovery remain separate requirements. Fleet execution and other market adapters must satisfy their own capability and authorization checks. No automatic token conversion or universal cross-market routing is claimed. See [production readiness](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.8/docs/production/readiness.md).
