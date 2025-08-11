// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title FeePool
/// @notice Accumulates job fees and distributes them to stakers proportionally.
/// @dev All token amounts use 6 decimals. Uses an accumulator scaled by 1e12
///      to avoid precision loss when dividing fees by total stake.

contract FeePool is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant ACCUMULATOR_SCALE = 1e12;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice ERC20 token used for fees and rewards
    IERC20 public token;

    /// @notice StakeManager tracking stakes
    IStakeManager public stakeManager;

    /// @notice role whose stakers receive rewards
    IStakeManager.Role public rewardRole;

    /// @notice percentage of each fee burned (out of 100)
    uint256 public burnPct;

    /// @notice cumulative fee per staked token scaled by ACCUMULATOR_SCALE
    uint256 public cumulativePerToken;

    /// @notice checkpoint of claimed rewards per user
    mapping(address => uint256) public userCheckpoint;

    event FeeDeposited(address indexed from, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event TokenUpdated(address indexed token);
    event StakeManagerUpdated(address indexed stakeManager);
    event RewardRoleUpdated(IStakeManager.Role role);
    event BurnPctUpdated(uint256 pct);

    constructor(
        IERC20 _token,
        IStakeManager _stakeManager,
        IStakeManager.Role _role,
        address owner
    ) Ownable(owner) {
        token = _token;
        stakeManager = _stakeManager;
        rewardRole = _role;
    }

    modifier onlyStakeManager() {
        require(msg.sender == address(stakeManager), "only stake manager");
        _;
    }

    /// @notice account for newly received job fees
    /// @dev assumes `amount` tokens have already been transferred to this
    ///      contract (typically by `StakeManager.finalizeJobFunds`). Only the
    ///      `StakeManager` may call this to keep accounting trustless while the
    ///      registry itself never holds custody of user funds.
    /// @param amount fee amount scaled to 6 decimals
    function depositFee(uint256 amount) external onlyStakeManager {
        require(amount > 0, "amount");
        uint256 burnAmount = (amount * burnPct) / 100;
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
        }
        uint256 distribute = amount - burnAmount;
        uint256 total = stakeManager.totalStake(rewardRole);
        require(total > 0, "total stake");
        cumulativePerToken += (distribute * ACCUMULATOR_SCALE) / total;
        emit FeeDeposited(msg.sender, distribute);
    }

    /// @notice claim accumulated rewards for caller
    function claimRewards() external {
        uint256 stake = stakeManager.stakeOf(msg.sender, rewardRole);
        uint256 cumulative = (stake * cumulativePerToken) / ACCUMULATOR_SCALE;
        uint256 owed = cumulative - userCheckpoint[msg.sender];
        userCheckpoint[msg.sender] = cumulative;
        token.safeTransfer(msg.sender, owed);
        emit RewardsClaimed(msg.sender, owed);
    }

    /// @notice update ERC20 token used for payouts
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice update StakeManager contract
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    /// @notice update reward role used for distribution
    function setRewardRole(IStakeManager.Role role) external onlyOwner {
        rewardRole = role;
        emit RewardRoleUpdated(role);
    }

    /// @notice update percentage of each fee to burn
    function setBurnPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("FeePool: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("FeePool: no ether");
    }
}

