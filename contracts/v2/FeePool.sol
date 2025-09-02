// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AGIALPHA, AGIALPHA_DECIMALS, BURN_ADDRESS} from "./Constants.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

error InvalidPercentage();
error NotStakeManager();
error ZeroAmount();
error EtherNotAccepted();
error InvalidTokenDecimals();
error ZeroAddress();
error InvalidStakeManagerVersion();

/// @title FeePool
/// @notice Accumulates job fees and distributes them to stakers proportionally.
/// @dev All token amounts use 18 decimals. Uses an accumulator scaled by 1e12
///      to avoid precision loss when dividing fees by total stake (30 total
///      decimals, well within `uint256` range).

contract FeePool is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant ACCUMULATOR_SCALE = 1e12;
    uint256 public constant DEFAULT_BURN_PCT = 5;
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @notice ERC20 token used for fees and rewards (immutable $AGIALPHA)
    IERC20 public immutable token = IERC20(AGIALPHA);

    /// @notice StakeManager tracking stakes
    IStakeManager public stakeManager;

    /// @notice role whose stakers receive rewards (defaults to Platform operators)
    IStakeManager.Role public rewardRole;

    /// @notice percentage of each fee burned (out of 100)
    uint256 public burnPct;

    /// @notice address receiving rounding dust after distribution
    address public treasury;

    /// @notice timelock or governance contract authorized for withdrawals
    TimelockController public governance;

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
    event StakeManagerUpdated(address indexed stakeManager);
    event ModulesUpdated(address indexed stakeManager);
    event RewardRoleUpdated(IStakeManager.Role role);
    event BurnPctUpdated(uint256 pct);
    event TreasuryUpdated(address indexed treasury);
    event GovernanceUpdated(address indexed governance);
    event GovernanceWithdrawal(address indexed to, uint256 amount);
    event RewardPoolContribution(address indexed contributor, uint256 amount);

    /// @notice Deploys the FeePool.
    /// @param _stakeManager StakeManager tracking staker balances.
    /// @param _burnPct Percentage of each fee to burn (0-100). Defaults to
    /// DEFAULT_BURN_PCT when set to zero.
    /// @param _treasury Address receiving rounding dust. Defaults to deployer
    /// when zero address.
    constructor(
        IStakeManager _stakeManager,
        uint256 _burnPct,
        address _treasury
    ) Ownable(msg.sender) {
        if (IERC20Metadata(address(token)).decimals() != AGIALPHA_DECIMALS) {
            revert InvalidTokenDecimals();
        }
        uint256 pct = _burnPct == 0 ? DEFAULT_BURN_PCT : _burnPct;
        if (pct > 100) revert InvalidPercentage();

        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
            emit StakeManagerUpdated(address(_stakeManager));
            emit ModulesUpdated(address(_stakeManager));
        }

        rewardRole = IStakeManager.Role.Platform;
        emit RewardRoleUpdated(IStakeManager.Role.Platform);

        burnPct = pct;
        emit BurnPctUpdated(pct);

        treasury = _treasury == address(0) ? msg.sender : _treasury;
        emit TreasuryUpdated(treasury);
    }

    modifier onlyStakeManager() {
        if (msg.sender != address(stakeManager)) revert NotStakeManager();
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance), "governance only");
        _;
    }

    /// @notice account for newly received job fees
    /// @dev assumes `amount` tokens have already been transferred to this
    ///      contract (typically by `StakeManager.finalizeJobFunds`). Only the
    ///      `StakeManager` may call this to keep accounting trustless while the
    ///      registry itself never holds custody of user funds.
    /// @param amount fee amount with 18 decimals
    function depositFee(uint256 amount) external onlyStakeManager nonReentrant {
        if (amount == 0) revert ZeroAmount();
        pendingFees += amount;
        emit FeeDeposited(msg.sender, amount);
    }

    /// @notice Contribute tokens directly to the reward pool.
    /// @param amount token amount with 18 decimals.
    function contribute(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        pendingFees += amount;
        emit RewardPoolContribution(msg.sender, amount);
    }

    /// @notice Distribute accumulated fees to stakers.
    /// @dev All fee amounts use 18 decimal units. Safe to call when no fees are
    ///      pending or when no stake is present; in the latter case funds are
    ///      burned/forwarded to the treasury so non-technical callers never see
    ///      a revert.
    function distributeFees() public nonReentrant {
        _distributeFees();
    }

    function _distributeFees() internal {
        uint256 amount = pendingFees;
        if (amount == 0) {
            return;
        }
        pendingFees = 0;

        uint256 burnAmount = (amount * burnPct) / 100;
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit Burned(burnAmount);
        }
        uint256 distribute = amount - burnAmount;
        uint256 total = stakeManager.totalStake(rewardRole);
        if (total == 0) {
            if (distribute > 0 && treasury != address(0)) {
                token.safeTransfer(treasury, distribute);
            }
            emit FeesDistributed(0);
            return;
        }

        uint256 perToken = (distribute * ACCUMULATOR_SCALE) / total;
        cumulativePerToken += perToken;
        uint256 accounted = (perToken * total) / ACCUMULATOR_SCALE;
        uint256 dust = distribute - accounted;
        if (dust > 0 && treasury != address(0)) {
            token.safeTransfer(treasury, dust);
        }
        emit FeesDistributed(accounted);
    }

    /**
     * @notice Claim accumulated $AGIALPHA rewards for the caller.
     * @dev Invokes the idempotent `distributeFees` so stakers can settle and
     *      claim in a single Etherscan transaction. Rewards use 18‑decimal units.
     */
    function claimRewards() external nonReentrant {
        _distributeFees();
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

    // ---------------------------------------------------------------------
    // Owner and governance setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice designate the timelock or governance contract for withdrawals
    /// @param _governance Timelock or governance address
    function setGovernance(address _governance) external onlyOwner {
        require(_governance != address(0), "governance");
        governance = TimelockController(payable(_governance));
        emit GovernanceUpdated(_governance);
    }

    /// @notice governance-controlled emergency escape hatch to withdraw tokens
    /// @dev Only callable by the configured governance contract. Amount uses 18 decimal units.
    /// @param to recipient address
    /// @param amount token amount with 18 decimals
    function governanceWithdraw(address to, uint256 amount)
        external
        onlyGovernance
        nonReentrant
    {
        token.safeTransfer(to, amount);
        emit GovernanceWithdrawal(to, amount);
    }

    /// @notice update StakeManager contract
    /// @param manager contract orchestrating fee deposits and staking
    function setStakeManager(IStakeManager manager) external onlyOwner {
        if (address(manager) == address(0)) revert ZeroAddress();
        if (manager.version() != version) revert InvalidStakeManagerVersion();
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(manager));
    }

    /// @notice update reward role used for distribution
    /// @param role staker role whose participants earn rewards
    function setRewardRole(IStakeManager.Role role) external onlyOwner {
        rewardRole = role;
        emit RewardRoleUpdated(role);
    }

    /// @notice update percentage of each fee to burn
    /// @param pct percentage of fees burned (0-100)
    function setBurnPct(uint256 pct) external onlyOwner {
        if (pct > 100) revert InvalidPercentage();
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    /// @notice update treasury address for rounding dust
    /// @param _treasury address receiving dust after distribution
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert EtherNotAccepted();
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert EtherNotAccepted();
    }
}

