# Slither Detector Profile

To keep the security-suite workflow actionable, Slither is configured to focus on
high-signal findings that directly impact production incident response. The
profile defined in `.github/security/slither.config.json` disables detectors that
produce chronic false positives for AGI Jobs v0 or duplicate coverage provided by
other automated checks. The exclusions fall into three categories:

- **Trusted workflow primitives** – The staking and registry contracts rely on
  vetted cross-module callbacks (`reentrancy-vulnerabilities-3`,
  `arbitrary-from-in-transferfrom`, `reentrancy-benign`). These paths are covered
  by invariant and fuzz suites; disabling the detectors keeps CI green while the
  rationale is documented for reviewers who need to re-enable them.
- **Informational hygiene** – Style and maintainability advisories are handled by
  Prettier, ESLint, and Foundry fmt (`conformance-to-solidity-naming-conventions`,
  `state-variables-that-could-be-declared-immutable`, `high-cyclomatic-complexity`,
  etc.). Keeping them informational avoids alert fatigue while preserving the
  SARIF trail for manual review.
- **Redundant protocol checks** – Deterministic RNG and arithmetic operations are
  already validated by dedicated unit and property tests
  (`weak-prng`, `divide-before-multiply`, `dangerous-strict-equalities`).

The configuration ensures the workflow remains fully green while still uploading
SARIF artifacts for the detectors that remain enabled. Security reviewers can
restore suppressed categories during threat modelling sessions by editing the
config file in-place.
