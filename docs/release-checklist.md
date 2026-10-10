# Release checklist

Use the [current readiness report](production/readiness.md) before choosing a release type. A **source prerelease** publishes reviewable source with explicit limitations. A **production release** requires every production gate below. Neither a GitHub release nor a Pages deployment authorizes on-chain deployment.

## 1. Freeze a reviewable candidate

- Update the root package/lockfile version and add its exact `## vX.Y.Z` heading to `CHANGELOG.md`.
- Describe behavior changes, compatibility, contract/deployment impact and recovery in the PR.
- Run the pinned Node 22.23.3 / npm 10.8.2 toolchain with `npm ci` and `npm run ci:preflight`.
- Review generated constants and bundles. Preserve demos, flowcharts and existing protocol behavior unless a separately reviewed migration changes them.

## 2. Verify contracts, tooling and documentation

```bash
npm run compile
npm run release:check-size
npm test
node --test test/scripts/deployment-candidate.test.cjs test/scripts/release-inventory.test.cjs test/scripts/release-provenance.test.cjs test/scripts/release-ci.test.cjs test/scripts/dependency-audit.test.cjs
npm run format:check
npm run lint:ci
npm run docs:verify
npm run site:build
npm run site:test
npm run site:qa
```

For contract changes, retain the required hosted Slither, Foundry, coverage, gas and invariant results as well. Use the exact target network compilation command when preparing a deployment: `npm run compile:mainnet` or `npm run compile:sepolia`. Never qualify fast/coverage artifacts as production bytecode. Constructor arguments and transaction gas require separate deployment evidence in addition to runtime/initcode limits.

## 3. Measure production blockers without hiding them

```bash
npm run release:audit-dependencies
npm run ci:verify-signers
```

The dependency gate audits every tracked npm/pnpm production lockfile and retains registry responses. High/critical findings or unavailable evidence block production release. Do not broaden an allowlist or force incompatible versions to change the report's color. Signing trust requires real authorized maintainer public keys; illustrative keys are not usable trust identities.

Independent security review, effective protected-review rules, provider/worker enforcement, real acceptance and target-network commissioning are separate evidence requirements. Simulations and self-signed fixtures do not satisfy them.

## 4. Merge the exact reviewed source

Wait for all required PR checks and resolve review findings. Merge without overriding required checks. Compare the merged source tree with the reviewed tree. Verify the post-merge website deployment's source revision and inspect the changed public experience.

For a production tag, wait for the required workflows on that exact `main` commit. The authoritative list is `scripts/release/check-release-ci.js`. If a path-filtered workflow has no result, run the documented workflow on that commit; do not use a result from another revision.

## 5. Publish the correct kind of release

### Source prerelease

Use an explicit `source-vX.Y.Z` tag at the reviewed merged commit and mark the GitHub release **Pre-release**. State what passed, the exact commit/tree, every unresolved production blocker and whether any on-chain deployment occurred. Do not label source archives as signed production artifacts. Verify the published tag target, non-draft state and prerelease label after publication.

### Production release

Complete all production gates first. Use the [signing guide](release-signing.md), [manifest guide](release-manifest.md), [explorer verification](release-explorer-verification.md) and [provenance procedure](release-provenance.md). Create and verify the authorized signed `vX.Y.Z` tag on the exact qualified commit. Run the release workflow on that matching tag.

The workflow checks tag trust and exact-commit CI, audits dependencies, compiles the selected network, checks size, validates real addresses in the manifest, verifies deployed source and signs artifacts/images. Inspect its staged draft and evidence before publication. A failed gate remains a failed gate.

## 6. Commission separately

Follow the [staged deployment guide](deployment-v2-agialpha.md). Retain constructor records, implementations, actual economic values, governance acceptances, explorer results and eight paused managed modules. Apply reviewed limits through governance, rehearse recovery and validate real worker/reviewer/settlement behavior before opening the service. Preserve old deployment evidence; a source release does not migrate existing chain state.
