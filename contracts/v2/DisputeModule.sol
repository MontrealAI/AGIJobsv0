// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";

interface IJobRegistry {
    struct Job {
        address agent;
        address employer;
        uint256 reward;
        uint8 state;
    }

    function jobs(uint256 jobId) external view returns (Job memory);
    function resolveDispute(uint256 jobId, bool employerWins) external;
}

/// @title DisputeModule
/// @notice Handles appeals with a simple bond mechanism and moderator resolution.
contract DisputeModule is IDisputeModule, Ownable {
    IJobRegistry public jobRegistry;

    uint256 public appealFee;
    uint256 public jurySize;
    address public moderator;

    mapping(uint256 => address payable) public appellants;
    mapping(uint256 => uint256) public bonds;

    constructor(IJobRegistry _jobRegistry, address owner) Ownable(owner) {
        jobRegistry = _jobRegistry;
        moderator = owner;
    }

    /// @inheritdoc IDisputeModule
    function setAppealParameters(uint256 fee, uint256 _jurySize)
        external
        override
        onlyOwner
    {
        appealFee = fee;
        jurySize = _jurySize;
        emit AppealParametersUpdated();
    }

    /// @inheritdoc IDisputeModule
    function setModerator(address _moderator) external override onlyOwner {
        moderator = _moderator;
        emit ModeratorUpdated(_moderator);
    }

    /// @inheritdoc IDisputeModule
    function raiseDispute(uint256 jobId) external payable override {
        require(msg.sender == address(jobRegistry), "registry only");
        require(msg.value == appealFee, "fee");
        require(bonds[jobId] == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        appellants[jobId] = payable(job.agent);
        bonds[jobId] = msg.value;

        emit DisputeRaised(jobId, job.agent);
    }

    modifier onlyArbiter() {
        require(msg.sender == owner() || msg.sender == moderator, "not authorized");
        _;
    }

    /// @inheritdoc IDisputeModule
    function resolve(uint256 jobId, bool employerWins) external override onlyArbiter {
        uint256 bond = bonds[jobId];
        require(bond > 0, "no bond");

        address payable recipient = employerWins
            ? payable(jobRegistry.jobs(jobId).employer)
            : appellants[jobId];

        jobRegistry.resolveDispute(jobId, employerWins);

        delete bonds[jobId];
        delete appellants[jobId];

        (bool ok, ) = recipient.call{value: bond}("");
        require(ok, "transfer");

        emit DisputeResolved(jobId, employerWins);
    }
}

