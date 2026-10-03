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
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {Thermostat} from "./Thermostat.sol";
import {IHamiltonian} from "./interfaces/IHamiltonian.sol";

import "./implementation/StakeManagerBase.sol";
import "./implementation/FixedDelegate.sol";

/// @notice StakeManager with immutable, separately deployed implementations.
contract StakeManager is StakeManagerBase, FixedDelegate {
    error SafeERC20FailedOperation(address token);
    // Preserve delegated custom errors in the public controller ABI.
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
    error InvalidMinStake();
    error InvalidUnbondingPeriod();
    error InvalidRecipient();
    error TreasuryNotSet();
    error ValidationModuleNotSet();
    error NoValidators();
    error InsufficientEscrow();
    error InsufficientRewardPool();
    error AGITypeNotFound();
    error EtherNotAccepted();
    error InvalidTokenDecimals();
    error InvalidFeePool();
    error MaxAGITypesExceeded();
    error MaxAGITypesBelowCurrent();
    error UnbondPending();
    error NoUnbond();
    error UnbondLocked();
    error Jailed();
    error PendingPenalty();
    error TokenNotBurnable();
    error Unauthorized();
    error NotGovernanceOrPauserManager();

    address private immutable _configuration;
    address private immutable _staking;
    address private immutable _escrow;
    address private immutable _slashing;

    /// @notice Deploys the StakeManager.
    /// @param _minStake Minimum stake required to participate. Defaults to
    /// DEFAULT_MIN_STAKE when set to zero.
    /// @param _employerSlashPct Percentage of the slashed amount sent to employer (0-100 or 0-10_000).
    /// @param _treasurySlashPct Percentage of the slashed amount sent to treasury (0-100 or 0-10_000).
    /// @param _treasury Address receiving treasury share of slashed stake. Use zero
    /// address to burn the treasury portion.
    /// @param _jobRegistry JobRegistry enforcing tax acknowledgements.
    /// @param _disputeModule Dispute module authorized to manage dispute fees.
    constructor(
        uint256 _minStake,
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        address _treasury,
        address _jobRegistry,
        address _disputeModule,
        address _timelock, // timelock or multisig controller
        address[4] memory implementations
    ) StakeManagerBase(_timelock) {
        _configuration = _checkedImplementation(implementations[0], keccak256("StakeManagerConfiguration:v1"));
        _staking = _checkedImplementation(implementations[1], keccak256("StakeManagerStaking:v1"));
        _escrow = _checkedImplementation(implementations[2], keccak256("StakeManagerEscrow:v1"));
        _slashing = _checkedImplementation(implementations[3], keccak256("StakeManagerSlashing:v1"));

        if (IERC20Metadata(address(token)).decimals() != AGIALPHA_DECIMALS) {
            revert InvalidTokenDecimals();
        }
        minStake = _minStake == 0 ? DEFAULT_MIN_STAKE : _minStake;
        emit MinStakeUpdated(minStake);
        _emitParametersUpdate();
        uint16 employerPctBps = _toBps(_employerSlashPct);
        uint16 treasuryPctBps = _toBps(_treasurySlashPct);
        if (employerPctBps + treasuryPctBps == 0) {
            employerSlashPct = 0;
            treasurySlashPct = 100;
        } else {
            if (uint256(employerPctBps) + uint256(treasuryPctBps) != SLASH_BPS_DENOMINATOR) {
                revert InvalidPercentage();
            }
            employerSlashPct = _employerSlashPct;
            treasurySlashPct = _treasurySlashPct;
        }
        burnSlashPct = 0;
        emit SlashingPercentagesUpdated(employerSlashPct, treasurySlashPct);
        _emitParametersUpdate();

        if (_treasury != address(0) && _treasury == owner()) {
            revert InvalidTreasury();
        }
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
        if (_jobRegistry != address(0)) {
            jobRegistry = _jobRegistry;
        }
        if (_disputeModule != address(0)) {
            disputeModule = _disputeModule;
        }
        if (_jobRegistry != address(0) || _disputeModule != address(0)) {
            emit ModulesUpdated(_jobRegistry, _disputeModule);
        }
        minStakeFloor = minStake;
        lastStakeTune = block.timestamp;
    }

    function implementationModules() external view returns (address[4] memory) {
        return [_configuration, _staking, _escrow, _slashing];
    }

    function setPauser(address _pauser) external {
        _delegate(_configuration);
    }

    function setPauserManager(address manager) external {
        _delegate(_configuration);
    }

    function setThermostat(address _thermostat) external {
        _delegate(_configuration);
    }

    function setHamiltonianFeed(address _feed) external {
        _delegate(_configuration);
    }

    /// @notice enable or disable automatic tuning of minStake based on disputes
    /// @param enabled true to enable auto tuning
    function autoTuneStakes(bool enabled) external {
        _delegate(_configuration);
    }

    /// @notice configure parameters used for automatic stake tuning
    /// @param threshold dispute count triggering a stake increase
    /// @param upPct percentage increase applied when threshold is exceeded
    /// @param downPct percentage decrease applied when no disputes occur
    /// @param window observation period for dispute counting
    /// @param floor minimum value that minStake can reach
    /// @param ceil maximum value that minStake can reach (0 disables cap)
    function configureAutoStake(
        uint256 threshold,
        uint256 upPct,
        uint256 downPct,
        uint256 window,
        uint256 floor,
        uint256 ceil,
        int256 tempThreshold,
        int256 hThreshold,
        uint256 disputeW,
        uint256 tempW,
        uint256 hamW
    ) external {
        _delegate(_configuration);
    }

    /// @notice record a dispute occurrence for auto stake tuning
    /// @dev disabled while the contract is paused
    function recordDispute() external {
        _delegate(_configuration);
    }

    /// @notice trigger stake evaluation if the tuning window has elapsed
    /// @dev disabled while the contract is paused
    function checkpointStake() external {
        _delegate(_configuration);
    }

    /// @notice update the minimum stake override for a specific role
    /// @param role participant role whose override should change
    /// @param amount minimum stake in 18 decimal tokens (0 disables the override)
    function setRoleMinimum(Role role, uint256 amount) external {
        _delegate(_configuration);
    }

    /// @notice update minimum stake overrides for all roles in a single call
    /// @param agent minimum stake for agents (0 disables override)
    /// @param validator minimum stake for validators (0 disables override)
    /// @param platform minimum stake for platforms (0 disables override)
    function setRoleMinimums(uint256 agent, uint256 validator, uint256 platform) external {
        _delegate(_configuration);
    }

    /// @notice update the minimum stake required
    /// @param _minStake minimum token amount with 18 decimals
    function setMinStake(uint256 _minStake) external {
        _delegate(_configuration);
    }

    /// @notice update the full slashing distribution using either whole percents or basis points
    /// @param employerSlashPctBps share sent to employers (0-100 or 0-10_000)
    /// @param treasurySlashPctBps share sent to the treasury (0-100 or 0-10_000)
    /// @param validatorSlashPctBps share distributed to validators (0-100 or 0-10_000)
    /// @param operatorSlashPctBps share allocated to the operator reward pool (0-100 or 0-10_000)
    /// @param burnSlashPctBps share burned directly (0-100 or 0-10_000)
    function setSlashPercents(
        uint16 employerSlashPctBps,
        uint16 treasurySlashPctBps,
        uint16 validatorSlashPctBps,
        uint16 operatorSlashPctBps,
        uint16 burnSlashPctBps
    ) public {
        _delegate(_configuration);
    }

    /// @notice update slashing percentage splits
    /// @param _employerSlashPct percentage sent to employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to treasury (0-100 or 0-10_000)
    function setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) external {
        _delegate(_configuration);
    }

    /// @notice update slashing percentages (alias)
    /// @param _employerSlashPct percentage sent to employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to treasury (0-100 or 0-10_000)
    function setSlashingParameters(uint256 _employerSlashPct, uint256 _treasurySlashPct) external {
        _delegate(_configuration);
    }

    /// @notice update the validator share of slashed stakes
    /// @param _validatorSlashPct percentage of the total slashed amount distributed to validators (0-100 or 0-10_000)
    function setValidatorSlashRewardPct(uint256 _validatorSlashPct) external {
        _delegate(_configuration);
    }

    /// @notice update the full slashing distribution across employer, treasury and validators
    /// @param _employerSlashPct percentage sent to the employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to the treasury (0-100 or 0-10_000)
    /// @param _validatorSlashPct percentage sent to validators (0-100 or 0-10_000)
    function setSlashingDistribution(uint256 _employerSlashPct, uint256 _treasurySlashPct, uint256 _validatorSlashPct)
        external
    {
        _delegate(_configuration);
    }

    /// @notice update the operator share of slashed stakes
    /// @param _operatorSlashPct percentage of the total slashed amount added to the operator reward pool (0-100 or 0-10_000)
    function setOperatorSlashPct(uint256 _operatorSlashPct) external {
        _delegate(_configuration);
    }

    /// @notice update the full slashing distribution across employer, treasury, operator reward pool and validators
    /// @param _employerSlashPct percentage sent to the employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to the treasury (0-100 or 0-10_000)
    /// @param _operatorSlashPct percentage sent to the operator reward pool (0-100 or 0-10_000)
    /// @param _validatorSlashPct percentage sent to validators (0-100 or 0-10_000)
    function setSlashDistribution(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        uint256 _operatorSlashPct,
        uint256 _validatorSlashPct
    ) external {
        _delegate(_configuration);
    }

    /// @notice update treasury recipient address
    /// @dev Treasury must be zero (burn) or an allowlisted address distinct from the owner
    /// @param _treasury address receiving treasury slash share
    function setTreasury(address _treasury) external {
        _delegate(_configuration);
    }

    /// @notice Allow or disallow a treasury address
    /// @param _treasury Treasury candidate
    /// @param allowed True to allow, false to revoke
    function setTreasuryAllowlist(address _treasury, bool allowed) external {
        _delegate(_configuration);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    /// @dev Staking is disabled until a nonzero registry is configured.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    function setJobRegistry(address _jobRegistry) external {
        _delegate(_configuration);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    /// @param module module contract allowed to move dispute fees
    function setDisputeModule(address module) external {
        _delegate(_configuration);
    }

    /// @notice set the validation module used to source validator lists
    /// @param module ValidationModule contract address
    function setValidationModule(address module) external {
        _delegate(_configuration);
    }

    /// @notice update the allowlist of additional validator lock managers
    /// @param manager address permitted to manage validator stake locks
    /// @param allowed true to allow, false to revoke
    function setValidatorLockManager(address manager, bool allowed) external {
        _delegate(_configuration);
    }

    /// @notice update job registry and dispute module in one call
    /// @dev Staking is disabled until `jobRegistry` is set.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    /// @param _disputeModule module contract allowed to move dispute fees
    function setModules(address _jobRegistry, address _disputeModule) external {
        _delegate(_configuration);
    }

    /// @notice Pause staking and escrow operations
    function pause() external {
        _delegate(_configuration);
    }

    /// @notice Resume staking and escrow operations
    function unpause() external {
        _delegate(_configuration);
    }

    /// @notice update protocol fee percentage
    /// @param pct percentage of released amount sent to FeePool (0-100)
    function setFeePct(uint256 pct) external {
        _delegate(_configuration);
    }

    /// @notice update FeePool contract
    /// @param pool FeePool receiving protocol fees
    function setFeePool(IFeePool pool) external {
        _delegate(_configuration);
    }

    /// @notice update burn percentage applied on release
    /// @param pct percentage of released amount burned (0-100)
    function setBurnPct(uint256 pct) external {
        _delegate(_configuration);
    }

    /// @notice update validator reward percentage
    /// @param pct percentage of released amount allocated to validators (0-100)
    function setValidatorRewardPct(uint256 pct) external {
        _delegate(_configuration);
    }

    /// @notice update the unbonding period for withdrawals
    /// @param newPeriod duration in seconds tokens remain locked after withdrawal request
    function setUnbondingPeriod(uint256 newPeriod) external {
        _delegate(_configuration);
    }

    /// @notice set maximum total stake allowed per address (0 disables limit)
    /// @param maxStake cap on combined stake per address using 18 decimals
    function setMaxStakePerAddress(uint256 maxStake) external {
        _delegate(_configuration);
    }

    /// @notice set recommended minimum and maximum stake values
    /// @dev `newMax` may be zero to disable the limit but must not be below `newMin`
    /// @param newMin recommended minimum stake with 18 decimals
    /// @param newMax recommended maximum total stake per address with 18 decimals
    function setStakeRecommendations(uint256 newMin, uint256 newMax) external {
        _delegate(_configuration);
    }

    /// @notice Update the maximum number of AGI types allowed
    function setMaxAGITypes(uint256 newMax) external {
        _delegate(_configuration);
    }

    /// @notice Update the maximum total payout percentage across AGI types
    function setMaxTotalPayoutPct(uint256 newMax) external {
        _delegate(_configuration);
    }

    /// @notice Apply a batch of configuration updates in a single transaction.
    /// @param config Packed configuration toggles and values to apply. Supports pausing/unpausing via
    ///        the `pause` and `unpause` flags for faster incident response.
    /// @param allowlistUpdates Treasury allowlist entries to update before applying setters.
    function applyConfiguration(ConfigUpdate calldata config, TreasuryAllowlistUpdate[] calldata allowlistUpdates)
        external
    {
        _delegate(_configuration);
    }

    /// @notice Add or update an AGI type NFT bonus
    /// @dev `payoutPct` is expressed as a percentage where `100` represents no
    ///      bonus, values above `100` increase the payout and values below `100`
    ///      can provide a discount. The percentage must not exceed
    ///      {MAX_PAYOUT_PCT}.
    function addAGIType(address nft, uint256 payoutPct) external {
        _delegate(_configuration);
    }

    /// @notice Remove an AGI type
    function removeAGIType(address nft) external {
        _delegate(_configuration);
    }

    /// @notice lock a portion of a user's stake for a period of time
    /// @param user address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockStake(address user, uint256 amount, uint64 lockTime) external {
        _delegate(_staking);
    }

    /// @notice release previously locked stake for a user
    /// @param user address whose stake is being unlocked
    /// @param amount token amount with 18 decimals to unlock
    function releaseStake(address user, uint256 amount) external {
        _delegate(_staking);
    }

    /// @notice lock validator stake for a validation round
    /// @param jobId identifier of the job requesting validation
    /// @param user validator address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockValidatorStake(uint256 jobId, address user, uint256 amount, uint64 lockTime) external {
        _delegate(_staking);
    }

    /// @notice release validator stake locked for validation
    /// @param jobId identifier of the job releasing the lock
    /// @param user validator address whose stake is being unlocked
    /// @param amount token amount with 18 decimals to unlock
    function unlockValidatorStake(uint256 jobId, address user, uint256 amount) external {
        _delegate(_staking);
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
    function depositStakeFor(address user, Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /// @notice deposit stake for caller for a specific role after approving tokens
    /// @param role participant role for the stake
    /// @param amount token amount with 18 decimals; caller must approve first
    function depositStake(Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake in one call.
     * @dev Caller must `approve` this contract to transfer at least `amount`
     *      tokens beforehand. Invoking this helper implicitly accepts the
     *      current tax policy via the associated `JobRegistry`.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndDeposit(Role role, uint256 amount) external {
        _delegate(_staking);
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
    function acknowledgeAndDepositFor(address user, Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /// @notice request withdrawal of staked tokens subject to unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake
    /// @param amount token amount with 18 decimals to withdraw
    function requestWithdraw(Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /// @notice finalize a previously requested withdrawal after unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake being withdrawn
    function finalizeWithdraw(Role role) external {
        _delegate(_staking);
    }

    /**
     * @notice Withdraw previously staked $AGIALPHA for a specific role.
     * @dev Stake must be unlocked and caller must have deposited tokens
     *      beforehand via `approve` + deposit.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Token amount with 18 decimals to withdraw.
     */
    function withdrawStake(Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake in one call.
     * @dev Caller must have staked tokens previously, which required an `approve`
     *      for this contract. Invoking this helper acknowledges the current tax
     *      policy via the associated `JobRegistry`.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndWithdraw(Role role, uint256 amount) external {
        _delegate(_staking);
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
    function acknowledgeAndWithdrawFor(address user, Role role, uint256 amount) external {
        _delegate(_staking);
    }

    /// @notice lock job reward funds from an employer for later release via
    ///         `releaseReward` or `finalizeJobFunds`
    /// @param jobId unique job identifier
    /// @param from employer providing the escrow
    /// @param amount token amount with 18 decimals; employer must approve first
    function lockReward(bytes32 jobId, address from, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice Generic escrow lock used when job context is managed externally.
    /// @dev Transfers `amount` tokens from `from` to this contract without
    ///      tracking a job identifier. The caller is expected to account for the
    ///      escrowed balance.
    /// @param from Address providing the funds; must approve first.
    /// @param amount Token amount with 18 decimals to lock.
    function lock(address from, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice release locked job reward to recipient applying any AGI type bonus
    /// @param jobId unique job identifier
    /// @param employer employer responsible for burns
    /// @param to recipient of the release (typically the agent)
    /// @param amount base token amount with 18 decimals before AGI bonus
    /// @dev Deposits fees into the FeePool without distributing them;
    ///      an external process should call `FeePool.distributeFees()`
    ///      periodically to settle rewards.
    /// @param applyBoost When true, applies AGI NFT payout multipliers to `amount`.
    function releaseReward(bytes32 jobId, address employer, address to, uint256 amount, bool applyBoost) external {
        _delegate(_escrow);
    }

    /// @notice Refund escrowed funds to the employer without applying fees or burns.
    /// @param jobId Unique job identifier whose escrow is refunded.
    /// @param to Recipient of the refund.
    /// @param amount Token amount with 18 decimals to refund.
    function refundEscrow(bytes32 jobId, address to, uint256 amount) external {
        _delegate(_escrow);
    }

    function redistributeEscrow(bytes32 jobId, address recipient, uint256 amount) external {
        _delegate(_escrow);
    }

    function redistributeEscrow(bytes32 jobId, address recipient, uint256 amount, address[] calldata validators)
        external
    {
        _delegate(_escrow);
    }

    /// @notice Release funds previously locked via {lock}.
    /// @dev Does not adjust job-specific escrows; the caller must ensure
    ///      sufficient balance was locked earlier. Fees accumulate in the
    ///      FeePool until `FeePool.distributeFees()` is called separately.
    /// @param employer address providing burn approval
    /// @param to Recipient receiving the tokens.
    /// @param amount Base token amount with 18 decimals before AGI bonus.
    /// @param applyBoost When true, applies AGI NFT payout multipliers to `amount`.
    function release(address employer, address to, uint256 amount, bool applyBoost) external {
        _delegate(_escrow);
    }

    /// @notice finalize a job by paying the agent and forwarding protocol fees
    /// @param jobId unique job identifier
    /// @param employer address of the employer triggering finalization
    /// @param agent recipient of the job reward
    /// @param reward base amount paid to the agent with 18 decimals before AGI bonus
    /// @param fee amount forwarded to the fee pool with 18 decimals
    /// @param _feePool fee pool contract receiving protocol fees
    /// @param byGovernance true when governance is forcing finalization
    function finalizeJobFunds(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool _feePool,
        bool byGovernance
    ) external {
        _delegate(_escrow);
    }

    function finalizeJobFundsWithPct(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 agentPct,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool _feePool,
        bool byGovernance
    ) external {
        _delegate(_escrow);
    }

    /// @notice fund the operator reward pool
    /// @param amount token amount with 18 decimals to add
    function fundOperatorRewardPool(uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice withdraw tokens from the operator reward pool
    /// @param to recipient of the tokens
    /// @param amount token amount with 18 decimals to withdraw
    function withdrawOperatorRewardPool(address to, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice Distribute validator rewards evenly using the ValidationModule
    /// @param jobId unique job identifier
    /// @param amount total validator reward pool
    function distributeValidatorRewards(bytes32 jobId, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice lock the dispute fee from a payer for later payout via
    ///         `payDisputeFee`
    /// @param payer address providing the fee, must approve first
    /// @param amount token amount with 18 decimals
    function lockDisputeFee(address payer, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice pay a locked dispute fee to the recipient
    /// @param to recipient of the fee payout
    /// @param amount token amount with 18 decimals
    function payDisputeFee(address to, uint256 amount) external {
        _delegate(_escrow);
    }

    /// @notice slash stake from a user for a specific role and distribute shares
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 18 decimals to slash
    /// @param employer recipient of the employer share
    function slash(address user, Role role, uint256 amount, address employer) external {
        _delegate(_slashing);
    }

    function slash(address user, Role role, uint256 amount, address employer, address[] calldata validators) external {
        _delegate(_slashing);
    }

    /// @notice slash a validator's stake during dispute resolution
    /// @param user address whose stake will be reduced
    /// @param amount token amount with 18 decimals to slash
    /// @param recipient address receiving the slashed share
    function slash(address user, uint256 amount, address recipient) external {
        _delegate(_slashing);
    }

    function slash(address user, uint256 amount, address recipient, address[] calldata validators) external {
        _delegate(_slashing);
    }

    /// @notice Governance-controlled emergency slashing helper.
    /// @dev Allows the timelock controller to claw back a percentage of stake
    ///      from a malicious participant and redirect it to a beneficiary.
    /// @param user Address of the staker whose funds are being slashed.
    /// @param role Stake role being slashed.
    /// @param pctBps Percentage of the user's stake to slash expressed in basis points (1/100 of a percent).
    /// @param beneficiary Address receiving the employer share of the slash.
    /// @return amount Amount of tokens removed from the user's stake (18 decimals).
    function governanceSlash(address user, Role role, uint256 pctBps, address beneficiary)
        external
        returns (uint256 amount)
    {
        _delegate(_slashing);
    }

    /// @notice Recalculate a user's boosted stake after NFT changes
    /// @param user address whose boosted stake is being updated
    /// @param role participant role for the stake
    function syncBoostedStake(address user, Role role) public {
        _delegate(_staking);
    }
}
