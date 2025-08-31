// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AGIALPHA, TOKEN_SCALE, BURN_ADDRESS, AGIALPHA_DECIMALS} from "./Constants.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";

error InvalidPercentage();
error InvalidTreasury();
error InvalidDisputeModule();
error InvalidValidationModule();
error InvalidModule();
error InvalidJobRegistry();
error InvalidParams();
error MaxAGITypesReached();
error OnlyJobRegistry();
error OnlyDisputeModule();
error InsufficientStake();
error InsufficientLocked();
error BelowMinimumStake();
error MaxStakeExceeded();
error JobRegistryNotSet();
error InvalidUser();
error InvalidRole();
error InvalidAmount();
error InvalidRecipient();
error TreasuryNotSet();
error ValidationModuleNotSet();
error NoValidators();
error InsufficientEscrow();
error AGITypeNotFound();
error EtherNotAccepted();
error InvalidTokenDecimals();

/// @title StakeManager
/// @notice Handles staking balances, job escrows and slashing logic.
/// @dev Holds only the staking token and rejects direct ether so neither the
///      contract nor the owner ever custodies funds that could create tax
///      liabilities. All taxes remain the responsibility of employers, agents
///      and validators. All token amounts use 18 decimals where one token is
///      represented by `TOKEN_SCALE` base units.
contract StakeManager is Governable, ReentrancyGuard, TaxAcknowledgement, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @notice participant roles
    enum Role {
        Agent,
        Validator,
        Platform
    }

    /// @notice default minimum stake when constructor param is zero
    uint256 public constant DEFAULT_MIN_STAKE = TOKEN_SCALE;

    /// @notice ERC20 token used for staking and payouts (immutable $AGIALPHA)
    IERC20 public immutable token = IERC20(AGIALPHA);

    /// @notice percentage of released amount sent to FeePool (0-100)
    uint256 public feePct;

    /// @notice percentage of released amount burned (0-100)
    uint256 public burnPct;

    /// @notice percentage of released amount allocated to validators (0-100)
    uint256 public validatorRewardPct;

    /// @notice FeePool receiving protocol fees
    IFeePool public feePool;

    /// @notice address receiving the treasury share of slashed stake
    address public treasury;

    /// @notice JobRegistry contract tracking tax policy acknowledgements
    address public jobRegistry;

    /// @notice ValidationModule providing validator lists
    IValidationModule public validationModule;

    /// @notice minimum required stake
    uint256 public minStake;

    /// @notice percentage of slashed amount sent to employer (out of 100)
    uint256 public employerSlashPct;

    /// @notice percentage of slashed amount sent to treasury (out of 100)
    uint256 public treasurySlashPct;

    /// @notice staked balance per user and role
    mapping(address => mapping(Role => uint256)) public stakes;

    /// @notice aggregate stake per role
    mapping(Role => uint256) public totalStakes;

    /// @notice minimum time-locked stake per user
    mapping(address => uint256) public lockedStakes;

    /// @notice unlock timestamp for a user's locked stake
    mapping(address => uint64) public unlockTime;

    /// @notice maximum total stake allowed per address
    uint256 public maxStakePerAddress;

    /// @notice escrowed job funds
    mapping(bytes32 => uint256) public jobEscrows;

    /// @notice Dispute module authorized to manage dispute fees
    address public disputeModule;

    /// @notice Upper limit on the number of AGI types to prevent excessive gas usage
    uint256 public constant MAX_AGI_TYPES_CAP = 50;

    /// @notice Maximum allowed AGI types to avoid excessive gas
    uint256 public maxAGITypes = MAX_AGI_TYPES_CAP;

    struct AGIType {
        address nft;
        uint256 payoutPct;
    }

    AGIType[] public agiTypes;

    event AGITypeUpdated(address indexed nft, uint256 payoutPct);
    event AGITypeRemoved(address indexed nft);
    event MaxAGITypesUpdated(uint256 oldMax, uint256 newMax);

    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event StakeSlashed(
        address indexed user,
        Role indexed role,
        address indexed employer,
        address treasury,
        uint256 employerShare,
        uint256 treasuryShare,
        uint256 burnShare
    );
    event StakeEscrowLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event StakeReleased(bytes32 indexed jobId, address indexed to, uint256 amount);
    event DisputeFeeLocked(address indexed payer, uint256 amount);
    event DisputeFeePaid(address indexed to, uint256 amount);
    event DisputeModuleUpdated(address indexed module);
    event ValidationModuleUpdated(address indexed module);
    event MinStakeUpdated(uint256 minStake);
    event SlashingPercentagesUpdated(uint256 employerSlashPct, uint256 treasurySlashPct);
    event TreasuryUpdated(address indexed treasury);
    event JobRegistryUpdated(address indexed registry);
    event MaxStakePerAddressUpdated(uint256 maxStake);
    event StakeTimeLocked(address indexed user, uint256 amount, uint64 unlockTime);
    event StakeUnlocked(address indexed user, uint256 amount);
    event ModulesUpdated(address indexed jobRegistry, address indexed disputeModule);
    event FeePctUpdated(uint256 pct);
    event BurnPctUpdated(uint256 pct);
    event ValidatorRewardPctUpdated(uint256 pct);
    event FeePoolUpdated(address indexed feePool);

    /// @notice Deploys the StakeManager.
    /// @param _minStake Minimum stake required to participate. Defaults to
    /// DEFAULT_MIN_STAKE when set to zero.
    /// @param _employerSlashPct Percentage of slashed amount sent to employer
    /// (0-100).
    /// @param _treasurySlashPct Percentage of slashed amount sent to treasury
    /// (0-100).
    /// @param _treasury Address receiving treasury share of slashed stake.
    /// Defaults to deployer when zero address.
    /// @param _jobRegistry JobRegistry enforcing tax acknowledgements.
    /// @param _disputeModule Dispute module authorized to manage dispute fees.
    constructor(
        uint256 _minStake,
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        address _treasury,
        address _jobRegistry,
        address _disputeModule,
        address _timelock // timelock or multisig controller
    ) Governable(_timelock) {
        if (IERC20Metadata(address(token)).decimals() != AGIALPHA_DECIMALS) {
            revert InvalidTokenDecimals();
        }
        minStake = _minStake == 0 ? DEFAULT_MIN_STAKE : _minStake;
        emit MinStakeUpdated(minStake);
        if (_employerSlashPct + _treasurySlashPct == 0) {
            employerSlashPct = 0;
            treasurySlashPct = 100;
        } else {
            if (_employerSlashPct + _treasurySlashPct != 100) {
                revert InvalidPercentage();
            }
            employerSlashPct = _employerSlashPct;
            treasurySlashPct = _treasurySlashPct;
        }
        emit SlashingPercentagesUpdated(employerSlashPct, treasurySlashPct);

        treasury = _treasury == address(0) ? msg.sender : _treasury;
        emit TreasuryUpdated(treasury);
        if (_jobRegistry != address(0)) {
            jobRegistry = _jobRegistry;
        }
        if (_disputeModule != address(0)) {
            disputeModule = _disputeModule;
        }
        if (_jobRegistry != address(0) || _disputeModule != address(0)) {
            emit ModulesUpdated(_jobRegistry, _disputeModule);
        }
    }

    // ---------------------------------------------------------------
    // Owner setters
    // ---------------------------------------------------------------
    // These helpers are intended for manual use via Etherscan's
    // "Write Contract" tab by the authorized owner.

    /// @notice update the minimum stake required
    /// @param _minStake minimum token amount with 18 decimals
    function setMinStake(uint256 _minStake) external onlyGovernance {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @dev internal helper to update slashing percentages
    function _setSlashingPercentages(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct
    ) internal {
        if (
            _employerSlashPct > 100 || _treasurySlashPct > 100
        ) revert InvalidPercentage();
        if (_employerSlashPct + _treasurySlashPct != 100) revert InvalidPercentage();
        employerSlashPct = _employerSlashPct;
        treasurySlashPct = _treasurySlashPct;
        emit SlashingPercentagesUpdated(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update slashing percentage splits
    /// @param _employerSlashPct percentage sent to employer (0-100)
    /// @param _treasurySlashPct percentage sent to treasury (0-100)
    function setSlashingPercentages(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct
    ) external onlyGovernance {
        _setSlashingPercentages(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update slashing percentages (alias)
    /// @param _employerSlashPct percentage sent to employer (0-100)
    /// @param _treasurySlashPct percentage sent to treasury (0-100)
    function setSlashingParameters(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct
    ) external onlyGovernance {
        _setSlashingPercentages(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update treasury recipient address
    /// @param _treasury address receiving treasury slash share
    function setTreasury(address _treasury) external onlyGovernance {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    /// @dev Staking is disabled until a nonzero registry is configured.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    function setJobRegistry(address _jobRegistry) external onlyGovernance {
        jobRegistry = _jobRegistry;
        emit JobRegistryUpdated(_jobRegistry);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    /// @param module module contract allowed to move dispute fees
    function setDisputeModule(address module) external onlyGovernance {
        if (IDisputeModule(module).version() != 2) revert InvalidDisputeModule();
        disputeModule = module;
        emit DisputeModuleUpdated(module);
    }

    /// @notice set the validation module used to source validator lists
    /// @param module ValidationModule contract address
    function setValidationModule(address module) external onlyGovernance {
        if (IValidationModule(module).version() != 2) revert InvalidValidationModule();
        validationModule = IValidationModule(module);
        emit ValidationModuleUpdated(module);
    }

    /// @notice update job registry and dispute module in one call
    /// @dev Staking is disabled until `jobRegistry` is set.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    /// @param _disputeModule module contract allowed to move dispute fees
    function setModules(address _jobRegistry, address _disputeModule)
        external
        onlyGovernance
    {
        if (_jobRegistry == address(0) || _disputeModule == address(0)) revert InvalidModule();
        if (IJobRegistry(_jobRegistry).version() != 2) revert InvalidJobRegistry();
        if (IDisputeModule(_disputeModule).version() != 2) revert InvalidDisputeModule();
        jobRegistry = _jobRegistry;
        disputeModule = _disputeModule;
        emit JobRegistryUpdated(_jobRegistry);
        emit DisputeModuleUpdated(_disputeModule);
        emit ModulesUpdated(_jobRegistry, _disputeModule);
    }

    /// @notice Pause staking and escrow operations
    function pause() external onlyGovernance {
        _pause();
    }

    /// @notice Resume staking and escrow operations
    function unpause() external onlyGovernance {
        _unpause();
    }

    /// @notice update protocol fee percentage
    /// @param pct percentage of released amount sent to FeePool (0-100)
    function setFeePct(uint256 pct) external onlyGovernance {
        if (pct + burnPct + validatorRewardPct > 100) revert InvalidPercentage();
        feePct = pct;
        emit FeePctUpdated(pct);
    }

    /// @notice update FeePool contract
    /// @param pool FeePool receiving protocol fees
    function setFeePool(IFeePool pool) external onlyGovernance {
        feePool = pool;
        emit FeePoolUpdated(address(pool));
    }

    /// @notice update burn percentage applied on release
    /// @param pct percentage of released amount burned (0-100)
    function setBurnPct(uint256 pct) external onlyGovernance {
        if (feePct + pct + validatorRewardPct > 100) revert InvalidPercentage();
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    /// @notice update validator reward percentage
    /// @param pct percentage of released amount allocated to validators (0-100)
    function setValidatorRewardPct(uint256 pct) external onlyGovernance {
        if (feePct + burnPct + pct > 100) revert InvalidPercentage();
        validatorRewardPct = pct;
        emit ValidatorRewardPctUpdated(pct);
    }

    /// @notice set maximum total stake allowed per address (0 disables limit)
    /// @param maxStake cap on combined stake per address using 18 decimals
    function setMaxStakePerAddress(uint256 maxStake) external onlyGovernance {
        maxStakePerAddress = maxStake;
        emit MaxStakePerAddressUpdated(maxStake);
    }

    /// @notice Update the maximum number of AGI types allowed
    function setMaxAGITypes(uint256 newMax) external onlyGovernance {
        require(newMax <= MAX_AGI_TYPES_CAP, "maxAGITypes");
        uint256 old = maxAGITypes;
        maxAGITypes = newMax;
        emit MaxAGITypesUpdated(old, newMax);
    }

    /// @notice Add or update an AGI type NFT bonus
    /// @dev `payoutPct` is expressed as a percentage where `100` represents no
    ///      bonus and values above 100 increase the payout. Values below 100 can
    ///      be used to provide a discount.
    function addAGIType(address nft, uint256 payoutPct) external onlyGovernance {
        if (nft == address(0) || payoutPct == 0) revert InvalidParams();
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ) {
            if (agiTypes[i].nft == nft) {
                agiTypes[i].payoutPct = payoutPct;
                emit AGITypeUpdated(nft, payoutPct);
                return;
            }
            unchecked {
                ++i;
            }
        }
        if (length >= maxAGITypes) revert MaxAGITypesReached();
        agiTypes.push(AGIType({nft: nft, payoutPct: payoutPct}));
        emit AGITypeUpdated(nft, payoutPct);
    }

    /// @notice Remove an AGI type
    function removeAGIType(address nft) external onlyGovernance {
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ) {
            if (agiTypes[i].nft == nft) {
                agiTypes[i] = agiTypes[length - 1];
                agiTypes.pop();
                emit AGITypeRemoved(nft);
                return;
            }
            unchecked {
                ++i;
            }
        }
        revert AGITypeNotFound();
    }

    /// @notice Return all AGI types
    function getAGITypes() external view returns (AGIType[] memory types) {
        types = agiTypes;
    }

    /// @notice Determine the payout percentage for an agent based on AGI type NFTs
    /// @dev Iterates through registered AGI types and selects the highest payout
    ///      percentage from NFTs held by the agent. Reverts from malicious NFT
    ///      contracts are ignored.
    function getAgentPayoutPct(address agent) public view returns (uint256) {
        uint256 highest = 100;
        uint256 length = agiTypes.length;
        for (uint256 i; i < length;) {
            AGIType memory t = agiTypes[i];
            try IERC721(t.nft).balanceOf(agent) returns (uint256 bal) {
                if (bal > 0 && t.payoutPct > highest) {
                    highest = t.payoutPct;
                }
            } catch {
                // ignore tokens with failing balanceOf
            }
            unchecked {
                ++i;
            }
        }
        return highest;
    }

    // ---------------------------------------------------------------
    // staking logic
    // ---------------------------------------------------------------

    /// @notice require caller to acknowledge current tax policy

    modifier onlyJobRegistry() {
        if (msg.sender != jobRegistry) revert OnlyJobRegistry();
        _;
    }

    modifier onlyDisputeModule() {
        if (msg.sender != disputeModule) revert OnlyDisputeModule();
        _;
    }

    /// @notice lock a portion of a user's stake for a period of time
    /// @param user address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockStake(address user, uint256 amount, uint64 lockTime)
        external
        onlyJobRegistry
        whenNotPaused
    {
        uint256 total =
            stakes[user][Role.Agent] +
            stakes[user][Role.Validator] +
            stakes[user][Role.Platform];
        if (total < lockedStakes[user] + amount) revert InsufficientStake();
        uint64 newUnlock = uint64(block.timestamp + lockTime);
        if (newUnlock > unlockTime[user]) {
            unlockTime[user] = newUnlock;
        }
        lockedStakes[user] += amount;
        emit StakeTimeLocked(user, amount, unlockTime[user]);
    }

    /// @notice release previously locked stake for a user
    /// @param user address whose stake is being unlocked
    /// @param amount token amount with 18 decimals to unlock
    function releaseStake(address user, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
    {
        uint256 locked = lockedStakes[user];
        if (locked < amount) revert InsufficientLocked();
        lockedStakes[user] = locked - amount;
        if (lockedStakes[user] == 0) {
            unlockTime[user] = 0;
        }
        emit StakeUnlocked(user, amount);
    }

    /// @dev internal stake deposit routine shared by deposit helpers
    function _deposit(address user, Role role, uint256 amount) internal {
        uint256 newStake = stakes[user][role] + amount;
        if (newStake < minStake) revert BelowMinimumStake();
        if (maxStakePerAddress > 0) {
            uint256 total =
                stakes[user][Role.Agent] +
                stakes[user][Role.Validator] +
                stakes[user][Role.Platform] +
                amount;
            if (total > maxStakePerAddress) revert MaxStakeExceeded();
        }
        stakes[user][role] = newStake;
        totalStakes[role] += amount;
        token.safeTransferFrom(user, address(this), amount);
        emit StakeDeposited(user, role, amount);
    }

    function _policy() internal view returns (ITaxPolicy) {
        address registry = jobRegistry;
        if (registry != address(0)) {
            return IJobRegistryTax(registry).taxPolicy();
        }
        return ITaxPolicy(address(0));
    }

    function _policyFor(address account) internal view returns (ITaxPolicy) {
        if (account != owner()) {
            address registry = jobRegistry;
            if (registry == address(0)) revert JobRegistryNotSet();
            return IJobRegistryTax(registry).taxPolicy();
        }
        return ITaxPolicy(address(0));
    }

    /// @notice deposit stake on behalf of a user for a specific role; use
    ///         `depositStake` when staking for the caller.
    /// @dev Use `depositStake` when the caller is staking for themselves.
    /// @dev `user` must have approved the StakeManager to transfer tokens.
    ///      The caller may be any address (e.g. a helper contract) but the
    ///      user must have acknowledged the current tax policy.
    /// @param user address receiving credit for the stake
    /// @param role participant role for the stake
    /// @param amount token amount with 18 decimals
    function depositStakeFor(address user, Role role, uint256 amount)
        external
        whenNotPaused
        requiresTaxAcknowledgement(
            _policyFor(user),
            user,
            owner(),
            address(0),
            address(0)
        )
        nonReentrant
    {
        if (user == address(0)) revert InvalidUser();
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();

        _deposit(user, role, amount);
    }

    /// @notice deposit stake for caller for a specific role after approving tokens
    /// @param role participant role for the stake
    /// @param amount token amount with 18 decimals; caller must approve first
    function depositStake(Role role, uint256 amount)
        external
        whenNotPaused
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
        nonReentrant
    {
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        if (jobRegistry == address(0)) revert JobRegistryNotSet();
        _deposit(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake in one call.
     * @dev Caller must `approve` this contract to transfer at least `amount`
     *      tokens beforehand. Invoking this helper implicitly accepts the
     *      current tax policy via the associated `JobRegistry`.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndDeposit(Role role, uint256 amount) external whenNotPaused nonReentrant {
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();
        IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        _deposit(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake on behalf of
     *         a user.
     * @dev The `user` must `approve` this contract to transfer at least `amount`
     *      tokens beforehand. Calling this helper implicitly acknowledges the
     *      current tax policy for the `user`.
     * @param user Address receiving credit for the stake.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndDepositFor(
        address user,
        Role role,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidUser();
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();
        IJobRegistryAck(registry).acknowledgeFor(user);
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        _deposit(user, role, amount);
    }

    /// @dev internal stake withdrawal routine shared by withdraw helpers
    function _withdraw(address user, Role role, uint256 amount) internal {
        if (role > Role.Platform) revert InvalidRole();
        uint256 staked = stakes[user][role];
        if (staked < amount) revert InsufficientStake();
        uint256 newStake = staked - amount;
        if (newStake != 0 && newStake < minStake) revert BelowMinimumStake();

        uint256 locked = lockedStakes[user];
        uint64 unlock = unlockTime[user];
        uint256 totalStakeUser =
            stakes[user][Role.Agent] +
            stakes[user][Role.Validator] +
            stakes[user][Role.Platform];
        uint256 remaining = totalStakeUser - amount;
        if (locked > 0) {
            if (block.timestamp < unlock) {
                if (remaining < locked) revert InsufficientLocked();
            } else {
                lockedStakes[user] = 0;
                unlockTime[user] = 0;
                emit StakeUnlocked(user, locked);
            }
        }

        stakes[user][role] = newStake;
        totalStakes[role] -= amount;
        token.safeTransfer(user, amount);
        emit StakeWithdrawn(user, role, amount);
    }

    /**
     * @notice Withdraw previously staked $AGIALPHA for a specific role.
     * @dev Stake must be unlocked and caller must have deposited tokens
     *      beforehand via `approve` + deposit.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Token amount with 18 decimals to withdraw.
     */
    function withdrawStake(Role role, uint256 amount)
        external
        whenNotPaused
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
        nonReentrant
    {
        _withdraw(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake in one call.
     * @dev Caller must have staked tokens previously, which required an `approve`
     *      for this contract. Invoking this helper acknowledges the current tax
     *      policy via the associated `JobRegistry`.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndWithdraw(Role role, uint256 amount) external whenNotPaused nonReentrant {
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();
        IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        _withdraw(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake on behalf
     *         of a user.
     * @dev Caller must be authorized and the `user` must have previously staked
     *      tokens. Invoking this helper acknowledges the current tax policy for
     *      the `user` via the associated `JobRegistry`.
     * @param user Address whose stake is being withdrawn.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndWithdrawFor(
        address user,
        Role role,
        uint256 amount
    ) external onlyGovernance whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidUser();
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();
        IJobRegistryAck(registry).acknowledgeFor(user);
        _withdraw(user, role, amount);
    }

    // ---------------------------------------------------------------
    // job escrow logic
    // ---------------------------------------------------------------

    /// @notice lock job reward funds from an employer for later release via
    ///         `releaseReward` or `finalizeJobFunds`
    /// @param jobId unique job identifier
    /// @param from employer providing the escrow
    /// @param amount token amount with 18 decimals; employer must approve first
    function lockReward(bytes32 jobId, address from, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
    {
        token.safeTransferFrom(from, address(this), amount);
        jobEscrows[jobId] += amount;
        emit StakeEscrowLocked(jobId, from, amount);
    }

    /// @notice Generic escrow lock used when job context is managed externally.
    /// @dev Transfers `amount` tokens from `from` to this contract without
    ///      tracking a job identifier. The caller is expected to account for the
    ///      escrowed balance.
    /// @param from Address providing the funds; must approve first.
    /// @param amount Token amount with 18 decimals to lock.
    function lock(address from, uint256 amount) external onlyJobRegistry whenNotPaused {
        token.safeTransferFrom(from, address(this), amount);
        emit StakeEscrowLocked(bytes32(0), from, amount);
    }

    /// @notice release locked job reward to recipient applying any AGI type bonus
    /// @param jobId unique job identifier
    /// @param to recipient of the release (typically the agent)
    /// @param amount base token amount with 18 decimals before AGI bonus
    function releaseReward(bytes32 jobId, address to, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        uint256 pct = getAgentPayoutPct(to);
        uint256 modified = (amount * pct) / 100;
        uint256 feeAmount = (modified * feePct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - feeAmount - burnAmount;
        uint256 total = payout + feeAmount + burnAmount;
        uint256 escrow = jobEscrows[jobId];
        if (escrow < total) revert InsufficientEscrow();
        jobEscrows[jobId] = escrow - total;

        if (feeAmount > 0) {
            if (address(feePool) != address(0)) {
                token.safeTransfer(address(feePool), feeAmount);
                feePool.depositFee(feeAmount);
                feePool.distributeFees();
                emit StakeReleased(jobId, address(feePool), feeAmount);
            } else {
                token.safeTransfer(BURN_ADDRESS, feeAmount);
                emit StakeReleased(jobId, BURN_ADDRESS, feeAmount);
            }
        }
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit StakeReleased(jobId, BURN_ADDRESS, burnAmount);
        }
        if (payout > 0) {
            token.safeTransfer(to, payout);
            emit StakeReleased(jobId, to, payout);
        }
    }

    /// @notice Release funds previously locked via {lock}.
    /// @dev Does not adjust job-specific escrows; the caller must ensure
    ///      sufficient balance was locked earlier.
    /// @param to Recipient receiving the tokens.
    /// @param amount Base token amount with 18 decimals before AGI bonus.
    function release(address to, uint256 amount) external onlyJobRegistry whenNotPaused {
        // apply AGI type payout modifier
        uint256 pct = getAgentPayoutPct(to);
        uint256 modified = (amount * pct) / 100;

        // apply protocol fees and burn on the modified amount
        uint256 feeAmount = (modified * feePct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - feeAmount - burnAmount;

        if (feeAmount > 0) {
            if (address(feePool) != address(0)) {
                token.safeTransfer(address(feePool), feeAmount);
                feePool.depositFee(feeAmount);
                feePool.distributeFees();
                emit StakeReleased(bytes32(0), address(feePool), feeAmount);
            } else {
                token.safeTransfer(BURN_ADDRESS, feeAmount);
                emit StakeReleased(bytes32(0), BURN_ADDRESS, feeAmount);
            }
        }
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit StakeReleased(bytes32(0), BURN_ADDRESS, burnAmount);
        }
        if (payout > 0) {
            token.safeTransfer(to, payout);
            emit StakeReleased(bytes32(0), to, payout);
        }
    }

    /// @notice finalize a job by paying the agent and forwarding protocol fees
    /// @param jobId unique job identifier
    /// @param agent recipient of the job reward
    /// @param reward base amount paid to the agent with 18 decimals before AGI bonus
    /// @param fee amount forwarded to the fee pool with 18 decimals
    /// @param _feePool fee pool contract receiving protocol fees
    function finalizeJobFunds(
        bytes32 jobId,
        address agent,
        uint256 reward,
        uint256 fee,
        IFeePool _feePool
    ) external onlyJobRegistry whenNotPaused nonReentrant {
        uint256 pct = getAgentPayoutPct(agent);
        uint256 modified = (reward * pct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - burnAmount;
        uint256 total = payout + fee + burnAmount;
        uint256 escrow = jobEscrows[jobId];
        if (escrow < total) revert InsufficientEscrow();
        jobEscrows[jobId] = escrow - total;
        if (payout > 0) {
            token.safeTransfer(agent, payout);
            emit StakeReleased(jobId, agent, payout);
        }
        if (fee > 0) {
            if (address(_feePool) != address(0)) {
                token.safeTransfer(address(_feePool), fee);
                _feePool.depositFee(fee);
                _feePool.distributeFees();
                emit StakeReleased(jobId, address(_feePool), fee);
            } else {
                token.safeTransfer(BURN_ADDRESS, fee);
                emit StakeReleased(jobId, BURN_ADDRESS, fee);
            }
        }
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit StakeReleased(jobId, BURN_ADDRESS, burnAmount);
        }
    }

    /// @notice Distribute validator rewards evenly using the ValidationModule
    /// @param jobId unique job identifier
    /// @param amount total validator reward pool
    function distributeValidatorRewards(bytes32 jobId, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        if (amount == 0) return;
        address vm = address(validationModule);
        if (vm == address(0)) revert ValidationModuleNotSet();
        address[] memory vals = validationModule.validators(uint256(jobId));
        uint256 count = vals.length;
        if (count == 0) revert NoValidators();
        uint256 escrow = jobEscrows[jobId];
        if (escrow < amount) revert InsufficientEscrow();
        jobEscrows[jobId] = escrow - amount;
        uint256 perValidator = amount / count;
        uint256 remainder = amount - perValidator * count;
        for (uint256 i; i < count;) {
            token.safeTransfer(vals[i], perValidator);
            emit StakeReleased(jobId, vals[i], perValidator);
            unchecked {
                ++i;
            }
        }
        if (remainder > 0) {
            token.safeTransfer(vals[0], remainder);
            emit StakeReleased(jobId, vals[0], remainder);
        }
    }

    // ---------------------------------------------------------------
    // dispute fee logic
    // ---------------------------------------------------------------

    /// @notice lock the dispute fee from a payer for later payout via
    ///         `payDisputeFee`
    /// @param payer address providing the fee, must approve first
    /// @param amount token amount with 18 decimals
    function lockDisputeFee(address payer, uint256 amount)
        external
        onlyDisputeModule
        whenNotPaused
        nonReentrant
    {
        token.safeTransferFrom(payer, address(this), amount);
        emit DisputeFeeLocked(payer, amount);
    }

    /// @notice pay a locked dispute fee to the recipient
    /// @param to recipient of the fee payout
    /// @param amount token amount with 18 decimals
    function payDisputeFee(address to, uint256 amount)
        external
        onlyDisputeModule
        whenNotPaused
        nonReentrant
    {
        token.safeTransfer(to, amount);
        emit DisputeFeePaid(to, amount);
    }

    // ---------------------------------------------------------------
    // slashing logic
    // ---------------------------------------------------------------

    /// @dev internal slashing routine used by dispute and job slashing
    function _slash(
        address user,
        Role role,
        uint256 amount,
        address recipient
    ) internal {
        if (role > Role.Platform) revert InvalidRole();
        uint256 staked = stakes[user][role];
        if (staked < amount) revert InsufficientStake();
        if (employerSlashPct + treasurySlashPct != 100) revert InvalidPercentage();

        uint256 employerShare = (amount * employerSlashPct) / 100;
        uint256 treasuryShare = (amount * treasurySlashPct) / 100;
        uint256 burnShare = amount - employerShare - treasuryShare;

        stakes[user][role] = staked - amount;
        totalStakes[role] -= amount;

        uint256 locked = lockedStakes[user];
        if (locked > 0) {
            if (amount >= locked) {
                lockedStakes[user] = 0;
                unlockTime[user] = 0;
                emit StakeUnlocked(user, locked);
            } else {
                lockedStakes[user] = locked - amount;
            }
        }

        if (employerShare > 0) {
            if (recipient == address(0)) revert InvalidRecipient();
            if (recipient == address(feePool) && address(feePool) != address(0)) {
                token.safeTransfer(address(feePool), employerShare);
                feePool.depositFee(employerShare);
                feePool.distributeFees();
            } else {
                token.safeTransfer(recipient, employerShare);
            }
        }
        if (treasuryShare > 0) {
            if (treasury == address(0)) revert TreasuryNotSet();
            token.safeTransfer(treasury, treasuryShare);
        }
        if (burnShare > 0) {
            token.safeTransfer(BURN_ADDRESS, burnShare);
        }

        emit StakeSlashed(
            user,
            role,
            recipient,
            treasury,
            employerShare,
            treasuryShare,
            burnShare
        );
    }

    /// @notice slash stake from a user for a specific role and distribute shares
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 18 decimals to slash
    /// @param employer recipient of the employer share
    function slash(
        address user,
        Role role,
        uint256 amount,
        address employer
    ) external onlyJobRegistry whenNotPaused {
        _slash(user, role, amount, employer);
    }

    /// @notice slash a validator's stake during dispute resolution
    /// @param user address whose stake will be reduced
    /// @param amount token amount with 18 decimals to slash
    /// @param recipient address receiving the slashed share
    function slash(address user, uint256 amount, address recipient)
        external
        onlyDisputeModule
        whenNotPaused
    {
        _slash(user, Role.Validator, amount, recipient);
    }

    /// @notice Return the total stake deposited by a user for a role
    /// @param user address whose stake balance is queried
    /// @param role participant role to query
    function stakeOf(address user, Role role) external view returns (uint256) {
        return stakes[user][role];
    }

    /// @notice Return total stake for a role
    /// @param role participant role to query
    function totalStake(Role role) external view returns (uint256) {
        return totalStakes[role];
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert EtherNotAccepted();
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert EtherNotAccepted();
    }
}

