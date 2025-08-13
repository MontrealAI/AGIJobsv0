// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OperatorRegistry
/// @notice Tracks operator status, stake and reputation.
contract OperatorRegistry is Ownable {
    struct Operator {
        bool active;
        uint256 stake;
        uint256 reputation;
    }

    mapping(address => Operator) private _operators;
    address public stakingRouter;

    event OperatorStatusUpdated(address indexed operator, bool active);
    event OperatorStakeUpdated(address indexed operator, uint256 stake);
    event OperatorReputationUpdated(address indexed operator, uint256 reputation);
    event StakingRouterUpdated(address indexed router);

    constructor() Ownable(msg.sender) {}

    modifier onlyStakingRouter() {
        require(msg.sender == stakingRouter, "router");
        _;
    }

    /// @notice update address allowed to push stake changes
    function setStakingRouter(address router) external onlyOwner {
        stakingRouter = router;
        emit StakingRouterUpdated(router);
    }

    /// @notice activate or deactivate an operator
    function setOperatorStatus(address operator, bool active) external onlyOwner {
        _operators[operator].active = active;
        emit OperatorStatusUpdated(operator, active);
    }

    /// @notice set operator reputation score reference
    function setOperatorReputation(address operator, uint256 reputation) external onlyOwner {
        _operators[operator].reputation = reputation;
        emit OperatorReputationUpdated(operator, reputation);
    }

    /// @notice update stake value; callable only by staking router
    function updateStake(address operator, uint256 stake) external onlyStakingRouter {
        _operators[operator].stake = stake;
        emit OperatorStakeUpdated(operator, stake);
    }

    /// @notice return operator metadata
    function getOperator(address operator) external view returns (Operator memory) {
        return _operators[operator];
    }
}

