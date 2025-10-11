# Security Guidelines

## Ownership Transfer to a Multisig

1. Deploy or identify a secure multisig wallet (e.g., Gnosis Safe) with a **strict majority** approval threshold (e.g., 2-of-3, 3-of-5).
2. From the current owner account, call `setGovernance(<multisig_address>)` on `Governable` modules (JobRegistry, StakeManager, SystemPause, Thermostat, etc.). Each call emits both `GovernanceUpdated` and `OwnershipTransferred(previousOwner, newOwner)`.
3. Call `transferOwnership(<multisig_address>)` on `Ownable` modules (ValidationModule, ReputationEngine, FeePool, PlatformRegistry, IdentityRegistry, CertificateNFT, DisputeModule, PlatformIncentives, JobRouter, TaxPolicy, etc.). The hand-off emits `OwnershipTransferred`.
4. Wait for confirmations and verify the emitted events reference the intended multisig.
5. Confirm the transfer by calling `owner()` (or `governance()` on Governable modules) to ensure the multisig address is in control before retiring the deployer key.

## Verifying Module Address Updates

When updating module addresses, ensure the transaction emits the expected events:

- `ValidationModuleUpdated(address)` when setting a new validation module.
- `DisputeModuleUpdated(address)` when setting a new dispute module.
- `JobRegistryUpdated(address)` when modules such as `CertificateNFT` or `StakeManager` update their registry reference.
- `PauserUpdated(address)` when emergency pause delegates are rotated.
- `Paused(address)` / `Unpaused(address)` from critical modules following a governance or pauser action.

## Operations Runbook

See [docs/security-deployment-guide.md](docs/security-deployment-guide.md) for a step-by-step guide that combines ownership transfers, pauser configuration, and emergency response procedures into a single checklist suitable for production launches.

## Audit Drill Catalogue

The reproducible scenarios that external reviewers should execute ahead of an
audit are catalogued in
[`docs/security/audit-test-vectors.md`](docs/security/audit-test-vectors.md).
They include the new mainnet fork lifecycle drill (`npm run test:fork`) and the
validator dispute flows that demonstrate slashing behaviour.

## Static Analysis Commands

- **Slither:** `slither . --solc-remaps @openzeppelin=node_modules/@openzeppelin/`
- **Foundry:**
  - `forge build`
  - `forge test`
- **OpenSSF Scorecard:** runs automatically via [security-scorecard](docs/security/scorecard.md)
  and fails the pipeline if key checks fall below enforced thresholds (Binary-Artifacts,
  Code-Review, Maintained, Signed-Releases, Token-Permissions, Vulnerabilities,
  Dependency-Update-Tool, Security-Policy, and the overall score).

## Dependency Vulnerability Allowlist

The CI security audit (see `npm run security:audit`) fail-gates any new vulnerability reports.
Three advisories are intentionally allowlisted because the upstream projects that
provide Truffle compatibility and the Solidity compiler toolchain have not yet
published patched releases:

- `GHSA-p8p7-x288-28g6` and `GHSA-3h5v-q93c-6h6q` stem from the legacy `request`
  stack required by `@truffle/hdwallet-provider`. The provider is only required
  for backwards-compatible Truffle migrations; production deployments should
  prefer the Hardhat scripts shipped in `scripts/deploy`. We monitor the
  dependency for updates and will remove the allowlist once the maintainer ships
  a patched release or when we fully deprecate the Truffle path.
- `GHSA-52f5-9888-hmc6` is inherited from the official `solc` npm package used by
  Hardhat. The compiler team has acknowledged the issue and is tracking a fix;
  no alternative package exists today. The vulnerability requires a malicious
  symlink in a caller-controlled temporary directory, which our tooling never
  exposes because all invocations run inside isolated build sandboxes.

The audit report is stored in `audit-ci.json` together with the allowlist so that
any future pipeline run will fail immediately when new advisories appear.
