# Jobs852 hosted CodeQL technical review

Source `852420e82ae3f5bbf0c397a4c1d550d210d4916f`, executed synthetic merge `afa1d740b68f34a8823f7c331cf8c12fc317dbb2`, tree `cb29f676e1e6d43f0d19ed72b34c248bca9a3af1`. Raw run `39694681348`, artifact `12390791531`.

This is a technical assessment. No findings were accepted into policy, no organizational approval was invented, and no release hold was cleared. Eight unused imports are true quality findings. Eleven security alerts do not establish the reported impact under the explicitly stated boundaries; the filesystem conclusions retain trusted-parent assumptions.

| Raw index | Rule | Location | Technical disposition |
|---:|---|---|---|
| 0 | js/biased-cryptographic-random | integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/research.mjs:192 | FALSE_POSITIVE_FOR_REPORTED_SECURITY_IMPACT |
| 1 | js/biased-cryptographic-random | integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/research.mjs:193 | FALSE_POSITIVE_FOR_REPORTED_SECURITY_IMPACT |
| 2 | js/user-controlled-bypass | agent-gateway/apiHelpers.ts:174 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 3 | js/user-controlled-bypass | agent-gateway/apiHelpers.ts:207 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 4 | js/user-controlled-bypass | agent-gateway/apiHelpers.ts:208 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 5 | js/user-controlled-bypass | agent-gateway/routes.ts:200 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 6 | js/user-controlled-bypass | agent-gateway/routes.ts:200 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 7 | js/user-controlled-bypass | apps/onebox-static/app.mjs:1482 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 8 | js/user-controlled-bypass | packages/successor-core/src/frontier-mission.mjs:431 | FALSE_POSITIVE_FOR_REPORTED_AUTHORIZATION_BYPASS |
| 9 | js/file-system-race | integrations/alpha-agent/four-repo-computer-lifecycle.cjs:532 | FALSE_POSITIVE_FOR_REPORTED_LEAF_OVERWRITE_RACE |
| 10 | js/file-system-race | integrations/alpha-agent/pinned-alpha-checkout.cjs:163 | FALSE_POSITIVE_FOR_REPORTED_UNREVIEWED_SOURCE_ADMISSION |
| 11 | js/unused-local-variable | scripts/release/publish-source-release-rc16.cjs:20 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 12 | js/unused-local-variable | scripts/release/source-native-gates-rc16.cjs:7 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 13 | js/unused-local-variable | scripts/release/source-native-gates-rc16.cjs:8 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 14 | js/unused-local-variable | scripts/release/source-native-gates-rc16.cjs:13 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 15 | js/unused-local-variable | scripts/release/source-native-gates-rc16.cjs:16 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 16 | js/unused-local-variable | scripts/release/source-scanner-gates-rc16.cjs:8 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 17 | js/unused-local-variable | scripts/release/source-scanner-gates-rc16.cjs:13 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |
| 18 | js/unused-local-variable | scripts/release/source-scanner-gates-rc16.cjs:17 | TRUE_NONSECURITY_MAINTAINABILITY_FINDING |

## Record 0: js/biased-cryptographic-random

The modulo bias at line192 is mathematically real, but its value is a public synthetic left-table revision label, not a security credential, key, access decision or protected evaluation secret.

Evidence:
- research.mjs:192: seed %3 is embedded in an r0/r1/r2 CSV revision cell; the full seed is also exposed in PUBLIC-LEFT/PUBLIC-RIGHT identifiers and public note text(188-194).
- research.mjs:213-217 explicitly permits a caller-supplied bounded confirmationSeed;246 chooses that value or a Uint32 crypto seed only for confirmationMission.
- research.mjs:245 explicitly says the local generator is public, not a protected evaluator;272-274 retains seed and mission with publicSynthetic:true/protected:false.

Limits and owner judgment:
- For uniform32-bit seeds, residue0 has1431655766 representatives and residues1/2 have1431655765; no uniformity claim is made for these labels.
- This disposition does not certify confirmation independence, scientific validity or cryptographic randomness in another future use. Treating this seed as secret/protected would require a new review.

Verification:
- Immutable852source hash matches authenticated packet; direct source/dataflow review and exact residue-count calculation.

## Record 1: js/biased-cryptographic-random

The modulo bias at line193 is mathematically real, but its value is a public synthetic right-table revision label, not a security credential, key, access decision or protected evaluation secret.

