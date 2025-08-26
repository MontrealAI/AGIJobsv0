// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IJobManager {
    enum DisputeOutcome { AgentWin, EmployerWin }
    function resolveDispute(uint256 _jobId, DisputeOutcome outcome) external;
}

contract ReentrantERC20 is ERC20 {
    IJobManager public manager;
    uint256 public jobId;
    bool private attack;

    constructor() ERC20("Reentrant", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address _manager, uint256 _jobId) external {
        manager = IJobManager(_manager);
        jobId = _jobId;
    }

    function _reenter() internal {
        if (!attack && address(manager) != address(0)) {
            attack = true;
            // attempt to finalize again via resolveDispute
            manager.resolveDispute(jobId, IJobManager.DisputeOutcome.AgentWin);
            attack = false;
        }
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _reenter();
        return super.transfer(to, amount);
    }
}
