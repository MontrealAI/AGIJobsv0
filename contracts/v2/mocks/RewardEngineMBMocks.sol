// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IReputationEngineV2} from "../interfaces/IReputationEngineV2.sol";
import {IEnergyOracle} from "../interfaces/IEnergyOracle.sol";
import {AGIALPHA} from "../Constants.sol";

contract MockFeePool is IFeePool, ReentrancyGuard {
    mapping(address => uint256) public rewards;
    uint256 public total;
    IERC20 public immutable token = IERC20(AGIALPHA);

    function version() external pure override returns (uint256) {
        return 2;
    }

    function depositFee(uint256) external override {}

    function distributeFees() external override {}

    function claimRewards() external override {}

    function governanceWithdraw(address, uint256) external override {}

    event Rewarded(address indexed to, uint256 amount);

    function reward(address to, uint256 amount) external override nonReentrant {
        rewards[to] += amount;
        total += amount;
        require(token.transfer(to, amount), "MockFeePool: transfer failed");
        // slither-disable-next-line reentrancy-events
        // Mock contracts support test scenarios; the post-transfer event mirrors
        // production behavior without altering state after the external token call.
        emit Rewarded(to, amount);
    }
}

contract MockReputation is IReputationEngineV2 {
    mapping(address => int256) public deltas;

    function update(address user, int256 delta) external override {
        deltas[user] = delta;
    }
}

contract MockEnergyOracle is IEnergyOracle {
    function verify(Attestation calldata att, bytes calldata) external pure override returns (address) {
        return att.user;
    }

    function isSigner(address) external pure override returns (bool) {
        return true;
    }

    function signerCount() external pure override returns (uint256) {
        return 0;
    }

    function getSigners() external pure override returns (address[] memory) {
        return new address[](0);
    }
}
