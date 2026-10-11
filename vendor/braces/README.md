# Maintained Braces depth patch

This repository maintains a narrow downstream patch of **braces 3.0.3**, identified as **3.0.4-agi.1**. This is not a release by the upstream Braces maintainers. The package name stays `braces`; the local version distinguishes reviewed modified bytes. The upstream MIT license and attribution are retained.

## Why this is vendored

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports call-stack exhaustion from deeply nested input. On 2026-10-11, no patched upstream release was published. The original implementation reproduces the failure on a 9,001-character nested pattern in the regression suite.

`patched/lib/depth.js` fixes the maximum AST depth at 128. The parser reserves a leaf level and rejects a 128th nested structural block; 127 nested blocks remain supported. Compile, expand and stringify also check recursion depth for caller-supplied ASTs, and expand bounds parent traversals. Excessive structural nesting throws `SyntaxError` with code `BRACES_MAX_DEPTH` before stack exhaustion. Options cannot raise or disable this bound. Quoted, escaped and square-bracket content retains its literal behavior.

This deliberately rejects exceptionally deep patterns accepted by the old parser. It does not make arbitrary attacker-supplied glob patterns safe: expansion size, CPU budgets and the downstream regular-expression consumer remain separate concerns. Existing length/range controls remain in place. No contract, economic or deployment setting is changed.

## Provenance and mandatory verification

- `upstream-3.0.3.tgz` is the original npm archive. Its registry SHA-512 integrity is fixed in `scripts/security/verify-braces-patch.cjs`.
- `upstream/` contains its exact extracted files; `patched/` contains the reviewable modified source.
- `braces-3.0.4-agi.1.tgz` is the installable archive, built with npm 10.8.2 using `npm pack ./vendor/braces/patched --ignore-scripts --pack-destination ./vendor/braces`.
- `provenance.json` records per-file SHA-256 hashes, archive integrities and upstream source commit `74b2db2938fad48a2ea54a9c8bf27a37a62c350d` (tag 3.0.3).
- `upstream-tests/` retains six unmodified upstream compile, parse, regression, multiple-pattern, minimatch and README suites. Bash-comparison suites are not included. The original MIT license covers these fixtures too.

The verifier checks both archives against their extracted source, all lockfile resolutions and (after installation) every installed source file. A root file dependency and npm `$braces` override keep transitive consumers on those exact archive bytes. Container dependency stages copy that archive before installation.

```sh
node scripts/security/verify-braces-patch.cjs --source
npm ci
node scripts/security/verify-braces-patch.cjs
npm run test:dependency-compat
```

Qualification requires the original crash reproduction, bounded rejection cases, AST/cycle tests, a seeded differential corpus against unmodified 3.0.3, the retained upstream suites, and the actual repository consumers. The full audit still runs at its existing high threshold without an advisory allowlist. An audit result alone cannot establish correctness of a local patch: the registry identifies published versions and does not certify these downstream bytes.

## Maintenance

Review the small source diff with `diff -ru vendor/braces/upstream vendor/braces/patched`. Any patch change requires a distinct downstream version, regenerated archive/provenance/lockfile, updated Docker archive references, and all qualification gates again. Do not edit an installed package or suppress a failing integrity test. Replace this vendored patch with a tested supported upstream fix when one becomes available. Reverting to 3.0.3 reintroduces the recorded finding and blocks release qualification; a rollback is not security remediation.
