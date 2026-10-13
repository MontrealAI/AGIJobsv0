# source-v2.1.0-rc.7 — hardened runtime images and preserved deployment evidence

This source prerelease removes unused package-manager tooling from four primary Node.js runtime images and strengthens their vulnerability gates. It inherits the Solidity 0.8.37 compiler remediation and verification evidence introduced in [source-v2.1.0-rc.6](https://github.com/MontrealAI/AGIJobsv0/releases/tag/source-v2.1.0-rc.6). Existing deployed Ethereum contracts retain their original bytecode and explorer compiler-version notices.

## Runtime changes

- Remove global npm, npx and the installer cache from the final `node-runner`, `validator-runner`, `gateway` and `webapp` images after dependency installation. Build stages retain the tooling they need.
- Start the webapp with `node node_modules/next/dist/bin/next start`, matching its existing `next start` package script, production environment and port. The other three services already start directly with Node.js.
- Require both operating-system and application-library scans to reject HIGH or CRITICAL findings for every primary image on native amd64 and arm64 runners. Runtime boot and service smoke checks remain required before candidate publication.
- Remove expired vulnerability suppressions instead of carrying them into the new release.

The earlier webapp scan reported eleven HIGH findings in the base image's global npm dependency tree. Those packages were present in the runtime image; the findings were not attributed to the portal's production dependency lockfile. This change removes the unnecessary package tree rather than suppressing its findings. It does not claim that every reported vulnerability was reachable through the application's HTTP interface or that future scans cannot discover new issues. See [container operations](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.7/docs/container-operations.md) for image scope and reproduction commands.

## Compiler and deployment evidence

New contract builds retain Solidity **0.8.37**, viaIR, 200 optimizer runs and Cancun. The reviewed compiler source checkpoint, original deployed source baseline, dated address inventory, deployment/configuration evidence and verification recovery inputs remain unchanged. The compiler admission policy continues to reject project-source warnings, unexpected diagnostics, stale inputs and oversized deployment artifacts.

The pinned OpenZeppelin sources still emit thirteen future-keyword deprecation notices within the reviewed source-hash and diagnostic allowlist. Hardhat's limited Solidity 0.8.37 stack-trace support notice also remains visible. These known limitations are documented in the [compiler operator guide](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.7/docs/production/compiler-warnings-2026-10-13.md); they are not claims of warning-free third-party tooling or flawless operation.

The original deployed bytecode remains associated with `source-v2.1.0-rc.4`, and the dated evidence publication remains `source-v2.1.0-rc.5`. The rc.6 release notes and existing release history are preserved.

## Qualification and provenance

The source publisher requires every checked-in required context, named release workflow and observed additional main-push workflow to succeed on the exact merged main commit. It preserves the reviewed compiler tree and historical deployment evidence. Earlier PR results cannot substitute for that merged commit.

The twelve release assets contain eleven checksummed payloads: the source ZIP, compiler policy, compiler operator guide, recorded mainnet address book, dated deployment and configuration evidence, deployment guide, these release notes, the exact compiler archive, its producer record and source provenance. `SHA256SUMS.txt` covers every payload. The publisher downloads the complete asset inventory and verifies its checksums, source identity and compiler producer before publication.

`compiler-evidence.zip` retains the compiler report, complete Standard JSON inputs, build information, per-contract artifacts and verification index. `compiler-provenance.json` binds that archive to the successful contracts workflow on the exact release commit, its run attempt and GitHub artifact digest. The release contains no new deployed addresses or constructor values. Interrupted publication can resume only for the same source snapshot; existing published assets are read back without replacement, and tags are never moved or deleted.

## Existing deployments and remaining gates

This is an **unsigned source prerelease**. It sends no blockchain transaction or explorer submission, performs no migration, and does not unpause contracts. Updating source or container packaging cannot replace immutable deployed implementations or remove old-address compiler advisories. Any replacement requires its own deployment, verification, reconciliation and separately authorized cutover.

Production signing, independent security review, effective protected-review enforcement and provider, worker, reviewer, settlement, monitoring and recovery commissioning remain separate requirements. Historical operator evidence records paused managed modules and an empty validator pool; fresh chain and configuration checks remain necessary before opening service. The signed `v*` production pipeline and its gates are unchanged. See [production readiness](https://github.com/MontrealAI/AGIJobsv0/blob/source-v2.1.0-rc.7/docs/production/readiness.md).

## En français

Cette préversion retire npm, npx et leur cache des quatre images Node.js principales après l'installation des dépendances. Le portail démarre directement avec Node.js et Next.js. Les analyses des systèmes et des bibliothèques doivent réussir sans vulnérabilité HIGH ou CRITICAL sur amd64 et arm64; les anciennes exclusions expirées sont supprimées. La correction du compilateur Solidity 0.8.37, les preuves originales et les limites documentées de rc.6 sont conservées. Aucune transaction, migration, soumission à l'explorateur ou activation n'est effectuée; la signature de production, la revue indépendante et la mise en service restent requises.
