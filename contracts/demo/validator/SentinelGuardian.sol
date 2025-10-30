// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DomainAccessController} from "./DomainAccessController.sol";

/**
 * @title SentinelGuardian
 * @notice Autonomous anomaly detection router that halts compromised domains.
 */
contract SentinelGuardian is Ownable {
    struct Watcher {
        bool enabled;
        string tag;
    }

    DomainAccessController public immutable domainController;
    mapping(address => Watcher) public watchers;

    event WatcherConfigured(address indexed watcher, bool enabled, string tag);
    event AnomalyRaised(
        bytes32 indexed domain,
        bytes32 indexed jobId,
        address indexed agent,
        string category,
        string description,
        uint256 severity,
        address watcher,
        bytes32 triggerId
    );

    error WatcherNotAuthorised(address caller);

    constructor(DomainAccessController controller) Ownable(msg.sender) {
        domainController = controller;
    }

    modifier onlyWatcher() {
        if (!watchers[msg.sender].enabled) {
            revert WatcherNotAuthorised(msg.sender);
        }
        _;
    }

    function configureWatcher(address watcher, bool enabled, string calldata tag) external onlyOwner {
        watchers[watcher] = Watcher({enabled: enabled, tag: tag});
        emit WatcherConfigured(watcher, enabled, tag);
    }

    function reportBudgetOverrun(
        bytes32 domain,
        bytes32 jobId,
        address agent,
        uint256 attemptedSpend,
        uint256 permittedSpend,
        string calldata description,
        uint256 severity
    ) external onlyWatcher {
        _raiseAnomaly(
            domain,
            jobId,
            agent,
            "BUDGET_OVERRUN",
            description,
            severity,
            attemptedSpend,
            permittedSpend
        );
    }

    function reportUnsafeCall(
        bytes32 domain,
        bytes32 jobId,
        address agent,
        string calldata description,
        uint256 severity
    ) external onlyWatcher {
        _raiseAnomaly(domain, jobId, agent, "UNSAFE_CALL", description, severity, 0, 0);
    }

    function _raiseAnomaly(
        bytes32 domain,
        bytes32 jobId,
        address agent,
        string memory category,
        string memory description,
        uint256 severity,
        uint256 metricA,
        uint256 metricB
    ) internal {
        bytes32 triggerId = keccak256(
            abi.encodePacked(block.timestamp, msg.sender, domain, jobId, category, metricA, metricB)
        );
        domainController.pauseDomain(domain, triggerId, description);
        emit AnomalyRaised(
            domain,
            jobId,
            agent,
            category,
            description,
            severity,
            msg.sender,
            triggerId
        );
    }
}
