// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DomainAccessController
 * @notice Maintains fine-grained emergency pause controls scoped per operational domain.
 */
contract DomainAccessController is Ownable {
    struct DomainState {
        bool paused;
        uint64 lastUpdatedAt;
        bytes32 latestTrigger;
        string reason;
    }

    mapping(bytes32 => DomainState) private _domains;
    mapping(address => bool) public sentinelCallers;

    event DomainPaused(bytes32 indexed domain, bytes32 indexed triggerId, string reason, address indexed caller);
    event DomainResumed(bytes32 indexed domain, address indexed caller);
    event SentinelConfigured(address indexed sentinel, bool enabled);

    error DomainIsPaused(bytes32 domain);
    error NotSentinel();

    modifier onlySentinel() {
        if (!sentinelCallers[msg.sender]) {
            revert NotSentinel();
        }
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setSentinel(address sentinel, bool enabled) external onlyOwner {
        sentinelCallers[sentinel] = enabled;
        emit SentinelConfigured(sentinel, enabled);
    }

    function pauseDomain(bytes32 domain, bytes32 triggerId, string calldata reason) external onlySentinel {
        DomainState storage state = _domains[domain];
        state.paused = true;
        state.lastUpdatedAt = uint64(block.timestamp);
        state.latestTrigger = triggerId;
        state.reason = reason;
        emit DomainPaused(domain, triggerId, reason, msg.sender);
    }

    function resumeDomain(bytes32 domain) external onlyOwner {
        DomainState storage state = _domains[domain];
        state.paused = false;
        state.lastUpdatedAt = uint64(block.timestamp);
        state.latestTrigger = bytes32(0);
        state.reason = "";
        emit DomainResumed(domain, msg.sender);
    }

    function ensureDomainActive(bytes32 domain) external view {
        if (_domains[domain].paused) {
            revert DomainIsPaused(domain);
        }
    }

    function domainState(bytes32 domain) external view returns (DomainState memory) {
        return _domains[domain];
    }
}
