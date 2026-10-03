# Slither policy and fixed-implementation review

The v2.0.0 candidate corrects a pre-existing gap in the high-severity gate. Slither 0.10.4 emits SARIF results with `level: warning`, including high-impact detectors. The validator now also reads each rule's `security-severity` and rejects unapproved scores of 7.0 or higher. It resolves prefixed SARIF IDs through the detector name and rejects malformed reports and unscoped allowlist entries. Regression tests run in the static-analysis workflow.

Local analysis of the modular candidate examined 266 contracts with 92 detectors and produced 816 findings of all severities. Of these, 27 have high security severity. They match the narrowly scoped entries below; this is a source review, not an independent security audit or a claim that every finding is harmless.

| Detector | Findings | Review and remaining assumptions |
| --- | ---: | --- |
| `arbitrary-send-erc20` | 4 | Existing escrow exceptions, updated to the current detector name and moved function locations. The configured registry, dispute module, or kernel controller collects approved funds. Those trusted callers and their governance remain part of the security boundary. |
| `weak-prng` | 9 | Existing exceptions retained for block-derived validator, platform, operator, and audit selection. Proposer influence remains a real limitation. These are not cryptographically unpredictable draws; production requires explicit threat-model review and an approved randomness design. |
| `encode-packed-collision` | 2 | Both CertificateNFT variants concatenate a URI prefix and decimal token ID for display. This value is not a signed or hashed multi-field authorization payload. |
| `incorrect-return` | 11 | Controller wrappers intentionally terminate by forwarding the implementation's return data. Each listed wrapper only delegates; no controller modifier cleanup or subsequent statement is skipped. Authorization, pause checks, and reentrancy cleanup execute inside the implementation before its return. Exceptions name each individual wrapper. |
| `uninitialized-state` | 1 | The abstract validation base declares `DOMAIN_SEPARATOR`; the controller constructor initializes its appended storage slot. Delegated execution uses that controller state. Direct implementation writes revert. Layout and domain-separation tests cover this distinction. |

The older, scoped medium-severity exceptions remain recorded, with moved functions updated to their shared-base locations. All findings remain in the uploaded SARIF for review; no detector was disabled by this change. Reviewers should examine the complete report, the new delegation boundary, and existing randomness assumptions before approving production deployment.

Reproduce after a normal optimized Hardhat build:

```bash
node --test test/scripts/slither-policy.test.cjs
slither . --compile-force-framework hardhat --ignore-compile \
  --filter-paths 'node_modules|contracts/(legacy|test|v2/mocks)' \
  --exclude locked-ether --fail-none --sarif reports/security/slither.sarif
node tools/security/validate-slither.mjs \
  reports/security/slither.sarif tools/security/slither-allowlist.json
```
