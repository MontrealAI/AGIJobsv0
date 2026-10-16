// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import {ITerminalReputation} from "../v2/interfaces/ITerminalReputation.sol";

/// @dev Test-only caller that exposes explicitly controlled lifecycle transitions.
contract TerminalReputationRegistryHarness {
    bytes32 public constant terminalPolicyId = keccak256("AGIJobs:terminal-reputation-v3");
    mapping(uint256 => address) public jobReputationEngine;
    address public validationModule;

    function setValidationModule(address module) external { validationModule = module; }
    function open(uint256 jobId, address engine) external {
        jobReputationEngine[jobId] = engine;
        ITerminalReputation(engine).registerJob(jobId);
    }
    function assign(uint256 jobId, address agent) external { ITerminalReputation(jobReputationEngine[jobId]).assignJob(jobId, agent); }
    function submit(uint256 jobId) external { ITerminalReputation(jobReputationEngine[jobId]).submitJob(jobId); }
    function settle(uint256 jobId, address agent, bool success, bool attributed, uint256 payout) external {
        ITerminalReputation(jobReputationEngine[jobId]).finalizeJob(jobId, agent, success, attributed, payout);
    }
}