Evidence:
- research.mjs:193: seed %3 is embedded in an r0/r1/r2 CSV revision cell; the full seed is also exposed in PUBLIC-LEFT/PUBLIC-RIGHT identifiers and public note text(188-194).
- research.mjs:213-217 explicitly permits a caller-supplied bounded confirmationSeed;246 chooses that value or a Uint32 crypto seed only for confirmationMission.
- research.mjs:245 explicitly says the local generator is public, not a protected evaluator;272-274 retains seed and mission with publicSynthetic:true/protected:false.

Limits and owner judgment:
- For uniform32-bit seeds, residue0 has1431655766 representatives and residues1/2 have1431655765; no uniformity claim is made for these labels.
- This disposition does not certify confirmation independence, scientific validity or cryptographic randomness in another future use. Treating this seed as secret/protected would require a new review.

Verification:
- Immutable852source hash matches authenticated packet; direct source/dataflow review and exact residue-count calculation.

## Record 2: js/user-controlled-bypass

Skipping a null/nonobject contributor drops that entry; it does not grant a principal or retain a verified signature.

Evidence:
- apiHelpers.ts:169-176 requires an array and skips malformed entries;177-185 validates/normalizes each retained address.
- apiHelpers.ts:207-228 verifies any nonempty supplied signature against its supplied payload and requires recovered signer to equal the contributor address;235 appends only a contributor metadata record.
- routes.ts:1640-1654 authenticates the request and authorizes its managed wallet before parseContributors at1683.

Limits and owner judgment:
- Unsigned attribution is intentionally allowed and remains a claim. Contributor role/metadata strings are not authentication; consumers must not reinterpret them as authority.
- The signed payload is not shown here to be a job-scoped authorization token; this review refutes the reported gateway bypass only.

Verification:
- Exact-source offline malformed-entry, valid/wrong signer, altered payload, missing payload, malformed signature and unsigned-metadata probes passed using real EIP191 verification.

## Record 3: js/user-controlled-bypass

The optional-signature branch does not make an unsigned contributor authenticated. A signature field is emitted only after successful verification.

Evidence:
- apiHelpers.ts:205-207 tests whether an optional signature is a nonempty string;211-218 verifies its actual canonical payload, matches signer to normalized address, then stores signature and recomputed digest.
- apiHelpers.ts:226-233 rejects a supplied nonempty signature without payload; an unsigned payloadDigest is copied as self-asserted data, without signature.
- routes.ts:1640-1654 applies request authentication and managed-wallet authorization independently of contributor metadata.

Limits and owner judgment:
- Missing/empty/nonstring contributor signatures follow the unsigned metadata path; that is not a validated contributor identity. Downstream systems must preserve the distinction.
- No user/organizational approval or acceptance of unsigned attribution is established by this review.

Verification:
- Exact-source real-EIP191 contributor probes confirm invalid supplied proof refuses and unsigned attribution has no signature/principal.

## Record 4: js/user-controlled-bypass

The payload-presence test fails closed for an attempted signed contributor: missing payload throws rather than bypassing verification.

Evidence:
- apiHelpers.ts:207 enters signed-evidence handling only for a nonempty string signature;208-218 verifies the provided payload and matching recovered address.
- apiHelpers.ts:226-228 throws Contributor signature requires its signed payload when payload is absent.
- apiHelpers.ts:211-224 rejects a bad signature, altered payload or different signer.

Limits and owner judgment:
- This establishes proof-of-control over the supplied message only; it does not establish task acceptance, payment authority or an independent truth claim.

Verification:
- Exact-source signed-without-payload, wrong-address, altered-payload and malformed-signature probes all refused.

## Record 5: js/user-controlled-bypass

The user-controlled x-signature presence condition controls whether verification is attempted; it cannot authorize a request by itself.

Evidence:
- routes.ts:191-195 permits operator authority only after exact comparison against configured GATEWAY_API_KEY.
- routes.ts:198-208 reads both headers and calls real ethers.verifyMessage(AUTH_MESSAGE+nonce,signature);209-218 additionally requires recovered signer to equal claimed address and be a managed wallet before setting a wallet principal in a private WeakMap and calling next.
- routes.ts:220-231 catches invalid proof and returns401;165-174 expires/rotates the challenge;234-247 checks wallet-specific authority separately.

Limits and owner judgment:
- This scoped review does not certify TLS, secret distribution, ingress configuration or all gateway routes.
- The shared nonce can require concurrent clients to retry; that is documented behavior, not authority bypass.

