# Functional source preservation for the unreleased terminal-claims draft

This is an exact-source CI check. It is not an independent approval authority, security audit, completed terminal security review, release reservation or deployment approval. A branch-editable workflow can change its own pin; repository review and exact source/policy/workflow review remain necessary.

## Exact scope

The sole transition is MontrealAI/AGIJobsv0 pull request #3976. Its original dependency and merge-base anchor is `f541031bf64bf9ba4b217b5cbc9d434b6acedbfe`. Its reviewed source checkpoint A is `f5964a29beb8fe29cf1a0b2e687a834cb79a34fe`, tree `8fd2c2d5725184458bc74059ac32ad13b6c5a269`, parent `ccaf1085f65f2f3a43f7b2e7beacb7e03fa95300`.

The record SHA256 is `3e0fff09c845ebf721ee62fff167ac4b036a15f10d3326c0bf2cfcbe5afb590a`. It binds 40 exact before/after protected changes, explicit additions/absence, complete 528/533 inventories, 315 generator inputs, source parents/tree and all seven original dependency version/resolved/integrity triples. It cannot authorize later protected or generator-input drift. The policy does not import another release's source-transition record or replace the original dependency baseline.

Other pull requests keep ordinary zero-protected-diff behavior against their own event merge base. The existing workflow is pull_request-only. Push/workflow_dispatch event payloads cannot activate this transition and are rejected by the PR-context reader. Local ordinary checks without a GitHub event remain available; they do not confer transition authority.

## Installation without circular identities

1. Freeze and review actual source A.
2. Review and create immutable policy commit P containing the checker, helper, exact record/index, generator and tests. The record pins A, not its own containing commit.
3. Verify actual P from GitHub. A later descendant Q pins real P in the workflow and extracts the four executing checker/helper/record/index files from that object. It must not invent a P identity or accept an environment-supplied replacement pin.
4. Run every existing compatibility surface and retain all results on exact Q. Candidate committed/index/working policy copies must equal the executing pinned bundle. Changed policy requires new review and a new pin.

Until P/Q are actually created and their native checks pass, the policy is an unqualified source proposal. No repository permissions or privileged runner are introduced.

## Source and generated modes

Source mode verifies event/base/head identities, anchored ancestry, exact protected and generator snapshots, filesystem/index consistency and original dependency tuples. A synthetic merge must be identified separately from the logical PR head; an explicit-head checkout accepts the event's declared synthetic metadata without mistaking it for the checked-out source.

Generated mode reproduces the constants generator and hardhat ENS normalization from immutable A; ordinary mode continues reproducing from its ordinary merge base. The recipe uses an ephemeral home and excludes application/TypeScript overrides. It compares every protected file plus `scripts/generated/protocol-defaults.ts`, which was outside the previous protected predicate. Only declared constants/defaults/ENS products may change transiently. Unexpected, staged, missing, ignored or additional source files fail. No generated deployment configuration is committed or treated as owner-approved settings.

The source walk excludes root .git and root node_modules, not arbitrary ignored or nested dependency directories. The current root npm graph has no workspaces; browser's nested installation occurs after its source check. Native runner layout must still pass the gate.

## Evidence limits

Local source/generated CLI fixtures and negative tests validate functional behavior. Their reproduction used shared existing node_modules and Node 24 while the repository declares Node 22.23.3. They do not prove independent installed-toolchain integrity or native runtime qualification. The hosted workflow must use the declared runtime, locked installation and actual exact P/Q source.

Canonical contract compiler evidence and contract tests are separate from this source-policy check. Mainnet state reconciliation, a pinned full-module fork rehearsal, owner configuration decisions, old obligations and per-address explorer verification remain separate commissioning gates. External independent audit and Sepolia are owner-accepted omissions, never passed checks.
