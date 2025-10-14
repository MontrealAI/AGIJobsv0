// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GlobalGovernanceCouncil
/// @notice Coordinates multinational governance mandates for AGI Jobs v0
///         deployments with explicit owner driven safeguards.
/// @dev The contract is intentionally owner centric so the platform operator
///      retains the ability to pause and update all configuration as required
///      by the task specification.
contract GlobalGovernanceCouncil is Ownable, Pausable {
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------
    error NationAlreadyRegistered(bytes32 nationId);
    error NationNotRegistered(bytes32 nationId);
    error NationInactive(bytes32 nationId);
    error MandateAlreadyExists(bytes32 mandateId);
    error MandateDoesNotExist(bytes32 mandateId);
    error InvalidTimeWindow();
    error InvalidGovernorAddress();
    error NotNationGovernor(bytes32 nationId);

    /// -----------------------------------------------------------------------
    /// Structs
    /// -----------------------------------------------------------------------
    struct NationConfig {
        string metadataURI;
        address governor;
        uint96 votingWeight;
        bool active;
    }

    struct Mandate {
        string metadataURI;
        uint256 quorum;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 supportWeight;
        uint256 againstWeight;
        bool executed;
        bool exists;
    }

    struct VoteRecord {
        bool cast;
        bool support;
        uint256 weight;
        string metadataURI;
        uint256 timestamp;
    }

    /// -----------------------------------------------------------------------
    /// Storage
    /// -----------------------------------------------------------------------
    mapping(bytes32 => NationConfig) private nations;
    bytes32[] private nationIds;

    mapping(bytes32 => Mandate) private mandates;
    mapping(bytes32 => mapping(bytes32 => VoteRecord)) private mandateVotes;

    bytes32 public pauserRole;

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event NationRegistered(bytes32 indexed nationId, address indexed governor, uint96 votingWeight, string metadataURI);
    event NationUpdated(bytes32 indexed nationId, address indexed governor, uint96 votingWeight, bool active, string metadataURI);
    event NationStatusChanged(bytes32 indexed nationId, bool active);
    event PauserRoleUpdated(bytes32 indexed newRole);

    event MandateCreated(bytes32 indexed mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, string metadataURI);
    event MandateUpdated(bytes32 indexed mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, bool executed, string metadataURI);
    event MandateVote(bytes32 indexed mandateId, bytes32 indexed nationId, bool support, uint256 weight, string metadataURI);

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    constructor(address initialOwner, bytes32 initialPauserRole) Ownable(initialOwner) {
        pauserRole = initialPauserRole;
    }

    /// -----------------------------------------------------------------------
    /// Modifiers
    /// -----------------------------------------------------------------------
    modifier onlyNation(bytes32 nationId) {
        NationConfig memory config = nations[nationId];
        if (config.governor == address(0)) revert NationNotRegistered(nationId);
        if (!config.active) revert NationInactive(nationId);
        if (msg.sender != config.governor) revert NotNationGovernor(nationId);
        _;
    }

    /// -----------------------------------------------------------------------
    /// Pauser management
    /// -----------------------------------------------------------------------
    function setPauserRole(bytes32 newPauserRole) external onlyOwner {
        pauserRole = newPauserRole;
        emit PauserRoleUpdated(newPauserRole);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// -----------------------------------------------------------------------
    /// Nation management
    /// -----------------------------------------------------------------------
    function registerNation(bytes32 nationId, address governor, uint96 votingWeight, string calldata metadataURI) external onlyOwner {
        if (governor == address(0)) revert InvalidGovernorAddress();
        if (nations[nationId].governor != address(0)) revert NationAlreadyRegistered(nationId);

        nations[nationId] = NationConfig({
            metadataURI: metadataURI,
            governor: governor,
            votingWeight: votingWeight,
            active: true
        });

        nationIds.push(nationId);

        emit NationRegistered(nationId, governor, votingWeight, metadataURI);
    }

    function updateNation(bytes32 nationId, address governor, uint96 votingWeight, bool active, string calldata metadataURI) external onlyOwner {
        NationConfig storage config = nations[nationId];
        if (config.governor == address(0)) revert NationNotRegistered(nationId);

        config.metadataURI = metadataURI;
        if (governor == address(0)) revert InvalidGovernorAddress();
        config.governor = governor;
        config.votingWeight = votingWeight;
        config.active = active;

        emit NationUpdated(nationId, governor, votingWeight, active, metadataURI);
    }

    function setNationActive(bytes32 nationId, bool active) external onlyOwner {
        NationConfig storage config = nations[nationId];
        if (config.governor == address(0)) revert NationNotRegistered(nationId);
        config.active = active;
        emit NationStatusChanged(nationId, active);
    }

    function getNation(bytes32 nationId) external view returns (NationConfig memory) {
        return nations[nationId];
    }

    function getNationIds() external view returns (bytes32[] memory) {
        return nationIds;
    }

    /// -----------------------------------------------------------------------
    /// Mandate management
    /// -----------------------------------------------------------------------
    function createMandate(bytes32 mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, string calldata metadataURI)
        external
        onlyOwner
    {
        Mandate storage mandate = mandates[mandateId];
        if (mandate.exists) revert MandateAlreadyExists(mandateId);

        uint256 startTs = startTimestamp == 0 ? block.timestamp : startTimestamp;
        uint256 endTs = endTimestamp;
        if (endTs != 0 && endTs <= startTs) revert InvalidTimeWindow();

        mandates[mandateId] = Mandate({
            metadataURI: metadataURI,
            quorum: quorum,
            startTimestamp: startTs,
            endTimestamp: endTs,
            supportWeight: 0,
            againstWeight: 0,
            executed: false,
            exists: true
        });

        emit MandateCreated(mandateId, quorum, startTs, endTs, metadataURI);
    }

    function updateMandate(bytes32 mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, bool executed, string calldata metadataURI)
        external
        onlyOwner
    {
        Mandate storage mandate = mandates[mandateId];
        if (!mandate.exists) revert MandateDoesNotExist(mandateId);

        uint256 startTs = startTimestamp == 0 ? mandate.startTimestamp : startTimestamp;
        uint256 endTs = endTimestamp == 0 ? mandate.endTimestamp : endTimestamp;
        if (endTs != 0 && endTs <= startTs) revert InvalidTimeWindow();

        mandate.quorum = quorum;
        mandate.startTimestamp = startTs;
        mandate.endTimestamp = endTs;
        mandate.executed = executed;
        mandate.metadataURI = metadataURI;

        emit MandateUpdated(mandateId, quorum, startTs, endTs, executed, metadataURI);
    }

    function getMandate(bytes32 mandateId) external view returns (Mandate memory) {
        return mandates[mandateId];
    }

    function getMandateVote(bytes32 mandateId, bytes32 nationId) external view returns (VoteRecord memory) {
        return mandateVotes[mandateId][nationId];
    }

    /// -----------------------------------------------------------------------
    /// Voting
    /// -----------------------------------------------------------------------
    function recordNationVote(bytes32 mandateId, bytes32 nationId, bool support, string calldata metadataURI)
        external
        whenNotPaused
        onlyNation(nationId)
    {
        Mandate storage mandate = mandates[mandateId];
        if (!mandate.exists) revert MandateDoesNotExist(mandateId);

        if (block.timestamp < mandate.startTimestamp) revert InvalidTimeWindow();
        if (mandate.endTimestamp != 0 && block.timestamp > mandate.endTimestamp) revert InvalidTimeWindow();

        VoteRecord storage previousVote = mandateVotes[mandateId][nationId];
        NationConfig memory config = nations[nationId];

        // Adjust tallies if the nation is recasting its vote.
        if (previousVote.cast) {
            if (previousVote.support) {
                mandate.supportWeight -= previousVote.weight;
            } else {
                mandate.againstWeight -= previousVote.weight;
            }
        }

        uint256 voteWeight = uint256(config.votingWeight);
        if (support) {
            mandate.supportWeight += voteWeight;
        } else {
            mandate.againstWeight += voteWeight;
        }

        mandateVotes[mandateId][nationId] = VoteRecord({
            cast: true,
            support: support,
            weight: voteWeight,
            metadataURI: metadataURI,
            timestamp: block.timestamp
        });

        emit MandateVote(mandateId, nationId, support, voteWeight, metadataURI);
    }

    function hasMandateReachedQuorum(bytes32 mandateId) external view returns (bool) {
        Mandate memory mandate = mandates[mandateId];
        if (!mandate.exists) revert MandateDoesNotExist(mandateId);
        return mandate.supportWeight >= mandate.quorum;
    }
}