Verification:
- Nine offline exact-function HTTP-auth boundary probes passed with real EIP191 signatures: missing/partial/malformed/unmanaged/mismatched/replay refused; only managed matching signer or configured operator key succeeded.

## Record 6: js/user-controlled-bypass

The user-controlled x-address presence condition controls whether verification is attempted; it cannot authorize a request by itself.

Evidence:
- routes.ts:191-195 permits operator authority only after exact comparison against configured GATEWAY_API_KEY.
- routes.ts:198-208 reads both headers and calls real ethers.verifyMessage(AUTH_MESSAGE+nonce,signature);209-218 additionally requires recovered signer to equal claimed address and be a managed wallet before setting a wallet principal in a private WeakMap and calling next.
- routes.ts:220-231 catches invalid proof and returns401;165-174 expires/rotates the challenge;234-247 checks wallet-specific authority separately.

Limits and owner judgment:
- This scoped review does not certify TLS, secret distribution, ingress configuration or all gateway routes.
- The shared nonce can require concurrent clients to retry; that is documented behavior, not authority bypass.

Verification:
- Nine offline exact-function HTTP-auth boundary probes passed with real EIP191 signatures: missing/partial/malformed/unmanaged/mismatched/replay refused; only managed matching signer or configured operator key succeeded.

## Record 7: js/user-controlled-bypass

The reported branch rejects a missing executor URL. It is endpoint-availability handling in a client, not a server authorization decision.

Evidence:
- app.mjs:449-468 returns null plan/exec/status when no sanitized base exists; the prefix is appended only after a base has been selected.
- app.mjs:1480-1487 throws when getExecUrl is empty;1488-1495 sends a normal POST using withAuth when an endpoint exists.
- app.mjs:383-445 constructs ordinary Authorization headers from the page-session token; no branch fabricates a credential or records an authenticated principal.
- app.mjs:488-509 explicitly accepts endpoint/prefix URL configuration;472-484 resolves configured endpoints.

Limits and owner judgment:
- Endpoint selection remains user configurable, and prefix text can alter paths within the configured base. A URL being present does not imply a trusted backend.
- Backend authentication, authorization, endpoint trust, mixed HTTP/HTTPS deployment and any transaction approval are outside this finding-specific client-guard assessment.

Verification:
- Exact-source extracted endpoint/header/executeICS probe:7prefix variants cannot create an endpoint without a base; tested variants retain configured origin; null endpoint causes0fetch calls; configured endpoint retains ordinary Bearer header with fetch stopped offline.

## Record 8: js/user-controlled-bypass

The kind field chooses between two serialization forms; both paths run full mission verification. It does not bypass validation or authenticate imported data.

Evidence:
- frontier-mission.mjs:417-427 bounds and parses JSON and canonicalizes inert values.
- frontier-mission.mjs:429-438 sends a direct FrontierMission to verifyFrontierMission; the envelope branch checks exact format/fields then calls the same verifier.
- frontier-mission.mjs:359-397 checks exact shape, schema, source bounds and reconstructs a mission through createFrontierMission; canonical equality with that deterministic replay is mandatory.
- frontier-mission.mjs:337-357 explicitly seals content equality rather than truth; sources retain NOT_RETRIEVED provenance. website/frontier-mission.js:512-531 bounds fragment inputs and verifies any workspace before replacement.

Limits and owner judgment:
- A valid content seal is not independent truth, owner approval, external execution or authorization. No external model/network/wallet operation is performed by this module.

Verification:
- 22frontier-mission tests passed; all27source/test files used were compared byte-for-byte with immutable852; three forged kind/envelope records independently refused.

## Record 9: js/file-system-race

The early existence check is not the overwrite safety mechanism: the actual write atomically creates a new leaf using exclusive mode.

Evidence:
- four-repo-computer-lifecycle.cjs:184-188 takes operator-selected absolute input/source/output paths and checks evidence output is new and differs from input.
- four-repo-computer-lifecycle.cjs:532-535 writes with flag wx and mode0600; a preexisting regular leaf or leaf symlink makes O_EXCL fail instead of clobbering a target.
- four-repo-computer-lifecycle.cjs:152-162 prohibits external RPC/forks and requires disposable Hardhat31337;519-528 retains productionApproved:false and explicit scope limits.

Limits and owner judgment:
- This does not prove immunity to parent-directory substitution or denial of service. Output ancestors must remain trusted/operator controlled. If an attacker can rename or replace those directories, an owner must assess that environment separately.
- The result is scoped to leaf overwrite/source evidence integrity, not a blanket filesystem-race certification.

