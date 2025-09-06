# ENS Identity Enforcement Plan

## Current State

The current AGIJobsv0 contracts already enforce ENS-based identity checks. Agents must own a subdomain under `agent.agi.eth` and validators under `club.agi.eth`. The `IdentityRegistry` and supporting libraries verify on-chain ownership at runtime, and both `JobRegistry` and `ValidationModule` call into this registry to confirm identities before allowing participation.

## Tasks to Ensure a Smooth Experience and Quality at Scale

### 1. Finalize ENS Configuration
- Configure the contracts with the `agent.agi.eth` and `club.agi.eth` roots. During deployment set `agentRootNode` and `clubRootNode` to the namehash of these domains.
- Point `IdentityRegistry` at the production ENS Registry and NameWrapper using `setENS()` and `setNameWrapper()`.
- **Outcome:** Agents and validators can only participate if their address owns the required ENS name according to mainnet records.

### 2. Enforce Identity Checks on All Paths
- Confirm every workflow requires a valid ENS name. Agents must provide a `*.agent.agi.eth` when applying or submitting, and validators need `*.club.agi.eth` for commit and reveal.
- Allowlists and Merkle proofs remain owner-controlled exceptions used sparingly by governance.
- **Outcome:** Every agent and validator action triggers an ENS ownership check with no easy bypass.

### 3. Integrate Attestation for Scalability
- Deploy `AttestationRegistry` and connect it through `IdentityRegistry.setAttestationRegistry`.
- ENS name owners can pre-authorize addresses with `AttestationRegistry.attest(node, role, agentAddress)`.
- **Outcome:** Previously attested identities skip expensive ENS lookups, reducing gas costs for repeat participants.

### 4. Enhance Caching & Performance
- Test the identity caches so entries expire after the configured duration and invalidate when cache versions change.
- Keep the default cache duration at 24 hours but allow the owner to adjust via `setAgentAuthCacheDuration` and `setValidatorAuthCacheDuration` if needed.
- Encourage combining actions (e.g., `acknowledgeAndApply`, `stakeAndApply`) to amortize checks.
- **Outcome:** Identity verification remains performant even as usage scales.

### 5. User Onboarding & Tooling
- Document how to obtain an `*.agent.agi.eth` or `*.club.agi.eth` subdomain and set the resolver address.
- Frontend or CLI tools should pre-check ENS setup and warn users before submitting transactions.
- Maintain allowlist management scripts for rare cases where a participant temporarily lacks an ENS name.
- **Outcome:** Users understand the identity requirement and have guidance to configure ENS correctly.

### 6. Testing & Quality Assurance
- Extend unit and integration tests for success and failure scenarios, including blacklisted addresses and misconfigured ENS records.
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
