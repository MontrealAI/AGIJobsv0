# Cosmic flagship CI evidence

The canonical workflow is
[demo-cosmic-flagship.yml](../../../.github/workflows/demo-cosmic-flagship.yml).
Its retained job ID is `flagship-dry-run` for compatibility; its displayed name
and explicit execution mode describe offline fixture verification.

1. Check builtin-only planning, strict flags, clean environment forwarding,
   guarded-node batch/cleanup integration with inert stubs, and local-only config.
2. Install the repository's locked dependencies in a separate `npm ci` step.
3. Check all four governance scripts against the exact launcher preflight and
   installed ts-node CommonJS compilation. Execute deployment/export sources
   only with inert Hardhat/provider/filesystem stubs; verify input forwarding,
   JSON serialization, strict export arguments, and failure propagation.
4. Execute `flagship-demo.sh --ci --mode offline-fixture`.
5. Rerun the substantive artifact verifier and upload labeled evidence.

This generates synthetic governance records plus the existing offline AGI OS
mission/report pipeline. It does not compile or exercise contracts, start a node,
use a provider or wallet, validate ownership, or certify production readiness.
No external RPC URL or deployment secret is needed. `--ci` alone and
`--ci --dry-run` now print effect-free plans and cannot replace the artifact gate.

The shared [runbook](flagship-runbook.md) describes explicit local mode, its
remaining bundled-input bytes32 blocker, and the qualification limitations.
