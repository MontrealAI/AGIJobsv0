// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AlphaMarkRiskOracle
/// @notice Permissioned validator council that approves or rejects a Nova-Seed launch.
contract AlphaMarkRiskOracle is Ownable {
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event ApprovalThresholdUpdated(uint256 newThreshold);
    event ApprovalCast(address indexed validator, bool approved);
    event ApprovalRevoked(address indexed validator);
    event ValidationOverrideSet(bool forcedStatus);

    mapping(address => bool) public isValidator;
    mapping(address => bool) public hasApproved;

    uint256 public validatorCount;
    uint256 public approvalCount;
    uint256 public approvalThreshold;

    bool public overrideEnabled;
    bool public overrideStatus;

    constructor(address owner_, address[] memory initialValidators, uint256 threshold) Ownable(owner_) {
        approvalThreshold = threshold;
        _batchAddValidators(initialValidators);
    }

    function setApprovalThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Threshold must be > 0");
        require(newThreshold <= validatorCount, "Threshold above validator count");
        approvalThreshold = newThreshold;
        emit ApprovalThresholdUpdated(newThreshold);
    }

    function addValidators(address[] memory validators) external onlyOwner {
        _batchAddValidators(validators);
    }

    function removeValidators(address[] memory validators) external onlyOwner {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (!isValidator[validator]) continue;
            isValidator[validator] = false;
            validatorCount -= 1;
            if (hasApproved[validator]) {
                hasApproved[validator] = false;
                approvalCount -= 1;
                emit ApprovalRevoked(validator);
            }
            emit ValidatorRemoved(validator);
        }
        if (approvalThreshold > validatorCount) {
            approvalThreshold = validatorCount;
            emit ApprovalThresholdUpdated(approvalThreshold);
        }
    }

    function approveSeed() external {
        require(isValidator[msg.sender], "Not validator");
        if (hasApproved[msg.sender]) revert("Already approved");
        hasApproved[msg.sender] = true;
        approvalCount += 1;
        emit ApprovalCast(msg.sender, true);
    }

    function revokeApproval() external {
        require(isValidator[msg.sender], "Not validator");
        if (!hasApproved[msg.sender]) revert("No approval");
        hasApproved[msg.sender] = false;
        approvalCount -= 1;
        emit ApprovalRevoked(msg.sender);
    }

    function seedValidated() public view returns (bool) {
        if (overrideEnabled) {
            return overrideStatus;
        }
        return approvalCount >= approvalThreshold && approvalThreshold > 0;
    }

    function setOverride(bool enabled, bool status) external onlyOwner {
        overrideEnabled = enabled;
        overrideStatus = status;
        emit ValidationOverrideSet(enabled ? status : false);
    }

    function _batchAddValidators(address[] memory validators) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (validator == address(0) || isValidator[validator]) continue;
            isValidator[validator] = true;
            validatorCount += 1;
            emit ValidatorAdded(validator);
        }
        if (approvalThreshold == 0 && validatorCount > 0) {
            approvalThreshold = (validatorCount + 1) / 2;
            emit ApprovalThresholdUpdated(approvalThreshold);
        }
    }
}
