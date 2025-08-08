// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakeManager
/// @notice Handles staking balances, job escrows and slashing logic.
contract StakeManager is Ownable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for staking and payouts
    IERC20 public token;

    /// @notice address receiving the treasury share of slashed stake
    address public treasury;

    /// @notice minimum required stake
    uint256 public minStake;

    /// @notice percentage of slashed amount sent to employer (out of 100)
    uint256 public employerSlashPct;

    /// @notice percentage of slashed amount sent to treasury (out of 100)
    uint256 public treasurySlashPct;

    /// @notice staked balance per user
    mapping(address => uint256) public stakes;

    /// @notice escrowed job rewards
    mapping(bytes32 => uint256) public rewardEscrows;

    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event StakeSlashed(
        address indexed user,
        address indexed employer,
        address indexed treasury,
        uint256 employerShare,
        uint256 treasuryShare
    );
    event RewardLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event RewardReleased(bytes32 indexed jobId, address indexed to, uint256 amount);

    constructor(IERC20 _token, address owner, address _treasury) Ownable(owner) {
        token = _token;
        treasury = _treasury;
    }

    // ---------------------------------------------------------------
    // owner functions
    // ---------------------------------------------------------------

    /// @notice update the staking/payout token
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
    }

    /// @notice update the minimum stake required
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
    }

    /// @notice update slashing percentage splits
    function setSlashingPercentages(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct
    ) external onlyOwner {
        require(_employerSlashPct + _treasurySlashPct <= 100, "pct");
        employerSlashPct = _employerSlashPct;
        treasurySlashPct = _treasurySlashPct;
    }

    /// @notice update treasury recipient address
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    // ---------------------------------------------------------------
    // staking logic
    // ---------------------------------------------------------------

    /// @notice deposit stake for caller
    function depositStake(uint256 amount) external {
        require(amount > 0, "amount");
        uint256 newStake = stakes[msg.sender] + amount;
        require(newStake >= minStake, "min stake");
        stakes[msg.sender] = newStake;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeDeposited(msg.sender, amount);
    }

    /// @notice withdraw available stake
    function withdrawStake(uint256 amount) external {
        uint256 staked = stakes[msg.sender];
        require(staked >= amount, "stake");
        uint256 newStake = staked - amount;
        require(newStake == 0 || newStake >= minStake, "min stake");
        stakes[msg.sender] = newStake;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------
    // job escrow logic
    // ---------------------------------------------------------------

    /// @notice lock reward for a job from an employer
    function lockReward(bytes32 jobId, address from, uint256 amount)
        external
        onlyOwner
    {
        token.safeTransferFrom(from, address(this), amount);
        rewardEscrows[jobId] += amount;
        emit RewardLocked(jobId, from, amount);
    }

    /// @notice release locked reward to recipient
    function releaseReward(bytes32 jobId, address to, uint256 amount)
        external
        onlyOwner
    {
        uint256 escrow = rewardEscrows[jobId];
        require(escrow >= amount, "escrow");
        rewardEscrows[jobId] = escrow - amount;
        token.safeTransfer(to, amount);
        emit RewardReleased(jobId, to, amount);
    }

    // ---------------------------------------------------------------
    // slashing logic
    // ---------------------------------------------------------------

    /// @notice slash stake from a user and distribute shares
    function slash(address user, uint256 amount, address employer) external onlyOwner {
        uint256 staked = stakes[user];
        require(staked >= amount, "stake");

        uint256 employerShare = (amount * employerSlashPct) / 100;
        uint256 treasuryShare = (amount * treasurySlashPct) / 100;
        uint256 total = employerShare + treasuryShare;

        stakes[user] = staked - total;

        if (employerShare > 0) {
            token.safeTransfer(employer, employerShare);
        }
        if (treasuryShare > 0) {
            token.safeTransfer(treasury, treasuryShare);
        }

        emit StakeSlashed(user, employer, treasury, employerShare, treasuryShare);
    }
}

