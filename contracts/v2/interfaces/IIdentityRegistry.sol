// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityRegistry {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);
    enum AgentType {
        Human,
        AI
    }
    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle);

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle);

    function verifyNode(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle);

    // owner configuration
    function setENS(address ensAddr) external;
    function setNameWrapper(address wrapper) external;
    function setReputationEngine(address engine) external;
    function setAgentRootNode(bytes32 root) external;
    function setClubRootNode(bytes32 root) external;
    function setNodeRootNode(bytes32 root) external;
    function setAgentMerkleRoot(bytes32 root) external;
    function setValidatorMerkleRoot(bytes32 root) external;

    // manual allowlists
    function addAdditionalAgent(address agent) external;
    function removeAdditionalAgent(address agent) external;
    function addAdditionalValidator(address validator) external;
    function removeAdditionalValidator(address validator) external;
    function addAdditionalNodeOperator(address nodeOperator) external;
    function removeAdditionalNodeOperator(address nodeOperator) external;

    function setAgentType(address agent, AgentType agentType) external;

    // views
    function additionalAgents(address account) external view returns (bool);
    function additionalValidators(address account) external view returns (bool);
    function additionalNodeOperators(address account) external view returns (bool);
    function getAgentType(address agent) external view returns (AgentType);

    // profile metadata
    function setAgentProfileURI(address agent, string calldata uri) external;
    function updateAgentProfile(
        string calldata subdomain,
        bytes32[] calldata proof,
        string calldata uri
    ) external;
    function agentProfileURI(address agent) external view returns (string memory);
}

