// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AGIALPHA} from "./Constants.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";

/// @title StakeManager
/// @notice Handles staking balances, job escrows and slashing logic.
/// @dev Holds only the staking token and rejects direct ether so neither the
///      contract nor the owner ever custodies funds that could create tax
///      liabilities. All taxes remain the responsibility of employers, agents
///      and validators. All token amounts are scaled by 1e6 (6 decimals); for
///      instance `2` tokens should be provided as `2_000_000`. Contracts that
///      operate on 18‑decimal tokens must downscale by `1e12`, which may cause
///      precision loss.
contract StakeManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice participant roles
    enum Role {
        Agent,
        Validator,
        Platform
    }

    /// @notice default $AGIALPHA token used when no token is specified
    address public constant DEFAULT_TOKEN = AGIALPHA;

    /// @notice default minimum stake when constructor param is zero
    uint256 public constant DEFAULT_MIN_STAKE = 1e6;

    /// @notice canonical burn address
    address public constant BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;

    /// @notice ERC20 token used for staking and payouts
    IERC20 public token;

    /// @notice percentage of released amount sent to FeePool (0-100)
    uint256 public feePct;

    /// @notice percentage of released amount burned (0-100)
    uint256 public burnPct;

    /// @notice FeePool receiving protocol fees
    IFeePool public feePool;

    /// @notice address receiving the treasury share of slashed stake
    address public treasury;

    /// @notice JobRegistry contract tracking tax policy acknowledgements
    address public jobRegistry;

    /// @notice minimum required stake
    uint256 public minStake;

    /// @notice percentage of slashed amount sent to employer (out of 100)
    uint256 public employerSlashPct;

    /// @notice percentage of slashed amount sent to treasury (out of 100)
    uint256 public treasurySlashPct;

    /// @notice enforce employer+treasury percentages sum to 100 during slashing
    bool public enforceSlashPercentSum100;

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

    /// @notice Maximum allowed AGI types to avoid excessive gas
    uint256 public maxAGITypes = 50;

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
        uint256 treasuryShare
    );
    event JobFundsLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event JobFundsReleased(bytes32 indexed jobId, address indexed to, uint256 amount);
    event DisputeFeeLocked(address indexed payer, uint256 amount);
    event DisputeFeePaid(address indexed to, uint256 amount);
    event DisputeModuleUpdated(address indexed module);
    event TokenUpdated(address indexed newToken);
    event MinStakeUpdated(uint256 minStake);
    event SlashingPercentagesUpdated(uint256 employerSlashPct, uint256 treasurySlashPct);
    event TreasuryUpdated(address indexed treasury);
    event JobRegistryUpdated(address indexed registry);
    event SlashPercentSumEnforcementUpdated(bool enforced);
    event MaxStakePerAddressUpdated(uint256 maxStake);
    event StakeLocked(address indexed user, uint256 amount, uint64 unlockTime);
    event StakeUnlocked(address indexed user, uint256 amount);
    event ModulesUpdated(address indexed jobRegistry, address indexed disputeModule);
    event FeePctUpdated(uint256 pct);
    event BurnPctUpdated(uint256 pct);
    event FeePoolUpdated(address indexed feePool);

    /// @notice Deploys the StakeManager.
    /// @param _token ERC20 token used for staking and payouts. Defaults to
    /// DEFAULT_TOKEN when zero address.
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
        IERC20 _token,
        uint256 _minStake,
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        address _treasury,
        address _jobRegistry,
        address _disputeModule
    ) Ownable(msg.sender) {
        if (address(_token) == address(0)) {
            token = IERC20(DEFAULT_TOKEN);
        } else {
            IERC20Metadata meta = IERC20Metadata(address(_token));
            require(meta.decimals() == 6, "decimals");
            token = _token;
        }
        emit TokenUpdated(address(token));

        minStake = _minStake == 0 ? DEFAULT_MIN_STAKE : _minStake;
        emit MinStakeUpdated(minStake);
        if (_employerSlashPct + _treasurySlashPct == 0) {
            employerSlashPct = 0;
            treasurySlashPct = 100;
        } else {
            require(
                _employerSlashPct + _treasurySlashPct <= 100,
                "pct"
            );
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
    // owner functions
    // ---------------------------------------------------------------

    /// @notice update the staking/payout token
    /// @param newToken ERC20 token address using 6 decimals
    function setToken(IERC20 newToken) external onlyOwner {
        IERC20Metadata meta = IERC20Metadata(address(newToken));
        require(meta.decimals() == 6, "decimals");
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice update the minimum stake required
    /// @param _minStake minimum token amount with 6 decimals
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @notice update slashing percentage splits
    /// @param _employerSlashPct percentage sent to employer (0-100)
    /// @param _treasurySlashPct percentage sent to treasury (0-100)
    function setSlashingPercentages(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct
    ) external onlyOwner {
        require(_employerSlashPct + _treasurySlashPct <= 100, "pct");
        employerSlashPct = _employerSlashPct;
        treasurySlashPct = _treasurySlashPct;
        emit SlashingPercentagesUpdated(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice toggle enforcement that slashing percentages must sum to 100
    /// @param enforced true to require employer+treasury percentages equal 100
    function setSlashPercentSumEnforcement(bool enforced) external onlyOwner {
        enforceSlashPercentSum100 = enforced;
        emit SlashPercentSumEnforcementUpdated(enforced);
    }

    /// @notice update treasury recipient address
    /// @param _treasury address receiving treasury slash share
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    function setJobRegistry(address _jobRegistry) external onlyOwner {
        jobRegistry = _jobRegistry;
        emit JobRegistryUpdated(_jobRegistry);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    /// @param module module contract allowed to move dispute fees
    function setDisputeModule(address module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(module);
    }

    /// @notice update job registry and dispute module in one call
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    /// @param _disputeModule module contract allowed to move dispute fees
    function setModules(address _jobRegistry, address _disputeModule)
        external
        onlyOwner
    {
        require(_jobRegistry != address(0) && _disputeModule != address(0), "module");
        jobRegistry = _jobRegistry;
        disputeModule = _disputeModule;
        emit JobRegistryUpdated(_jobRegistry);
        emit DisputeModuleUpdated(_disputeModule);
        emit ModulesUpdated(_jobRegistry, _disputeModule);
    }

    /// @notice update protocol fee percentage
    /// @param pct percentage of released amount sent to FeePool (0-100)
    function setFeePct(uint256 pct) external onlyOwner {
        require(pct + burnPct <= 100, "pct");
        feePct = pct;
        emit FeePctUpdated(pct);
    }

    /// @notice update FeePool contract
    /// @param pool FeePool receiving protocol fees
    function setFeePool(IFeePool pool) external onlyOwner {
        feePool = pool;
        emit FeePoolUpdated(address(pool));
    }

    /// @notice update burn percentage applied on release
    /// @param pct percentage of released amount burned (0-100)
    function setBurnPct(uint256 pct) external onlyOwner {
        require(feePct + pct <= 100, "pct");
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    /// @notice set maximum total stake allowed per address (0 disables limit)
    /// @param maxStake cap on combined stake per address using 6 decimals
    function setMaxStakePerAddress(uint256 maxStake) external onlyOwner {
        maxStakePerAddress = maxStake;
        emit MaxStakePerAddressUpdated(maxStake);
    }

    /// @notice Update the maximum number of AGI types allowed
    function setMaxAGITypes(uint256 newMax) external onlyOwner {
        uint256 old = maxAGITypes;
        maxAGITypes = newMax;
        emit MaxAGITypesUpdated(old, newMax);
    }

    /// @notice Add or update an AGI type NFT bonus
    /// @dev `payoutPct` is expressed as a percentage where `100` represents no
    ///      bonus and values above 100 increase the payout. Values below 100 can
    ///      be used to provide a discount.
    function addAGIType(address nft, uint256 payoutPct) external onlyOwner {
        require(nft != address(0) && payoutPct > 0, "params");
        for (uint256 i; i < agiTypes.length; ++i) {
            if (agiTypes[i].nft == nft) {
                agiTypes[i].payoutPct = payoutPct;
                emit AGITypeUpdated(nft, payoutPct);
                return;
            }
        }
        require(agiTypes.length < maxAGITypes, "max types");
        agiTypes.push(AGIType({nft: nft, payoutPct: payoutPct}));
        emit AGITypeUpdated(nft, payoutPct);
    }

    /// @notice Remove an AGI type
    function removeAGIType(address nft) external onlyOwner {
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ++i) {
            if (agiTypes[i].nft == nft) {
                agiTypes[i] = agiTypes[length - 1];
                agiTypes.pop();
                emit AGITypeRemoved(nft);
                return;
            }
        }
        revert("AGIType: not found");
    }

    /// @notice Return all AGI types
    function getAGITypes() external view returns (AGIType[] memory types) {
        types = agiTypes;
    }

    /// @notice Determine the highest payout percentage for an agent
    /// @dev Iterates through registered AGI types and selects the highest payout
    ///      percentage from NFTs held by the agent. Reverts from malicious NFT
    ///      contracts are ignored.
    function getHighestPayoutPercentage(address agent) public view returns (uint256) {
        uint256 highest = 100;
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ++i) {
            AGIType memory t = agiTypes[i];
            try IERC721(t.nft).balanceOf(agent) returns (uint256 bal) {
                if (bal > 0 && t.payoutPct > highest) {
                    highest = t.payoutPct;
                }
            } catch {
                // ignore tokens with failing balanceOf
            }
        }
        return highest;
    }

    // ---------------------------------------------------------------
    // staking logic
    // ---------------------------------------------------------------

    /// @notice require caller to acknowledge current tax policy
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            address registry = jobRegistry;
            require(registry != address(0), "job registry");
            IJobRegistryTax reg = IJobRegistryTax(registry);
            require(
                reg.taxAcknowledgedVersion(msg.sender) ==
                    reg.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only job registry");
        _;
    }

    modifier onlyDisputeModule() {
        require(msg.sender == disputeModule, "only dispute");
        _;
    }

    /// @notice lock a portion of a user's stake for a period of time
    /// @param user address whose stake is being locked
    /// @param amount token amount with 6 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockStake(address user, uint256 amount, uint64 lockTime)
        external
        onlyJobRegistry
    {
        uint256 total =
            stakes[user][Role.Agent] +
            stakes[user][Role.Validator] +
            stakes[user][Role.Platform];
        require(total >= lockedStakes[user] + amount, "stake");
        uint64 newUnlock = uint64(block.timestamp + lockTime);
        if (newUnlock > unlockTime[user]) {
            unlockTime[user] = newUnlock;
        }
        lockedStakes[user] += amount;
        emit StakeLocked(user, amount, unlockTime[user]);
    }

    /// @dev internal stake deposit routine shared by deposit helpers
    function _deposit(address user, Role role, uint256 amount) internal {
        uint256 newStake = stakes[user][role] + amount;
        require(newStake >= minStake, "min stake");
        if (maxStakePerAddress > 0) {
            uint256 total =
                stakes[user][Role.Agent] +
                stakes[user][Role.Validator] +
                stakes[user][Role.Platform] +
                amount;
            require(total <= maxStakePerAddress, "max stake");
        }
        stakes[user][role] = newStake;
        totalStakes[role] += amount;
        token.safeTransferFrom(user, address(this), amount);
        emit StakeDeposited(user, role, amount);
    }

    /// @notice deposit stake on behalf of a user for a specific role; use
    ///         `depositStake` when staking for the caller.
    /// @dev Use `depositStake` when the caller is staking for themselves.
    /// @dev `user` must have approved the StakeManager to transfer tokens.
    ///      The caller may be any address (e.g. a helper contract) but the
    ///      user must have acknowledged the current tax policy.
    /// @param user address receiving credit for the stake
    /// @param role participant role for the stake
    /// @param amount token amount with 6 decimals
    function depositStakeFor(address user, Role role, uint256 amount)
        external
        nonReentrant
    {
        require(user != address(0), "user");
        require(role <= Role.Platform, "role");
        require(amount > 0, "amount");

        if (user != owner()) {
            address registry = jobRegistry;
            require(registry != address(0), "job registry");
            IJobRegistryTax reg = IJobRegistryTax(registry);
            require(
                reg.taxAcknowledgedVersion(user) == reg.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _deposit(user, role, amount);
    }

    /// @notice deposit stake for caller for a specific role after approving tokens
    /// @param role participant role for the stake
    /// @param amount token amount with 6 decimals; caller must approve first
    function depositStake(Role role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        require(role <= Role.Platform, "role");
        require(amount > 0, "amount");
        _deposit(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake in one call.
     * @dev Uses 6-decimal base units (1 token = 1_000000). Caller must `approve`
     *      this contract to transfer at least `amount` $AGIALPHA beforehand.
     *      Invoking this helper implicitly accepts the current tax policy via the
     *      associated `JobRegistry`.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeAndDeposit(Role role, uint256 amount) external nonReentrant {
        address registry = jobRegistry;
        require(registry != address(0), "registry");
        IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        require(role <= Role.Platform, "role");
        require(amount > 0, "amount");
        _deposit(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake on behalf of
     *         a user.
     * @dev Uses 6-decimal base units. The `user` must `approve` this contract to
     *      transfer at least `amount` tokens beforehand. Calling this helper
     *      implicitly acknowledges the current tax policy for the `user`.
     * @param user Address receiving credit for the stake.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeAndDepositFor(
        address user,
        Role role,
        uint256 amount
    ) external nonReentrant {
        require(user != address(0), "user");
        address registry = jobRegistry;
        require(registry != address(0), "registry");
        IJobRegistryAck(registry).acknowledgeFor(user);
        require(role <= Role.Platform, "role");
        require(amount > 0, "amount");
        _deposit(user, role, amount);
    }

    /// @dev internal stake withdrawal routine shared by withdraw helpers
    function _withdraw(address user, Role role, uint256 amount) internal {
        require(role <= Role.Platform, "role");
        uint256 staked = stakes[user][role];
        require(staked >= amount, "stake");
        uint256 newStake = staked - amount;
        require(newStake == 0 || newStake >= minStake, "min stake");

        uint256 locked = lockedStakes[user];
        uint64 unlock = unlockTime[user];
        uint256 totalStakeUser =
            stakes[user][Role.Agent] +
            stakes[user][Role.Validator] +
            stakes[user][Role.Platform];
        uint256 remaining = totalStakeUser - amount;
        if (locked > 0) {
            if (block.timestamp < unlock) {
                require(remaining >= locked, "locked");
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
     * @dev Uses 6-decimal base units (1 token = 1_000000). Stake must be unlocked
     *      and caller must have deposited tokens beforehand via `approve` +
     *      deposit.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Token amount with 6 decimals to withdraw.
     */
    function withdrawStake(Role role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        _withdraw(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake in one call.
     * @dev Uses 6-decimal base units. Caller must have staked tokens previously,
     *      which required an `approve` for this contract. Invoking this helper
     *      acknowledges the current tax policy via the associated `JobRegistry`.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeAndWithdraw(Role role, uint256 amount) external nonReentrant {
        address registry = jobRegistry;
        require(registry != address(0), "registry");
        IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        _withdraw(msg.sender, role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake on behalf of a user.
     * @dev Uses 6-decimal base units. Caller must be authorized and the `user` must
     *      have previously staked tokens. Invoking this helper acknowledges the
     *      current tax policy for the `user` via the associated `JobRegistry`.
     * @param user Address whose stake is being withdrawn.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeAndWithdrawFor(
        address user,
        Role role,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(user != address(0), "user");
        address registry = jobRegistry;
        require(registry != address(0), "registry");
        IJobRegistryAck(registry).acknowledgeFor(user);
        _withdraw(user, role, amount);
    }

    // ---------------------------------------------------------------
    // job escrow logic
    // ---------------------------------------------------------------

    /// @notice lock job funds from an employer for later release via
    ///         `releaseJobFunds` or `finalizeJobFunds`
    /// @param jobId unique job identifier
    /// @param from employer providing the escrow
    /// @param amount token amount with 6 decimals; employer must approve first
    function lockJobFunds(bytes32 jobId, address from, uint256 amount)
        external
        onlyJobRegistry
    {
        token.safeTransferFrom(from, address(this), amount);
        jobEscrows[jobId] += amount;
        emit JobFundsLocked(jobId, from, amount);
    }

    /// @notice Generic escrow lock used when job context is managed externally.
    /// @dev Transfers `amount` tokens from `from` to this contract without
    ///      tracking a job identifier. The caller is expected to account for the
    ///      escrowed balance.
    /// @param from Address providing the funds; must approve first.
    /// @param amount Token amount with 6 decimals to lock.
    function lock(address from, uint256 amount) external onlyJobRegistry {
        token.safeTransferFrom(from, address(this), amount);
        emit JobFundsLocked(bytes32(0), from, amount);
    }

    /// @notice release locked job funds to recipient applying any AGI type bonus
    /// @param jobId unique job identifier
    /// @param to recipient of the release (typically the agent)
    /// @param amount base token amount with 6 decimals before AGI bonus
    function releaseJobFunds(bytes32 jobId, address to, uint256 amount)
        external
        onlyJobRegistry
    {
        uint256 pct = getHighestPayoutPercentage(to);
        uint256 payout = (amount * pct) / 100;
        uint256 escrow = jobEscrows[jobId];
        require(escrow >= payout, "escrow");
        jobEscrows[jobId] = escrow - payout;
        token.safeTransfer(to, payout);
        emit JobFundsReleased(jobId, to, payout);
    }

    /// @notice Release funds previously locked via {lock}.
    /// @dev Does not adjust job-specific escrows; the caller must ensure
    ///      sufficient balance was locked earlier.
    /// @param to Recipient receiving the tokens.
    /// @param amount Token amount with 6 decimals to release.
    function release(address to, uint256 amount) external onlyJobRegistry {
        uint256 feeAmount = (amount * feePct) / 100;
        uint256 burnAmount = (amount * burnPct) / 100;
        uint256 payout = amount - feeAmount - burnAmount;
        if (feeAmount > 0 && address(feePool) != address(0)) {
            token.safeTransfer(address(feePool), feeAmount);
            feePool.depositFee(feeAmount);
            feePool.distributeFees();
            emit JobFundsReleased(bytes32(0), address(feePool), feeAmount);
        }
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
            emit JobFundsReleased(bytes32(0), BURN_ADDRESS, burnAmount);
        }
        if (payout > 0) {
            token.safeTransfer(to, payout);
            emit JobFundsReleased(bytes32(0), to, payout);
        }
    }

    /// @notice finalize a job by paying the agent and forwarding protocol fees
    /// @param jobId unique job identifier
    /// @param agent recipient of the job reward
    /// @param reward base amount paid to the agent with 6 decimals before AGI bonus
    /// @param fee amount forwarded to the fee pool with 6 decimals
    /// @param _feePool fee pool contract receiving protocol fees
    function finalizeJobFunds(
        bytes32 jobId,
        address agent,
        uint256 reward,
        uint256 fee,
        IFeePool _feePool
    ) external onlyJobRegistry {
        uint256 pct = getHighestPayoutPercentage(agent);
        uint256 payout = (reward * pct) / 100;
        uint256 total = payout + fee;
        uint256 escrow = jobEscrows[jobId];
        require(escrow >= total, "escrow");
        jobEscrows[jobId] = escrow - total;
        if (payout > 0) {
            token.safeTransfer(agent, payout);
            emit JobFundsReleased(jobId, agent, payout);
        }
        if (fee > 0 && address(_feePool) != address(0)) {
            token.safeTransfer(address(_feePool), fee);
            _feePool.depositFee(fee);
            _feePool.distributeFees();
            emit JobFundsReleased(jobId, address(_feePool), fee);
        }
    }

    // ---------------------------------------------------------------
    // dispute fee logic
    // ---------------------------------------------------------------

    /// @notice lock the dispute fee from a payer for later payout via
    ///         `payDisputeFee`
    /// @param payer address providing the fee, must approve first
    /// @param amount token amount with 6 decimals
    function lockDisputeFee(address payer, uint256 amount)
        external
        onlyDisputeModule
        nonReentrant
    {
        token.safeTransferFrom(payer, address(this), amount);
        emit DisputeFeeLocked(payer, amount);
    }

    /// @notice pay a locked dispute fee to the recipient
    /// @param to recipient of the fee payout
    /// @param amount token amount with 6 decimals
    function payDisputeFee(address to, uint256 amount)
        external
        onlyDisputeModule
        nonReentrant
    {
        token.safeTransfer(to, amount);
        emit DisputeFeePaid(to, amount);
    }

    // ---------------------------------------------------------------
    // slashing logic
    // ---------------------------------------------------------------

    /// @notice slash stake from a user for a specific role and distribute shares
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 6 decimals to slash
    /// @param employer recipient of the employer share
    function slash(address user, Role role, uint256 amount, address employer)
        external
        onlyJobRegistry
    {
        require(role <= Role.Platform, "role");
        uint256 staked = stakes[user][role];
        require(staked >= amount, "stake");

        uint256 employerShare = (amount * employerSlashPct) / 100;
        uint256 treasuryShare = (amount * treasurySlashPct) / 100;
        uint256 total = employerShare + treasuryShare;

        if (enforceSlashPercentSum100) {
            require(total == amount, "pct");
        }

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
            token.safeTransfer(employer, employerShare);
        }
        if (treasuryShare > 0) {
            token.safeTransfer(treasury, treasuryShare);
        }

        emit StakeSlashed(user, role, employer, treasury, employerShare, treasuryShare);
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
        revert("StakeManager: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("StakeManager: no ether");
    }
}

