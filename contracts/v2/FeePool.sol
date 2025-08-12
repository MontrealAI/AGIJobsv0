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

    /// @notice address receiving rounding dust after distribution
    address public treasury;

    /// @notice cumulative fee per staked token scaled by ACCUMULATOR_SCALE
    uint256 public cumulativePerToken;

    /// @notice fees awaiting distribution
    uint256 public pendingFees;

    /// @notice checkpoint of claimed rewards per user
    mapping(address => uint256) public userCheckpoint;

    event FeeDeposited(address indexed from, uint256 amount);
    event FeesDistributed(uint256 amount);
    event Burned(uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event TokenUpdated(address indexed token);
    event StakeManagerUpdated(address indexed stakeManager);
    event RewardRoleUpdated(IStakeManager.Role role);
    event BurnPctUpdated(uint256 pct);
    event TreasuryUpdated(address indexed treasury);
    event RewardTransferred(address indexed to, uint256 amount);

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
        pendingFees += amount;
        emit FeeDeposited(msg.sender, amount);
    }

    /// @notice distribute accumulated fees to stakers
    function distributeFees() external {
        uint256 amount = pendingFees;
        require(amount > 0, "amount");
        pendingFees = 0;

        uint256 burnAmount = (amount * burnPct) / 100;
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit Burned(burnAmount);
        }
        uint256 distribute = amount - burnAmount;
        uint256 total = stakeManager.totalStake(rewardRole);
        require(total > 0, "total stake");
        uint256 perToken = (distribute * ACCUMULATOR_SCALE) / total;
        cumulativePerToken += perToken;
        uint256 accounted = (perToken * total) / ACCUMULATOR_SCALE;
        uint256 dust = distribute - accounted;
        if (dust > 0 && treasury != address(0)) {
            token.safeTransfer(treasury, dust);
        }
        emit FeesDistributed(accounted);
    }

    /// @notice claim accumulated rewards for caller
    function claimRewards() external {
        uint256 stake = stakeManager.stakeOf(msg.sender, rewardRole);
        // Deployer may claim but receives no rewards without stake.
        if (msg.sender == owner() && stake == 0) {
            emit RewardsClaimed(msg.sender, 0);
            return;
        }
        uint256 cumulative = (stake * cumulativePerToken) / ACCUMULATOR_SCALE;
        uint256 owed = cumulative - userCheckpoint[msg.sender];
        userCheckpoint[msg.sender] = cumulative;
        token.safeTransfer(msg.sender, owed);
        emit RewardsClaimed(msg.sender, owed);
    }

    /// @notice transfer tokens to an external reward contract
    /// @param to recipient address
    /// @param amount token amount with 6 decimals
    function transferReward(address to, uint256 amount) external {
        token.safeTransfer(to, amount);
        emit RewardTransferred(to, amount);
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

    /// @notice update treasury address for rounding dust
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
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

