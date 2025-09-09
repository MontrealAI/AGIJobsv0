# IdentityRegistry API

Validates ENS ownership and Merkle proofs for agents and validators.
Maintains optional metadata URIs describing each agent's capabilities.
When connected to an `AttestationRegistry`, delegated addresses can skip the
full ENS lookup and successful checks are cached by consumer modules to reduce
gas usage.

## Functions

- `setENS(address ens)` / `setNameWrapper(address wrapper)` – configure ENS contracts.
- `setReputationEngine(address engine)` – connect reputation engine.
- `setAttestationRegistry(address registry)` – enable off‑chain attestation lookups.
- `setAgentRootNode(bytes32 node)` / `setClubRootNode(bytes32 node)` – base ENS nodes for agents and validators.
- `setAgentMerkleRoot(bytes32 root)` / `setValidatorMerkleRoot(bytes32 root)` – load allowlists.
- `addAdditionalAgent(address agent)` / `addAdditionalValidator(address validator)` – manual overrides.
- `setAgentProfileURI(address agent, string uri)` – governance-set capability profile for an agent.
- `updateAgentProfile(string subdomain, bytes32[] proof, string uri)` – agent updates their own profile after proving control of `subdomain`.
- `isAuthorizedAgent(address claimant, string subdomain, bytes32[] proof)` – check agent eligibility for `subdomain.agent.agi.eth`.
- `isAuthorizedValidator(address claimant, string subdomain, bytes32[] proof)` – read-only check for validator eligibility for `subdomain.club.agi.eth`; does not emit events.
- `verifyAgent(address claimant, string subdomain, bytes32[] proof)` – external verification helper.
- `verifyValidator(address claimant, string subdomain, bytes32[] proof)` – external verification helper.

## Events

- `ENSUpdated(address ens)` / `NameWrapperUpdated(address nameWrapper)`
- `ReputationEngineUpdated(address reputationEngine)`
- `AgentRootNodeUpdated(bytes32 agentRootNode)` / `ClubRootNodeUpdated(bytes32 clubRootNode)`
- `AgentMerkleRootUpdated(bytes32 agentMerkleRoot)` / `ValidatorMerkleRootUpdated(bytes32 validatorMerkleRoot)`
- `AdditionalAgentUpdated(address agent, bool allowed)`
- `AdditionalValidatorUpdated(address validator, bool allowed)`
- `AdditionalAgentUsed(address agent, string subdomain)` /
  `AdditionalValidatorUsed(address validator, string subdomain)`
- `AgentProfileUpdated(address agent, string uri)` – emitted whenever an agent profile is set or changed. Off-chain services can listen for this event and fetch the referenced URI (e.g., from IPFS) to match jobs with agents based on declared capabilities.
- `IdentityVerified(address user, Role role, bytes32 node, string subdomain)` – emitted when verification succeeds.
- `ENSVerified(address user, bytes32 node, string label, bool viaWrapper, bool viaMerkle)` – low-level trace of the ENS ownership path.
- `IdentityVerificationFailed(address user, Role role, string subdomain)` – emitted when verification fails.
