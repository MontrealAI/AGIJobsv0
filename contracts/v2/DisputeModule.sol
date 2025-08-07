// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";

/// @title DisputeModule
/// @notice Handles appeals with an optional validator jury and bond mechanism.
contract DisputeModule is IDisputeModule, Ownable {
    IJobRegistry public jobRegistry;
    IValidationModule public validationModule;

    uint256 public appealBond;
    uint256 public jurySize;

    mapping(uint256 => address payable) public appellants;
    mapping(uint256 => uint256) public bonds;

    constructor(IJobRegistry _jobRegistry, IValidationModule _validationModule, address owner)
        Ownable(owner)
    {
        jobRegistry = _jobRegistry;
        validationModule = _validationModule;
    }

    /// @inheritdoc IDisputeModule
    function setAppealParameters(uint256 appealFee, uint256 _jurySize) external onlyOwner {
        appealBond = appealFee;
        jurySize = _jurySize;
        emit AppealParametersUpdated();
    }

    /// @inheritdoc IDisputeModule
    function raiseDispute(uint256 jobId) external payable override {
        require(msg.value == appealBond, "bond");
        require(bonds[jobId] == 0, "disputed");

        appellants[jobId] = payable(msg.sender);
        bonds[jobId] = msg.value;

        address[] memory jury = validationModule.selectValidators(jobId);
        require(jury.length >= jurySize, "jury");

        emit DisputeRaised(jobId, msg.sender);
    }

    /// @inheritdoc IDisputeModule
    function resolve(uint256 jobId, bool employerWins) external override {
        require(msg.sender == address(jobRegistry), "registry");
        uint256 bond = bonds[jobId];
        require(bond > 0, "no bond");

        address payable recipient;
        if (employerWins) {
            IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
            recipient = payable(job.employer);
        } else {
            recipient = appellants[jobId];
        }

        delete bonds[jobId];
        delete appellants[jobId];

        (bool ok, ) = recipient.call{value: bond}("");
        require(ok, "transfer");

        emit DisputeResolved(jobId, employerWins);
    }
}

