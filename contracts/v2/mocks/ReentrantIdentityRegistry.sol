// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @dev Identity registry mock that attempts to reenter ValidationModule calls.
contract ReentrantIdentityRegistry is IIdentityRegistry {
    IValidationModule public validation;

    enum Attack {None, Commit, Reveal}
    Attack public attack;
    uint256 public jobId;
    bytes32 public commitHash;
    bool public approve;
    bytes32 public salt;

    function setValidationModule(address vm) external {
        validation = IValidationModule(vm);
    }

    function attackCommit(uint256 _jobId, bytes32 _commitHash) external {
        attack = Attack.Commit;
        jobId = _jobId;
        commitHash = _commitHash;
    }

    function attackReveal(uint256 _jobId, bool _approve, bytes32 _salt) external {
        attack = Attack.Reveal;
        jobId = _jobId;
        approve = _approve;
        salt = _salt;
    }

    // IIdentityRegistry stubs
    function isAuthorizedAgent(address, string calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }

    function isAuthorizedValidator(address, string calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }

    function verifyAgent(address, string calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }

    function verifyValidator(address, string calldata, bytes32[] calldata) external returns (bool) {
        if (attack == Attack.Commit) {
            attack = Attack.None;
            validation.commitValidation(jobId, commitHash, "", new bytes32[](0));
        } else if (attack == Attack.Reveal) {
            attack = Attack.None;
            validation.revealValidation(jobId, approve, salt, "", new bytes32[](0));
        }
        return true;
    }

    // owner configuration - no-ops
    function setENS(address) external {}
    function setNameWrapper(address) external {}
    function setReputationEngine(address) external {}
    function setAgentRootNode(bytes32) external {}
    function setClubRootNode(bytes32) external {}
    function setAgentMerkleRoot(bytes32) external {}
    function setValidatorMerkleRoot(bytes32) external {}

    // allowlists - no-ops
    function addAdditionalAgent(address) external {}
    function removeAdditionalAgent(address) external {}
    function addAdditionalValidator(address) external {}
    function removeAdditionalValidator(address) external {}

    function setAgentType(address, uint8) external {}

    function additionalAgents(address) external pure returns (bool) {
        return true;
    }

    function additionalValidators(address) external pure returns (bool) {
        return true;
    }

    function getAgentType(address) external pure returns (AgentType) {
        return AgentType.Human;
    }
}
