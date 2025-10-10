// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";
import {AGIALPHA, AGIALPHA_DECIMALS, BURN_ADDRESS} from "./Constants.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";

error InvalidPercentage();
error NotStakeManager();
error ZeroAmount();
error EtherNotAccepted();
error InvalidTokenDecimals();
error ZeroAddress();
error InvalidStakeManagerVersion();
error TokenNotBurnable();
error InvalidTreasury();
error InvalidTaxPolicy();
error InvalidRecipient();
error PolicyNotTaxExempt();
/// @dev Attempted to transfer rewards that overlap with reserved pending fees.
error InsufficientRewardBalance();
/// @dev Caller is not the governance contract.
error NotGovernance();
/// @dev Caller is neither the owner nor the designated pauser.
error NotOwnerOrPauser();
/// @dev Caller not authorized to reward.
error NotRewarder();
error NotOwnerOrPauserManager();

/// @title FeePool
/// @notice Accumulates job fees and distributes them to stakers proportionally.
/// @dev All token amounts use 18 decimals. Uses an accumulator scaled by 1e12
///      to avoid precision loss when dividing fees by total stake (30 total
///      decimals, well within `uint256` range).

contract FeePool is Ownable, Pausable, ReentrancyGuard, TaxAcknowledgement {
    using SafeERC20 for IERC20;

    uint256 public constant ACCUMULATOR_SCALE = 1e12;
    uint256 public constant DEFAULT_BURN_PCT = 1;
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
    /// @notice Allowlisted treasury addresses permitted to receive dust
    mapping(address => bool) public treasuryAllowlist;
    /// @notice Total amount distributed to each treasury address
    mapping(address => uint256) public treasuryRewards;

    /// @notice timelock or governance contract authorized for withdrawals
    TimelockController public governance;
    address public pauser;
    address public pauserManager;

    /// @notice tax policy governing user interactions
    ITaxPolicy public taxPolicy;

    /// @notice cumulative fee per staked token scaled by ACCUMULATOR_SCALE
    uint256 public cumulativePerToken;

    /// @notice fees awaiting distribution
    uint256 public pendingFees;

    /// @notice checkpoint of claimed rewards per user
    mapping(address => uint256) public userCheckpoint;

    /// @notice addresses allowed to call reward
    mapping(address => bool) public rewarders;

    struct ConfigUpdate {
        bool setStakeManager;
        IStakeManager stakeManager;
        bool setRewardRole;
        IStakeManager.Role rewardRole;
        bool setBurnPct;
        uint256 burnPct;
        bool setTreasury;
        address treasury;
        bool setGovernance;
        address governance;
        bool setTaxPolicy;
        ITaxPolicy taxPolicy;
        bool setPauser;
        address pauser;
        bool setPauserManager;
        address pauserManager;
    }

    struct AllowlistUpdate {
        address treasury;
        bool allowed;
    }

    struct RewarderConfig {
        address rewarder;
        bool allowed;
    }

    event FeeDeposited(address indexed from, uint256 amount);
    event FeesDistributed(uint256 amount);
    event FeesBurned(address indexed caller, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event StakeManagerUpdated(address indexed stakeManager);
    event ModulesUpdated(address indexed stakeManager);
    event RewardRoleUpdated(IStakeManager.Role role);
    event BurnPctUpdated(uint256 pct);
    event TreasuryUpdated(address indexed treasury);
    event TreasuryAllowlistUpdated(address indexed treasury, bool allowed);
    event GovernanceUpdated(address indexed governance);
    event GovernanceWithdrawal(address indexed to, uint256 amount);
    event RewardPoolContribution(address indexed contributor, uint256 amount);
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);
    event TaxPolicyUpdated(address indexed policy);
    event RewarderUpdated(address indexed rewarder, bool allowed);
    event TreasuryRewarded(address indexed treasury, uint256 amount);
    event ConfigurationApplied(
        address indexed caller,
        bool stakeManagerUpdated,
        bool rewardRoleUpdated,
        bool burnPctUpdated,
        bool treasuryUpdated,
        bool governanceUpdated,
        bool taxPolicyUpdated,
        bool pauserUpdated,
        bool pauserManagerUpdated,
        uint256 rewarderUpdates,
        uint256 treasuryAllowlistUpdates
    );

    modifier onlyOwnerOrPauser() {
        if (msg.sender != owner() && msg.sender != pauser) {
            revert NotOwnerOrPauser();
        }
        _;
    }

    function setPauser(address _pauser) external {
        if (msg.sender != owner() && msg.sender != pauserManager) {
            revert NotOwnerOrPauserManager();
        }
        _setPauser(_pauser);
    }

    function setPauserManager(address manager) external onlyOwner {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }

    /// @notice Authorize an address to distribute rewards.
    function setRewarder(address rewarder, bool allowed) external onlyOwner {
        _setRewarder(rewarder, allowed);
    }

    /// @notice Deploys the FeePool.
    /// @param _stakeManager StakeManager tracking staker balances.
    /// @param _burnPct Percentage of each fee to burn (0-100). Defaults to
    /// DEFAULT_BURN_PCT when set to zero.
    /// @param _treasury Address receiving rounding dust. Must be explicitly
    /// provided and may be the zero address to burn residual fees.
    /// @param _taxPolicy Address of the TaxPolicy contract governing
    ///        contributions and withdrawals.
    constructor(IStakeManager _stakeManager, uint256 _burnPct, address _treasury, ITaxPolicy _taxPolicy)
        Ownable(msg.sender)
    {
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

        if (_treasury != address(0)) {
            if (_treasury == msg.sender) {
                revert InvalidTreasury();
            }
            treasuryAllowlist[_treasury] = true;
            emit TreasuryAllowlistUpdated(_treasury, true);
            treasury = _treasury;
        }
        emit TreasuryUpdated(_treasury);

        if (address(_taxPolicy) != address(0)) {
            if (!_taxPolicy.isTaxExempt()) revert PolicyNotTaxExempt();
            taxPolicy = _taxPolicy;
            emit TaxPolicyUpdated(address(_taxPolicy));
        }
    }

    modifier onlyStakeManager() {
        if (msg.sender != address(stakeManager)) revert NotStakeManager();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != address(governance)) revert NotGovernance();
        _;
    }

    /// @notice account for newly received job fees
    /// @dev assumes `amount` tokens have already been transferred to this
    ///      contract (typically by `StakeManager.finalizeJobFunds`). Only the
    ///      `StakeManager` may call this to keep accounting trustless while the
    ///      registry itself never holds custody of user funds.
    /// @param amount fee amount with 18 decimals
    function depositFee(uint256 amount) external onlyStakeManager whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 burnAmount = (amount * burnPct) / 100;
        if (burnAmount > 0) {
            _burnFees(msg.sender, burnAmount);
        }
        uint256 netAmount = amount - burnAmount;
        if (netAmount > 0) {
            pendingFees += netAmount;
        }
        emit FeeDeposited(msg.sender, amount);
    }

    /// @notice Contribute tokens directly to the reward pool.
    /// @param amount token amount with 18 decimals.
    function contribute(uint256 amount)
        external
        whenNotPaused
        requiresTaxAcknowledgement(taxPolicy, msg.sender, owner(), address(stakeManager), address(0))
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        pendingFees += amount;
        emit RewardPoolContribution(msg.sender, amount);
    }

    /// @notice Transfer reward tokens to a recipient. Callable by authorised rewarders.
    /// @param to address receiving the reward
    /// @param amount token amount with 18 decimals
    function reward(address to, uint256 amount) external whenNotPaused nonReentrant {
        if (!rewarders[msg.sender]) revert NotRewarder();
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();
        uint256 totalBalance = token.balanceOf(address(this));
        if (totalBalance <= pendingFees) revert InsufficientRewardBalance();
        uint256 available = totalBalance - pendingFees;
        if (amount > available) revert InsufficientRewardBalance();
        token.safeTransfer(to, amount);
        if (to == treasury) {
            treasuryRewards[to] += amount;
            emit TreasuryRewarded(to, amount);
        }
    }

    /// @notice Distribute accumulated fees to stakers.
    /// @dev All fee amounts use 18 decimal units. Safe to call when no fees are
    ///      pending or when no stake is present; in the latter case funds are
    ///      burned/forwarded to the treasury so non-technical callers never see
    ///      a revert.
    function distributeFees()
        public
        whenNotPaused
        requiresTaxAcknowledgement(taxPolicy, msg.sender, owner(), address(stakeManager), address(0))
        nonReentrant
    {
        stakeManager.syncBoostedStake(msg.sender, rewardRole);
        _distributeFees();
    }

    function _distributeFees() internal {
        uint256 amount = pendingFees;
        if (amount == 0) return;
        pendingFees = 0;

        uint256 total = stakeManager.totalBoostedStake(rewardRole);
        if (total == 0) {
            if (amount > 0) {
                _burnFees(msg.sender, amount);
            }
            emit FeesDistributed(0);
            return;
        }
        bool burnDust = treasury == address(0) || treasury == owner();

        uint256 perToken = (amount * ACCUMULATOR_SCALE) / total;
        cumulativePerToken += perToken;
        uint256 accounted = (perToken * total) / ACCUMULATOR_SCALE;
        uint256 dust = amount - accounted;
        if (dust > 0) {
            if (burnDust) {
                _burnFees(msg.sender, dust);
            } else {
                token.safeTransfer(treasury, dust);
            }
        }
        emit FeesDistributed(accounted);
    }

    function _burnFees(address caller, uint256 amt) internal {
        if (BURN_ADDRESS == address(0)) {
            try IERC20Burnable(address(token)).burn(amt) {
                emit FeesBurned(caller, amt);
            } catch {
                revert TokenNotBurnable();
            }
        } else {
            token.safeTransfer(BURN_ADDRESS, amt);
            emit FeesBurned(caller, amt);
        }
    }

    /**
     * @notice Claim accumulated $AGIALPHA rewards for the caller.
     * @dev Invokes the idempotent `distributeFees` so stakers can settle and
     *      claim in a single Etherscan transaction. Rewards use 18‑decimal units.
     */
    function claimRewards()
        external
        requiresTaxAcknowledgement(taxPolicy, msg.sender, owner(), address(stakeManager), address(0))
        nonReentrant
    {
        stakeManager.syncBoostedStake(msg.sender, rewardRole);
        _distributeFees();
        uint256 stake = stakeManager.stakeOf(msg.sender, rewardRole);
        // Deployer may claim but receives no rewards without stake.
        if (msg.sender == owner() && stake == 0) {
            emit RewardsClaimed(msg.sender, 0);
            return;
        }
        uint256 pct = stakeManager.getTotalPayoutPct(msg.sender);
        uint256 boosted = (stake * pct) / 100;
        uint256 cumulative = (boosted * cumulativePerToken) / ACCUMULATOR_SCALE;
        uint256 owed = cumulative - userCheckpoint[msg.sender];
        userCheckpoint[msg.sender] = cumulative;
        token.safeTransfer(msg.sender, owed);
        emit RewardsClaimed(msg.sender, owed);
    }

    /// @notice Return a user's stake weighted by their NFT multiplier.
    /// @dev Facilitates off-chain calculations of boosted rewards.
    /// @param user address being queried
    /// @return amount stake multiplied by the user's payout percentage
    function boostedStake(address user) external view returns (uint256 amount) {
        uint256 stake = stakeManager.stakeOf(user, rewardRole);
        uint256 pct = stakeManager.getTotalPayoutPct(user);
        amount = (stake * pct) / 100;
    }

    // ---------------------------------------------------------------------
    // Owner and governance setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice designate the timelock or governance contract for withdrawals
    /// @param _governance Timelock or governance address
    function setGovernance(address _governance) external onlyOwner {
        _setGovernance(_governance);
    }

    /// @notice governance-controlled emergency escape hatch to withdraw tokens
    /// @notice Withdraw fees under governance control to burn or fund the community treasury.
    /// @dev Caller must acknowledge the current tax policy. `to` must be either
    /// the BURN_ADDRESS or `treasury` and may not be the zero address or the
    /// contract owner.
    /// @param to recipient address
    /// @param amount token amount with 18 decimals
    function governanceWithdraw(address to, uint256 amount)
        external
        onlyGovernance
        requiresTaxAcknowledgement(taxPolicy, msg.sender, owner(), address(stakeManager), address(0))
        nonReentrant
    {
        if (to == owner()) revert InvalidRecipient();

        if (to == BURN_ADDRESS) {
            if (BURN_ADDRESS == address(0)) {
                try IERC20Burnable(address(token)).burn(amount) {
                    emit GovernanceWithdrawal(to, amount);
                } catch {
                    revert TokenNotBurnable();
                }
            } else {
                token.safeTransfer(BURN_ADDRESS, amount);
                emit GovernanceWithdrawal(to, amount);
            }
            return;
        }

        if (to == address(0) || to != treasury) revert InvalidRecipient();
        token.safeTransfer(to, amount);
        emit GovernanceWithdrawal(to, amount);
    }

    /// @notice update StakeManager contract
    /// @param manager contract orchestrating fee deposits and staking
    function setStakeManager(IStakeManager manager) external onlyOwner {
        _setStakeManager(manager);
    }

    /// @notice update reward role used for distribution
    /// @param role staker role whose participants earn rewards
    function setRewardRole(IStakeManager.Role role) external onlyOwner {
        _setRewardRole(role);
    }

    /// @notice update percentage of each fee to burn
    /// @param pct percentage of fees burned (0-100)
    function setBurnPct(uint256 pct) external onlyOwner {
        _setBurnPct(pct);
    }

    /// @notice update treasury address for rounding dust
    /// @param _treasury address receiving dust after distribution
    function setTreasury(address _treasury) external onlyOwner {
        _setTreasury(_treasury);
    }

    /// @notice Allow or disallow a treasury address
    /// @param _treasury Treasury candidate
    /// @param allowed True to allow, false to revoke
    function setTreasuryAllowlist(address _treasury, bool allowed) external onlyOwner {
        _setTreasuryAllowlist(_treasury, allowed);
    }

    /// @notice update the tax policy contract
    /// @param _policy address of the TaxPolicy contract
    function setTaxPolicy(ITaxPolicy _policy) external onlyOwner {
        _setTaxPolicy(_policy);
    }

    function _setPauser(address _pauser) internal {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function _setRewarder(address rewarder, bool allowed) internal {
        rewarders[rewarder] = allowed;
        emit RewarderUpdated(rewarder, allowed);
    }

    function _setGovernance(address _governance) internal {
        if (_governance == address(0)) revert ZeroAddress();
        governance = TimelockController(payable(_governance));
        emit GovernanceUpdated(_governance);
    }

    function _setStakeManager(IStakeManager manager) internal {
        if (address(manager) == address(0)) revert ZeroAddress();
        if (manager.version() != version) revert InvalidStakeManagerVersion();
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(manager));
    }

    function _setRewardRole(IStakeManager.Role role) internal {
        rewardRole = role;
        emit RewardRoleUpdated(role);
    }

    function _setBurnPct(uint256 pct) internal {
        if (pct > 100) revert InvalidPercentage();
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    function _setTreasury(address _treasury) internal {
        if (_treasury == owner()) revert InvalidTreasury();
        if (_treasury != address(0) && !treasuryAllowlist[_treasury]) {
            revert InvalidTreasury();
        }
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function _setTreasuryAllowlist(address _treasury, bool allowed) internal {
        treasuryAllowlist[_treasury] = allowed;
        emit TreasuryAllowlistUpdated(_treasury, allowed);
    }

    function _setTaxPolicy(ITaxPolicy _policy) internal {
        if (address(_policy) == address(0)) revert InvalidTaxPolicy();
        if (!_policy.isTaxExempt()) revert PolicyNotTaxExempt();
        taxPolicy = _policy;
        emit TaxPolicyUpdated(address(_policy));
    }

    /**
     * @notice Atomically apply multiple configuration updates.
     * @dev Processes allowlist and rewarder updates before setters so newly
     *      authorised addresses can be referenced in the same transaction.
     * @param config Packed configuration toggles and values.
     * @param allowlistUpdates Treasury allowlist modifications to apply.
     * @param rewarderUpdates Rewarder allow/deny list updates to apply.
     */
    function applyConfiguration(
        ConfigUpdate calldata config,
        AllowlistUpdate[] calldata allowlistUpdates,
        RewarderConfig[] calldata rewarderUpdates
    ) external onlyOwner {
        uint256 allowlistLen = allowlistUpdates.length;
        for (uint256 i; i < allowlistLen; i++) {
            AllowlistUpdate calldata update = allowlistUpdates[i];
            _setTreasuryAllowlist(update.treasury, update.allowed);
        }

        uint256 rewarderLen = rewarderUpdates.length;
        for (uint256 i; i < rewarderLen; i++) {
            RewarderConfig calldata entry = rewarderUpdates[i];
            _setRewarder(entry.rewarder, entry.allowed);
        }

        bool stakeManagerChanged;
        bool rewardRoleChanged;
        bool burnPctChanged;
        bool treasuryChanged;
        bool governanceChanged;
        bool taxPolicyChanged;
        bool pauserChanged;
        bool pauserManagerChanged;

        if (config.setStakeManager) {
            _setStakeManager(config.stakeManager);
            stakeManagerChanged = true;
        }

        if (config.setRewardRole) {
            _setRewardRole(config.rewardRole);
            rewardRoleChanged = true;
        }

        if (config.setBurnPct) {
            _setBurnPct(config.burnPct);
            burnPctChanged = true;
        }

        if (config.setTreasury) {
            _setTreasury(config.treasury);
            treasuryChanged = true;
        }

        if (config.setGovernance) {
            _setGovernance(config.governance);
            governanceChanged = true;
        }

        if (config.setTaxPolicy) {
            _setTaxPolicy(config.taxPolicy);
            taxPolicyChanged = true;
        }

        if (config.setPauser) {
            _setPauser(config.pauser);
            pauserChanged = true;
        }

        if (config.setPauserManager) {
            pauserManager = config.pauserManager;
            emit PauserManagerUpdated(config.pauserManager);
            pauserManagerChanged = true;
        }

        emit ConfigurationApplied(
            msg.sender,
            stakeManagerChanged,
            rewardRoleChanged,
            burnPctChanged,
            treasuryChanged,
            governanceChanged,
            taxPolicyChanged,
            pauserChanged,
            pauserManagerChanged,
            rewarderLen,
            allowlistLen
        );
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    function unpause() external onlyOwnerOrPauser {
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
