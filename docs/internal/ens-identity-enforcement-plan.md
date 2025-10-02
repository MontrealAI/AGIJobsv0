# ENS Identity Enforcement Plan

## Current State

The current AGIJobsv0 contracts already enforce ENS-based identity checks. Agents must own a subdomain under `agent.agi.eth` and validators under `club.agi.eth`. The `IdentityRegistry` and supporting libraries verify on-chain ownership at runtime, and both `JobRegistry` and `ValidationModule` call into this registry to confirm identities before allowing participation.

## Tasks to Ensure a Smooth Experience and Quality at Scale

### 1. Finalize ENS Configuration

- Configure the contracts with the `agent.agi.eth` and `club.agi.eth` roots. Before mainnet launch, call `IdentityRegistry.setAgentRootNode(namehash("agent.agi.eth"))` and `setClubRootNode(namehash("club.agi.eth"))` so subdomain nodes are computed correctly.
- Point `IdentityRegistry` at the production ENS Registry and NameWrapper using `setENS()` and `setNameWrapper()` so runtime lookups query the canonical contracts.
- **Outcome:** Agents and validators can only participate if their address owns the required ENS name according to mainnet records.

### 2. Enforce Identity Checks on All Paths

- Confirm every workflow requires a valid ENS name. `JobRegistry.applyForJob` invokes `IdentityLib.verify` and reverts without a successful `*.agent.agi.eth` check, while the `ValidationModule` rejects commit/reveal calls unless `verifyValidator` proves ownership of `*.club.agi.eth`.
- Allowlists (`additionalAgents`/`additionalValidators`) and Merkle proof exemptions should be used only for emergency governance or migration.
- **Outcome:** Every agent and validator action triggers an ENS ownership check with no easy bypass.

### 3. Integrate Attestation for Scalability

- Deploy `AttestationRegistry` and connect it through `IdentityRegistry.setAttestationRegistry`.
- ENS name owners can pre-authorize addresses with `AttestationRegistry.attest(node, role, agentAddress)` and CLI helpers such as `scripts/v2/attestEns.ts`.
- **Outcome:** Previously attested identities skip expensive ENS resolver calls, reducing gas costs for repeat participants.

### 4. Enhance Caching & Performance

- Test the identity caches so entries expire after the configured duration and invalidate when cache versions change (`bumpAgentAuthCacheVersion` / `bumpValidatorAuthCacheVersion`).
- Set the default cache duration to zero so every application and commit enforces a fresh ENS proof; allow governance to increase it later via `setAgentAuthCacheDuration` and `setValidatorAuthCacheDuration` if operationally justified.
- Encourage combining actions (e.g., `acknowledgeAndApply`, `stakeAndApply`) to amortize checks.
- **Outcome:** Identity verification remains performant even as usage scales.

### 5. User Onboarding & Tooling

- Document how to obtain an `*.agent.agi.eth` or `*.club.agi.eth` subdomain and set the resolver address in `README.md` and `docs/ens-identity-setup.md`.
- Frontend or CLI tools should look up the caller's ENS records and warn if the required subdomain is missing to avoid failed transactions.
- Maintain allowlist management scripts for rare cases where a participant temporarily lacks an ENS name.
- **Outcome:** Users understand the identity requirement and have guidance to configure ENS correctly.

### 6. Testing & Quality Assurance

- Extend unit and integration tests for success and failure scenarios, including blacklisted addresses, incorrect subdomains and missing resolver records.
- Load test commit–reveal rounds with many validators and perform a mainnet-fork dry run prior to launch.
- **Outcome:** High confidence in the identity system’s correctness and scalability.

### 7. Post-Deployment Monitoring

- Monitor `OwnershipVerified` and `RecoveryInitiated` events to spot misconfigurations or user issues.
- Track usage of allowlists and Merkle proofs; heavy reliance indicates onboarding problems.
- Periodically verify control of `agent.agi.eth` and `club.agi.eth` to avoid losing critical infrastructure.
- **Outcome:** Ongoing enforcement and early detection of identity issues in production.

## Sources

- AGIJobs v2 Sprint Plan – ENS Identity Enforcement
- JobRegistry.sol
- ValidationModule.sol
- ENSIdentityVerifier.sol
- AttestationRegistry tests
- JobRegistry.sol caching logic
