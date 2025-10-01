# Epic 5 – Deployment & Security Readiness

Epic objective: prepare AGI Jobs v0 for a production launch with institutional
security standards, comprehensive testing, and repeatable deployment.

## Workstreams & Acceptance Criteria

### 1. CI/CD & Quality Gates
- **Hardhat + Node toolchain** pinned via `NODE_VERSION`, Foundry toolchain,
  and Docker dependencies (Slither, Echidna).
- **Linting gates**: `npm run lint:check`, `solhint` for contracts,
  `eslint` for scripts/packages, `prettier --check` for markdown/yaml.
- **Testing gates**: `npm test`, `npm run coverage`, `forge test --ffi`, and
  invariant suites (`npm run echidna`).
- **Static analysis**: Slither with `--fail-high`, upload SARIF. MythX or
  `npm run mythx` added when credentials available.
- **Coverage enforcement**: `scripts/check-coverage.js` with
  `${COVERAGE_MIN}` set to ≥ 90%.
- **CI enforcement**: make `build`, `slither`, `echidna-pr`, `foundry`, and
  `fork-drill` required in branch protection when RPC secrets are configured.

**Deliverables**
- Updated workflow docs in `/docs/release-checklist.md` and `/docs/security`.
- CI runbook in `internal_docs/security/` (optional) summarising failure modes.

### 2. Hardhat Mainnet-Fork & Public Testnet Drills
- **Fork drill**: `npm run test:fork` against `${MAINNET_RPC_URL}` or
  `${MAINNET_FORK_URL}`. Capture gas reports and state diffs.
- **Large validator scenario**: extend fork scripts to register ≥ 16 validators,
  ensuring staking limits and payout calculations hold with saturated sets.
- **Failure drills**: orchestrate validator misbehaviour (incorrect reveal,
  offline agent, double finalisation attempts) via
  `npx hardhat run scripts/audit/drills/validator-misbehaves.ts --network hardhat`
  and verify slashing semantics.
- **Public testnet rehearsal**: deploy via `npm run deploy:staging` (Goerli or
  Sepolia). Run CLI/UI workflows with seeded accounts and export transaction
  hashes.
- **Documentation**: update `docs/security/audit-test-vectors.md` with replay
  commands and expected outputs.

**Acceptance evidence**
- Stored logs under `internal_docs/security/drills/`.
- Gas snapshots committed to `gas-snapshots/`.

### 3. Security Audit Support & Test Vectors
- **NatSpec audit**: ensure every external/public function includes NatSpec
  with state/permission rationale.
- **Audit vectors**: scriptable flows such as validator misbehaviour, treasury
  withdrawal limits, and stake cap enforcement. Provide command snippets and
  expected state transitions.
- **State assertions**: integrate property tests (`test/property/`) verifying
  stake never goes negative, slashing caps, and job funds conservation.
- **Security dossier**: prepare bundle containing:
  - `SECURITY.md` updates (admin keys, emergency hooks).
  - Scenario logs from fork/testnet drills.
  - Slither SARIF & Echidna outputs.
  - Coverage report (LCOV) and gas report.

### 4. Production Deployment & Handoff
- **Dry runs**: `npm run migrate:wizard -- --network mainnet` using placeholder
  keys to verify sequence (Identity → StakeManager → JobRegistry → modules).
- **Config freeze**: store canonical addresses in
  `deployment/deployment-addresses.json` and replicate in `docs/deployment`.
- **Governance transfer**: execute timelock/multisig ownership transfers and
  document them in `owner-control-handbook.md`.
- **Runbooks**: update operational guides (`deployment-production-guide.md`,
  `production-deployment-handbook.md`, `owner-control-surface.md`) with the
  final sequences.

## Milestone Checklist
1. ✅ CI workflows enforce linting, testing, coverage, Slither, Echidna, and
   Foundry tests.
2. ✅ Fork drill passes with archived outputs and gas deltas.
3. ✅ Public testnet deployment script executed; addresses captured.
4. ✅ Audit dossier compiled and shared with auditors.
5. ✅ Governance ownership transferred and documented post-deployment.

Completing these steps delivers a deployment-ready, security-audited AGI Jobs v0
with reproducible scripts and artefacts for external reviewers.
