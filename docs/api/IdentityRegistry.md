# IdentityRegistry API

Validates ENS ownership and Merkle proofs for agents and validators.

## Functions
- `setENS(address ens)` / `setNameWrapper(address wrapper)` – configure ENS contracts.
- `setReputationEngine(address engine)` – connect reputation engine.
- `setAgentRootNode(bytes32 node)` / `setClubRootNode(bytes32 node)` – base ENS nodes for agents and validators.
- `setAgentMerkleRoot(bytes32 root)` / `setValidatorMerkleRoot(bytes32 root)` – load allowlists.
- `addAdditionalAgent(address agent)` / `addAdditionalValidator(address validator)` – manual overrides.
- `isAuthorizedAgent(address account, bytes32 label, bytes32[] proof)` – check agent eligibility.
- `isAuthorizedValidator(address account, bytes32 label, bytes32[] proof)` – check validator eligibility.
- `verifyAgent(bytes32 label, bytes32[] proof, address account)` – external verification helper.
- `verifyValidator(bytes32 label, bytes32[] proof, address account)` – external verification helper.

## Events
- `ENSUpdated(address ens)` / `NameWrapperUpdated(address nameWrapper)`
- `ReputationEngineUpdated(address reputationEngine)`
- `AgentRootNodeUpdated(bytes32 agentRootNode)` / `ClubRootNodeUpdated(bytes32 clubRootNode)`
- `AgentMerkleRootUpdated(bytes32 agentMerkleRoot)` / `ValidatorMerkleRootUpdated(bytes32 validatorMerkleRoot)`
- `AdditionalAgentUpdated(address agent, bool allowed)`
- `AdditionalValidatorUpdated(address validator, bool allowed)`