Verification:
- Independent child review against exact852: injecting a regular leaf or symlink between existsSync and writeFileSync produced EEXIST and preserved target bytes.

## Record 10: js/file-system-race

The lstat-before-open check is redundant; validation of the opened descriptor and exact captured bytes prevents replacement from admitting unreviewed code.

Evidence:
- pinned-alpha-checkout.cjs:150-166 checks ancestors/leaf and opens with O_RDONLY|O_NOFOLLOW|O_NONBLOCK.
- pinned-alpha-checkout.cjs:21-54 validates the actual descriptor as a bounded stable regular file while reading;181-192 checks its computed immutable Git blob identity and executable mode.
- pinned-alpha-checkout.cjs:230-299 imports from private captured strings under a unique scheme; relative imports must resolve to captured sourceMap entries and external/missing edges are refused.

Limits and owner judgment:
- A concurrent actor can cause an abort. This does not make every path operation race free; acceptance is justified by matching pinned bytes, not by assuming pathname stability.
- Trust in the reviewed Git commit and installed gate code remains an external exact-source review boundary.

Verification:
- Independent child exact-helper probes injected leaf symlink, changed regular bytes, FIFO and ancestor-symlink changed bytes immediately after lstat; all refused through open/descriptor/hash checks.

## Record 11: js/unused-local-variable

scannerReviewPath is an unused local import binding in scripts/release/publish-source-release-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/publish-source-release-rc16.cjs:20 declares/imports scannerReviewPath; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 12: js/unused-local-variable

execFileSync is an unused local import binding in scripts/release/source-native-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-native-gates-rc16.cjs:7 declares/imports execFileSync; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 13: js/unused-local-variable

delay is an unused local import binding in scripts/release/source-native-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-native-gates-rc16.cjs:8 declares/imports delay; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 14: js/unused-local-variable

verifyPublicationReview is an unused local import binding in scripts/release/source-native-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-native-gates-rc16.cjs:13 declares/imports verifyPublicationReview; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.
- publish-source-release-rc16.cjs:1133,1351,1623 actively invokes verifyPublicationReview in its publication/evidence entrypoints. The unused import in the helper is not itself proof that those checks are absent.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 15: js/unused-local-variable

assertPinnedAlphaCheckout is an unused local import binding in scripts/release/source-native-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-native-gates-rc16.cjs:16 declares/imports assertPinnedAlphaCheckout; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.
- publish-source-release-rc16.cjs:1649,1686,1805,1808 actively invokes assertPinnedAlphaCheckout. This unused helper import does not independently establish a missing publisher check.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 16: js/unused-local-variable

delay is an unused local import binding in scripts/release/source-scanner-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-scanner-gates-rc16.cjs:8 declares/imports delay; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 17: js/unused-local-variable

verifyPublicationReview is an unused local import binding in scripts/release/source-scanner-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-scanner-gates-rc16.cjs:13 declares/imports verifyPublicationReview; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.
- publish-source-release-rc16.cjs:1133,1351,1623 actively invokes verifyPublicationReview in its publication/evidence entrypoints. The unused import in the helper is not itself proof that those checks are absent.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.

## Record 18: js/unused-local-variable

assertPinnedAlphaCheckout is an unused local import binding in scripts/release/source-scanner-gates-rc16.cjs; it is a real quality finding, not a demonstrated security defect.

Evidence:
- scripts/release/source-scanner-gates-rc16.cjs:17 declares/imports assertPinnedAlphaCheckout; immutable-source TypeScript AST inspection finds exactly one identifier occurrence(the declaration) and no use in that module.
- The authenticated rule descriptor tags are quality/maintainability/useless-code, recommendation level, and contain no security-severity or security tag.
- publish-source-release-rc16.cjs:1649,1686,1805,1808 actively invokes assertPinnedAlphaCheckout. This unused helper import does not independently establish a missing publisher check.

Limits and owner judgment:
- No quality acceptance record or organizational acknowledgement has been created. An owner must choose a focused cleanup or make the specific allowed acknowledgement through the existing policy.
- Any cleanup must preserve required module initialization/side effects and the real publisher verification calls; removing a whole require or weakening checks is not justified.
- The unused-binding alert alone neither proves nor disproves complete release-gate correctness. rc16 validation failures remain separate.

Verification:
- Exact immutable-source AST identifier count1 for this binding; complete raw result and rule metadata hashes are retained.
