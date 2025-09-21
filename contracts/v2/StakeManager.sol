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

    /// @notice time tokens remain locked after a withdraw request
    uint256 public unbondingPeriod = 7 days;

    /// @notice ERC20 token used for staking and payouts (immutable $AGIALPHA)
    IERC20 public immutable token = IERC20(AGIALPHA);

    /// @notice percentage of released amount sent to FeePool (0-100)
    uint256 public feePct;

    /// @notice percentage of released amount burned (0-100)
    uint256 public burnPct;

    /// @notice percentage of released amount allocated to validators (0-100)
    uint256 public validatorRewardPct;

    /// @notice maximum number of validators processed per slashing call
    uint256 public constant MAX_VALIDATORS = 50;

    /// @notice FeePool receiving protocol fees
    IFeePool public feePool;

    /// @notice address receiving the treasury share of slashed stake
    address public treasury;

    /// @notice Allowlisted treasury addresses permitted to receive slashed funds
    mapping(address => bool) public treasuryAllowlist;

    /// @notice JobRegistry contract tracking tax policy acknowledgements
    address public jobRegistry;

    address public pauser;

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

    /// @notice aggregate boosted stake per role including AGI type bonuses
    mapping(Role => uint256) private totalBoostedStakes;

    /// @notice cached boosted stake per user and role
    mapping(address => mapping(Role => uint256)) private boostedStake;

    /// @notice minimum time-locked stake per user
    mapping(address => uint256) public lockedStakes;

    /// @notice unlock timestamp for a user's locked stake
    mapping(address => uint64) public unlockTime;

    struct Unbond {
        uint256 amt;
        uint64 unlockAt;
        bool jailed;
    }

    /// @notice pending withdraw requests per user
    mapping(address => Unbond) public unbonds;

    /// @notice maximum total stake allowed per address
    uint256 public maxStakePerAddress;

    /// @notice escrowed job funds
    mapping(bytes32 => uint256) public jobEscrows;

    /// @notice pool used to cover operator-funded reward bonuses
    uint256 public operatorRewardPool;

    /// @notice Dispute module authorized to manage dispute fees
    address public disputeModule;

    /// @notice whether automatic stake tuning is enabled
    bool public autoStakeTuning;

    /// @notice number of disputes seen in the current tuning window
    uint256 public disputeCount;

    /// @notice timestamp of the last stake adjustment
    uint256 public lastStakeTune;

    /// @notice duration of the observation window for dispute counts
    uint256 public stakeTuneWindow = 1 weeks;

    /// @notice dispute count threshold that triggers a stake increase
    uint256 public stakeDisputeThreshold = 10;

    /// @notice percentage increment applied to minStake when threshold exceeded
    uint256 public stakeIncreasePct = 20;

    /// @notice percentage decrement applied to minStake when no disputes occur
    uint256 public stakeDecreasePct = 10;

    /// @notice floor for automatically tuned minStake
    uint256 public minStakeFloor = DEFAULT_MIN_STAKE;

    /// @notice ceiling for automatically tuned minStake (0 disables the cap)
    uint256 public maxMinStake;

    /// @notice Thermostat contract providing system temperature
    Thermostat public thermostat;

    /// @notice Hamiltonian feed supplying system energy metric
    IHamiltonian public hamiltonianFeed;

    /// @notice temperature threshold that triggers stake increase
    int256 public stakeTempThreshold;

    /// @notice Hamiltonian threshold that triggers stake increase
    int256 public stakeHamiltonianThreshold;

    /// @notice weights applied to dispute count, temperature and Hamiltonian
    uint256 public disputeWeight = 1;
    uint256 public temperatureWeight;
    uint256 public hamiltonianWeight;

    /// @notice Upper limit on the number of AGI types to prevent excessive gas usage
    uint256 public constant MAX_AGI_TYPES_CAP = 50;

    /// @notice Maximum allowed payout percentage for AGI types (100 = no boost)
    uint256 public constant MAX_PAYOUT_PCT = 200;

    /// @notice Configurable cap on the total payout percentage across all AGI types
    uint256 public maxTotalPayoutPct = MAX_PAYOUT_PCT;

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
    event MaxTotalPayoutPctUpdated(uint256 oldMax, uint256 newMax);
    event AutoStakeTuningEnabled(bool enabled);
    event AutoStakeConfigUpdated(
        uint256 threshold,
        uint256 upPct,
        uint256 downPct,
        uint256 window,
        uint256 floor,
        uint256 ceil,
        int256 tempThreshold,
        int256 hThreshold,
        uint256 disputeWeight,
        uint256 tempWeight,
        uint256 hamWeight
    );
    event ThermostatUpdated(address indexed thermostat);
    event HamiltonianFeedUpdated(address indexed feed);

    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event WithdrawRequested(address indexed user, Role indexed role, uint256 amount, uint64 unlockAt);
    event StakeSlashed(
        address indexed user,
        Role role,
        address indexed employer,
        address indexed treasury,
        uint256 employerShare,
        uint256 treasuryShare,
        uint256 burnShare
    );
    event Slash(address indexed agent, uint256 amount, address indexed validator);
    event RewardValidator(address indexed validator, uint256 amount, bytes32 indexed jobId);
    event SlashingStats(uint256 timestamp, uint256 minted, uint256 burned, uint256 redistributed, uint256 burnRatio);
    event StakeEscrowLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event StakeReleased(bytes32 indexed jobId, address indexed to, uint256 amount);
    /// @notice Emitted when a participant receives a payout in $AGIALPHA.
    event RewardPaid(bytes32 indexed jobId, address indexed to, uint256 amount);
    event TokensBurned(bytes32 indexed jobId, uint256 amount);
    /// @notice Emitted when an employer finalizes job funds.
    event JobFundsFinalized(bytes32 indexed jobId, address indexed employer);
    /// @notice Emitted when the operator reward pool balance changes.
    event RewardPoolUpdated(uint256 balance);
    event DisputeFeeLocked(address indexed payer, uint256 amount);
    event DisputeFeePaid(address indexed to, uint256 amount);
    event DisputeModuleUpdated(address indexed module);
    event ValidationModuleUpdated(address indexed module);
    event MinStakeUpdated(uint256 minStake);
    event SlashingPercentagesUpdated(uint256 employerSlashPct, uint256 treasurySlashPct);
    event TreasuryUpdated(address indexed treasury);
    event TreasuryAllowlistUpdated(address indexed treasury, bool allowed);
    event JobRegistryUpdated(address indexed registry);
    event MaxStakePerAddressUpdated(uint256 maxStake);
    event StakeTimeLocked(address indexed user, uint256 amount, uint64 unlockTime);
    event StakeUnlocked(address indexed user, uint256 amount);
    event ModulesUpdated(address indexed jobRegistry, address indexed disputeModule);
    event FeePctUpdated(uint256 pct);
    event BurnPctUpdated(uint256 pct);
    event ValidatorRewardPctUpdated(uint256 pct);
    event FeePoolUpdated(address indexed feePool);
    event UnbondingPeriodUpdated(uint256 newPeriod);
    event PauserUpdated(address indexed pauser);

    modifier onlyGovernanceOrPauser() {
        if (!(msg.sender == address(governance) || msg.sender == pauser)) {
            revert Unauthorized();
        }
        _;
    }

    function setPauser(address _pauser) external onlyGovernance {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    /// @notice set external contracts providing temperature and Hamiltonian metrics
    function setThermostat(address _thermostat) external onlyGovernance {
        thermostat = Thermostat(_thermostat);
        emit ThermostatUpdated(_thermostat);
    }

    function setHamiltonianFeed(address _feed) external onlyGovernance {
        hamiltonianFeed = IHamiltonian(_feed);
        emit HamiltonianFeedUpdated(_feed);
    }

    /// @notice enable or disable automatic tuning of minStake based on disputes
    /// @param enabled true to enable auto tuning
    function autoTuneStakes(bool enabled) external onlyGovernance {
        autoStakeTuning = enabled;
        emit AutoStakeTuningEnabled(enabled);
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
    ) external onlyGovernance {
        if (upPct > 100 || downPct > 100) revert InvalidPercentage();
        stakeDisputeThreshold = threshold;
        stakeIncreasePct = upPct;
        stakeDecreasePct = downPct;
        if (window > 0) stakeTuneWindow = window;
        if (floor > 0) minStakeFloor = floor;
        maxMinStake = ceil;
        stakeTempThreshold = tempThreshold;
        stakeHamiltonianThreshold = hThreshold;
        disputeWeight = disputeW;
        temperatureWeight = tempW;
        hamiltonianWeight = hamW;
        emit AutoStakeConfigUpdated(
            threshold,
            upPct,
            downPct,
            stakeTuneWindow,
            minStakeFloor,
            ceil,
            tempThreshold,
            hThreshold,
            disputeW,
            tempW,
            hamW
        );
    }

    /// @notice record a dispute occurrence for auto stake tuning
    /// @dev disabled while the contract is paused
    function recordDispute() external whenNotPaused {
        if (msg.sender != disputeModule) revert OnlyDisputeModule();
        if (!autoStakeTuning) return;
        ++disputeCount;
        _maybeAdjustStake();
    }

    /// @notice trigger stake evaluation if the tuning window has elapsed
    /// @dev disabled while the contract is paused
    function checkpointStake() external whenNotPaused {
        if (!autoStakeTuning) return;
        _maybeAdjustStake();
    }

    function _maybeAdjustStake() internal {
        if (block.timestamp < lastStakeTune + stakeTuneWindow) return;
        uint256 oldMin = minStake;
        uint256 score = disputeCount * disputeWeight;
        if (address(thermostat) != address(0) && temperatureWeight > 0 && stakeTempThreshold != 0) {
            int256 t = thermostat.systemTemperature();
            if (t >= stakeTempThreshold) score += temperatureWeight;
        }
        if (address(hamiltonianFeed) != address(0) && hamiltonianWeight > 0 && stakeHamiltonianThreshold != 0) {
            int256 h = hamiltonianFeed.currentHamiltonian();
            if (h >= stakeHamiltonianThreshold) score += hamiltonianWeight;
        }
        uint256 thresholdScore = stakeDisputeThreshold * disputeWeight;
        if ((thresholdScore == 0 && score > 0) || (thresholdScore > 0 && score >= thresholdScore)) {
            uint256 inc = (minStake * stakeIncreasePct) / 100;
            if (inc == 0) inc = 1;
            uint256 newMin = minStake + inc;
            if (maxMinStake != 0 && newMin > maxMinStake) newMin = maxMinStake;
            minStake = newMin;
        } else if (score == 0 && minStake > minStakeFloor) {
            uint256 dec = (minStake * stakeDecreasePct) / 100;
            uint256 newMin = minStake > dec ? minStake - dec : minStakeFloor;
            if (newMin < minStakeFloor) newMin = minStakeFloor;
            minStake = newMin;
        }
        lastStakeTune = block.timestamp;
        disputeCount = 0;
        if (oldMin != minStake) emit MinStakeUpdated(minStake);
    }

    /// @notice Deploys the StakeManager.
    /// @param _minStake Minimum stake required to participate. Defaults to
    /// DEFAULT_MIN_STAKE when set to zero.
    /// @param _employerSlashPct Percentage of slashed amount sent to employer
    /// (0-100).
    /// @param _treasurySlashPct Percentage of slashed amount sent to treasury
    /// (0-100).
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

    // ---------------------------------------------------------------
    // Owner setters
    // ---------------------------------------------------------------
    // These helpers are intended for manual use via Etherscan's
    // "Write Contract" tab by the authorized owner.

    /// @notice update the minimum stake required
    /// @param _minStake minimum token amount with 18 decimals
    function setMinStake(uint256 _minStake) external onlyGovernance {
        if (_minStake == 0) revert InvalidMinStake();
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @dev internal helper to update slashing percentages
    function _setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) internal {
        if (_employerSlashPct > 100 || _treasurySlashPct > 100) revert InvalidPercentage();
        if (_employerSlashPct + _treasurySlashPct > 100) revert InvalidPercentage();
        employerSlashPct = _employerSlashPct;
        treasurySlashPct = _treasurySlashPct;
        emit SlashingPercentagesUpdated(_employerSlashPct, _treasurySlashPct);
    }

    /// @dev internal helper to burn tokens
    function _burnToken(bytes32 jobId, uint256 amount) internal {
        if (amount == 0) return;
        if (BURN_ADDRESS == address(0)) {
            try IERC20Burnable(address(token)).burn(amount) {
                emit TokensBurned(jobId, amount);
            } catch {
                revert TokenNotBurnable();
            }
        } else {
            token.safeTransfer(BURN_ADDRESS, amount);
            emit TokensBurned(jobId, amount);
        }
    }

    /// @notice update slashing percentage splits
    /// @param _employerSlashPct percentage sent to employer (0-100)
    /// @param _treasurySlashPct percentage sent to treasury (0-100)
    function setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) external onlyGovernance {
        _setSlashingPercentages(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update slashing percentages (alias)
    /// @param _employerSlashPct percentage sent to employer (0-100)
    /// @param _treasurySlashPct percentage sent to treasury (0-100)
    function setSlashingParameters(uint256 _employerSlashPct, uint256 _treasurySlashPct) external onlyGovernance {
        _setSlashingPercentages(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update treasury recipient address
    /// @dev Treasury must be zero (burn) or an allowlisted address distinct from the owner
    /// @param _treasury address receiving treasury slash share
    function setTreasury(address _treasury) external onlyGovernance {
        if (_treasury == owner()) revert InvalidTreasury();
        if (_treasury != address(0) && !treasuryAllowlist[_treasury]) {
            revert InvalidTreasury();
        }
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Allow or disallow a treasury address
    /// @param _treasury Treasury candidate
    /// @param allowed True to allow, false to revoke
    function setTreasuryAllowlist(address _treasury, bool allowed) external onlyGovernance {
        treasuryAllowlist[_treasury] = allowed;
        emit TreasuryAllowlistUpdated(_treasury, allowed);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    /// @dev Staking is disabled until a nonzero registry is configured.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    function setJobRegistry(address _jobRegistry) external onlyGovernance {
        if (_jobRegistry == address(0) || IJobRegistry(_jobRegistry).version() != 2) {
            revert InvalidJobRegistry();
        }
        jobRegistry = _jobRegistry;
        emit JobRegistryUpdated(_jobRegistry);
        emit ModulesUpdated(jobRegistry, disputeModule);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    /// @param module module contract allowed to move dispute fees
    function setDisputeModule(address module) external onlyGovernance {
        if (module == address(0) || IDisputeModule(module).version() != 2) {
            revert InvalidDisputeModule();
        }
        disputeModule = module;
        emit DisputeModuleUpdated(module);
        emit ModulesUpdated(jobRegistry, disputeModule);
    }

    /// @notice set the validation module used to source validator lists
    /// @param module ValidationModule contract address
    function setValidationModule(address module) external onlyGovernance {
        if (module == address(0) || IValidationModule(module).version() != 2) {
            revert InvalidValidationModule();
        }
        validationModule = IValidationModule(module);
        emit ValidationModuleUpdated(module);
    }

    /// @notice update job registry and dispute module in one call
    /// @dev Staking is disabled until `jobRegistry` is set.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    /// @param _disputeModule module contract allowed to move dispute fees
    function setModules(address _jobRegistry, address _disputeModule) external onlyGovernance {
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
    function pause() external onlyGovernanceOrPauser {
        _pause();
    }

    /// @notice Resume staking and escrow operations
    function unpause() external onlyGovernanceOrPauser {
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
        if (address(pool) == address(0) || pool.version() != 2) {
            revert InvalidFeePool();
        }
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

    /// @notice update the unbonding period for withdrawals
    /// @param newPeriod duration in seconds tokens remain locked after withdrawal request
    function setUnbondingPeriod(uint256 newPeriod) external onlyGovernance {
        if (newPeriod == 0) revert InvalidUnbondingPeriod();
        unbondingPeriod = newPeriod;
        emit UnbondingPeriodUpdated(newPeriod);
    }

    /// @notice set maximum total stake allowed per address (0 disables limit)
    /// @param maxStake cap on combined stake per address using 18 decimals
    function setMaxStakePerAddress(uint256 maxStake) external onlyGovernance {
        maxStakePerAddress = maxStake;
        emit MaxStakePerAddressUpdated(maxStake);
    }

    /// @notice set recommended minimum and maximum stake values
    /// @dev `newMax` may be zero to disable the limit but must not be below `newMin`
    /// @param newMin recommended minimum stake with 18 decimals
    /// @param newMax recommended maximum total stake per address with 18 decimals
    function setStakeRecommendations(uint256 newMin, uint256 newMax) external onlyGovernance {
        if (newMin == 0) revert InvalidMinStake();
        if (newMax != 0 && newMax < newMin) revert InvalidParams();
        minStake = newMin;
        emit MinStakeUpdated(newMin);
        maxStakePerAddress = newMax;
        emit MaxStakePerAddressUpdated(newMax);
    }

    /// @notice Update the maximum number of AGI types allowed
    function setMaxAGITypes(uint256 newMax) external onlyGovernance {
        if (newMax > MAX_AGI_TYPES_CAP) {
            revert MaxAGITypesExceeded();
        }
        if (newMax < agiTypes.length) {
            revert MaxAGITypesBelowCurrent();
        }
        uint256 old = maxAGITypes;
        maxAGITypes = newMax;
        emit MaxAGITypesUpdated(old, newMax);
    }

    /// @notice Update the maximum total payout percentage across AGI types
    function setMaxTotalPayoutPct(uint256 newMax) external onlyGovernance {
        if (newMax < 100 || newMax > MAX_PAYOUT_PCT) revert InvalidPercentage();
        uint256 old = maxTotalPayoutPct;
        maxTotalPayoutPct = newMax;
        emit MaxTotalPayoutPctUpdated(old, newMax);
    }

    /// @notice Add or update an AGI type NFT bonus
    /// @dev `payoutPct` is expressed as a percentage where `100` represents no
    ///      bonus, values above `100` increase the payout and values below `100`
    ///      can provide a discount. The percentage must not exceed
    ///      {MAX_PAYOUT_PCT}.
    function addAGIType(address nft, uint256 payoutPct) external onlyGovernance {
        if (nft == address(0) || payoutPct == 0) revert InvalidParams();
        if (payoutPct > MAX_PAYOUT_PCT) revert InvalidPercentage();
        uint256 length = agiTypes.length;
        for (uint256 i; i < length;) {
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
        for (uint256 i; i < length;) {
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

    /// @notice Determine the highest payout percentage for a user based on AGI type NFTs
    /// @dev Iterates through registered AGI types and selects the highest payout
    ///      percentage from NFTs held by the user. Reverts from malicious NFT
    ///      contracts are ignored.
    /// @param user Address whose NFTs are checked for a payout boost.
    /// @return pct The highest payout percentage (100 = no boost)
    function getTotalPayoutPct(address user) public view returns (uint256 pct) {
        uint256 maxPct = 100;
        uint256 length = agiTypes.length;
        for (uint256 i; i < length;) {
            AGIType memory t = agiTypes[i];
            try IERC721(t.nft).balanceOf(user) returns (uint256 bal) {
                if (bal > 0 && t.payoutPct > maxPct) {
                    maxPct = t.payoutPct;
                }
            } catch {
                // ignore tokens with failing balanceOf
            }
            unchecked {
                ++i;
            }
        }
        if (maxPct > maxTotalPayoutPct) {
            maxPct = maxTotalPayoutPct;
        }
        pct = maxPct;
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
    function lockStake(address user, uint256 amount, uint64 lockTime) external onlyJobRegistry whenNotPaused {
        uint256 total = stakes[user][Role.Agent] + stakes[user][Role.Validator] + stakes[user][Role.Platform];
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
    function releaseStake(address user, uint256 amount) external onlyJobRegistry whenNotPaused {
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
        uint256 oldStake = stakes[user][role];
        uint256 newStake = oldStake + amount;
        if (newStake < minStake) revert BelowMinimumStake();
        if (maxStakePerAddress > 0) {
            uint256 total =
                stakes[user][Role.Agent] + stakes[user][Role.Validator] + stakes[user][Role.Platform] + amount;
            if (total > maxStakePerAddress) revert MaxStakeExceeded();
        }
        uint256 pct = getTotalPayoutPct(user);
        uint256 newBoosted = (newStake * pct) / 100;
        uint256 oldBoosted = boostedStake[user][role];
        boostedStake[user][role] = newBoosted;
        totalBoostedStakes[role] = totalBoostedStakes[role] + newBoosted - oldBoosted;
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
        requiresTaxAcknowledgement(_policyFor(user), user, owner(), address(0), address(0))
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
        requiresTaxAcknowledgement(_policy(), msg.sender, owner(), address(0), address(0))
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
        _acknowledgedDeposit(role, amount);
    }

    /// @dev Deposits stake for the caller after verifying tax acknowledgement.
    function _acknowledgedDeposit(Role role, uint256 amount)
        internal
        requiresTaxAcknowledgement(_policy(), msg.sender, owner(), address(0), address(0))
    {
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        _deposit(msg.sender, role, amount);
    }

    function _acknowledgedDepositFor(address user, Role role, uint256 amount)
        internal
        requiresTaxAcknowledgement(_policyFor(user), user, owner(), address(0), address(0))
    {
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        _deposit(user, role, amount);
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
    function acknowledgeAndDepositFor(address user, Role role, uint256 amount) external whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidUser();
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();
        IJobRegistryAck(registry).acknowledgeFor(user);
        _acknowledgedDepositFor(user, role, amount);
    }

    /// @notice request withdrawal of staked tokens subject to unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake
    /// @param amount token amount with 18 decimals to withdraw
    function requestWithdraw(Role role, uint256 amount)
        external
        whenNotPaused
        requiresTaxAcknowledgement(_policy(), msg.sender, owner(), address(0), address(0))
    {
        if (role > Role.Platform) revert InvalidRole();
        if (amount == 0) revert InvalidAmount();
        uint256 staked = stakes[msg.sender][role];
        if (staked < amount) revert InsufficientStake();
        uint256 newStake = staked - amount;
        if (newStake != 0 && newStake < minStake) revert BelowMinimumStake();

        uint256 locked = lockedStakes[msg.sender];
        uint64 unlock = unlockTime[msg.sender];
        uint256 totalStakeUser =
            stakes[msg.sender][Role.Agent] + stakes[msg.sender][Role.Validator] + stakes[msg.sender][Role.Platform];
        uint256 remaining = totalStakeUser - amount;
        if (locked > 0 && block.timestamp < unlock && remaining < locked) {
            revert InsufficientLocked();
        }

        Unbond storage u = unbonds[msg.sender];
        if (u.amt != 0) revert UnbondPending();
        u.amt = amount;
        u.unlockAt = uint64(block.timestamp + unbondingPeriod);
        u.jailed = false;
        emit WithdrawRequested(msg.sender, role, amount, u.unlockAt);
    }

    /// @notice finalize a previously requested withdrawal after unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake being withdrawn
    function finalizeWithdraw(Role role)
        external
        whenNotPaused
        requiresTaxAcknowledgement(_policy(), msg.sender, owner(), address(0), address(0))
        nonReentrant
    {
        Unbond storage u = unbonds[msg.sender];
        uint256 amount = u.amt;
        if (amount == 0) revert NoUnbond();
        if (u.jailed) revert Jailed();
        if (block.timestamp < u.unlockAt) revert UnbondLocked();
        if (lockedStakes[msg.sender] != 0) revert PendingPenalty();
        delete unbonds[msg.sender];
        _withdraw(msg.sender, role, amount);
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
        uint256 totalStakeUser = stakes[user][Role.Agent] + stakes[user][Role.Validator] + stakes[user][Role.Platform];
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

        uint256 pct = getTotalPayoutPct(user);
        uint256 newBoosted = (newStake * pct) / 100;
        uint256 oldBoosted = boostedStake[user][role];
        boostedStake[user][role] = newBoosted;
        totalBoostedStakes[role] = totalBoostedStakes[role] + newBoosted - oldBoosted;
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
        requiresTaxAcknowledgement(_policy(), msg.sender, owner(), address(0), address(0))
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
    function acknowledgeAndWithdrawFor(address user, Role role, uint256 amount)
        external
        onlyGovernance
        whenNotPaused
        nonReentrant
    {
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
    function lockReward(bytes32 jobId, address from, uint256 amount) external onlyJobRegistry whenNotPaused {
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
    /// @param employer employer responsible for burns
    /// @param to recipient of the release (typically the agent)
    /// @param amount base token amount with 18 decimals before AGI bonus
    /// @dev Deposits fees into the FeePool without distributing them;
    ///      an external process should call `FeePool.distributeFees()`
    ///      periodically to settle rewards.
    function releaseReward(bytes32 jobId, address employer, address to, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        uint256 pct = getTotalPayoutPct(to);
        uint256 modified = (amount * pct) / 100;
        uint256 feeAmount = (modified * feePct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - feeAmount - burnAmount;
        uint256 total = payout + feeAmount + burnAmount;
        uint256 escrow = jobEscrows[jobId];
        if (escrow < total) {
            uint256 deficit = total - escrow;
            if (deficit > feeAmount + burnAmount) revert InsufficientEscrow();
            uint256 burnReduction = deficit > burnAmount ? burnAmount : deficit;
            burnAmount -= burnReduction;
            deficit -= burnReduction;
            uint256 feeReduction = deficit > feeAmount ? feeAmount : deficit;
            feeAmount -= feeReduction;
            total -= burnReduction + feeReduction;
        }
        jobEscrows[jobId] = escrow - total;

        if (feeAmount > 0) {
            if (address(feePool) != address(0)) {
                token.safeTransfer(address(feePool), feeAmount);
                feePool.depositFee(feeAmount);
                // Fees accumulate in the pool; distribution must be triggered
                // separately via `FeePool.distributeFees()` (e.g. by an
                // off-chain keeper).
                emit StakeReleased(jobId, address(feePool), feeAmount);
            } else {
                token.safeTransfer(employer, feeAmount);
            }
        }
        if (burnAmount > 0) {
            _burnToken(jobId, burnAmount);
        }
        if (payout > 0) {
            token.safeTransfer(to, payout);
            emit RewardPaid(jobId, to, payout);
        }
    }

    /// @notice Release funds previously locked via {lock}.
    /// @dev Does not adjust job-specific escrows; the caller must ensure
    ///      sufficient balance was locked earlier. Fees accumulate in the
    ///      FeePool until `FeePool.distributeFees()` is called separately.
    /// @param employer address providing burn approval
    /// @param to Recipient receiving the tokens.
    /// @param amount Base token amount with 18 decimals before AGI bonus.
    function release(address employer, address to, uint256 amount)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        // apply AGI type payout modifier
        uint256 pct = getTotalPayoutPct(to);
        uint256 modified = (amount * pct) / 100;

        // apply protocol fees and burn on the modified amount
        uint256 feeAmount = (modified * feePct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - feeAmount - burnAmount;

        if (feeAmount > 0) {
            if (address(feePool) != address(0)) {
                token.safeTransfer(address(feePool), feeAmount);
                feePool.depositFee(feeAmount);
                // Fees remain pending until `FeePool.distributeFees()` is
                // invoked separately.
                emit StakeReleased(bytes32(0), address(feePool), feeAmount);
            } else {
                token.safeTransfer(employer, feeAmount);
            }
        }
        if (burnAmount > 0) {
            _burnToken(bytes32(0), burnAmount);
        }
        if (payout > 0) {
            token.safeTransfer(to, payout);
            emit RewardPaid(bytes32(0), to, payout);
        }
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
    ) external onlyJobRegistry whenNotPaused nonReentrant {
        uint256 pct = getTotalPayoutPct(agent);
        _finalizeJobFunds(jobId, employer, agent, pct, reward, validatorReward, fee, _feePool, byGovernance);
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
    ) external onlyJobRegistry whenNotPaused nonReentrant {
        _finalizeJobFunds(jobId, employer, agent, agentPct, reward, validatorReward, fee, _feePool, byGovernance);
    }

    function _finalizeJobFunds(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 pct,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool _feePool,
        bool byGovernance
    ) internal {
        emit JobFundsFinalized(jobId, employer);

        uint256 rewardSpent = reward;
        uint256 feeAmount = fee;
        uint256 escrow = jobEscrows[jobId];
        uint256 available = escrow - validatorReward;
        if (available < rewardSpent + feeAmount) {
            uint256 deficit = rewardSpent + feeAmount - available;
            uint256 feeReduction = deficit > feeAmount ? feeAmount : deficit;
            feeAmount -= feeReduction;
            deficit -= feeReduction;
            if (deficit > 0) {
                if (deficit > rewardSpent) revert InsufficientEscrow();
                rewardSpent -= deficit;
            }
        }

        uint256 modified = (rewardSpent * pct) / 100;
        uint256 burnAmount = (modified * burnPct) / 100;
        uint256 payout = modified - burnAmount;

        uint256 spent = rewardSpent + feeAmount;
        jobEscrows[jobId] = escrow - spent;

        uint256 extra = modified > rewardSpent ? modified - rewardSpent : 0;
        if (extra > 0) {
            if (operatorRewardPool < extra) revert InsufficientRewardPool();
            operatorRewardPool -= extra;
            emit RewardPoolUpdated(operatorRewardPool);
        }

        uint256 leftover = jobEscrows[jobId];
        if (leftover > validatorReward) {
            uint256 surplus = leftover - validatorReward;
            jobEscrows[jobId] = validatorReward;
            operatorRewardPool += surplus;
            emit RewardPoolUpdated(operatorRewardPool);
        }

        if (payout > 0) {
            token.safeTransfer(agent, payout);
            emit RewardPaid(jobId, agent, payout);
        }
        if (feeAmount > 0) {
            if (address(_feePool) != address(0)) {
                token.safeTransfer(address(_feePool), feeAmount);
                _feePool.depositFee(feeAmount);
                _feePool.distributeFees();
                emit StakeReleased(jobId, address(_feePool), feeAmount);
            } else {
                token.safeTransfer(employer, feeAmount);
            }
        }
        if (burnAmount > 0) {
            _burnToken(jobId, burnAmount);
        }
    }

    /// @notice fund the operator reward pool
    /// @param amount token amount with 18 decimals to add
    function fundOperatorRewardPool(uint256 amount) external onlyGovernance whenNotPaused nonReentrant {
        token.safeTransferFrom(msg.sender, address(this), amount);
        operatorRewardPool += amount;
        emit RewardPoolUpdated(operatorRewardPool);
    }

    /// @notice withdraw tokens from the operator reward pool
    /// @param to recipient of the tokens
    /// @param amount token amount with 18 decimals to withdraw
    function withdrawOperatorRewardPool(address to, uint256 amount)
        external
        onlyGovernance
        whenNotPaused
        nonReentrant
    {
        if (operatorRewardPool < amount) revert InsufficientRewardPool();
        operatorRewardPool -= amount;
        token.safeTransfer(to, amount);
        emit RewardPoolUpdated(operatorRewardPool);
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
        address registry = jobRegistry;
        if (registry == address(0)) revert JobRegistryNotSet();

        address[] memory vals = IJobRegistry(registry).getJobValidators(uint256(jobId));
        uint256 count = vals.length;
        if (count == 0) {
            address vm = address(validationModule);
            if (vm == address(0)) revert ValidationModuleNotSet();
            vals = validationModule.validators(uint256(jobId));
            count = vals.length;
        }
        if (count == 0) revert NoValidators();
        uint256 escrow = jobEscrows[jobId];
        if (escrow < amount) revert InsufficientEscrow();

        uint256 totalWeight;
        uint256[] memory weights = new uint256[](count);
        uint256 maxWeight;
        uint256 maxIndex;
        for (uint256 i; i < count;) {
            uint256 pct = getTotalPayoutPct(vals[i]);
            weights[i] = pct;
            totalWeight += pct;
            if (pct > maxWeight) {
                maxWeight = pct;
                maxIndex = i;
            }
            unchecked {
                ++i;
            }
        }

        uint256 distributed;
        for (uint256 i; i < count;) {
            uint256 payout = (amount * weights[i]) / totalWeight;
            distributed += payout;
            token.safeTransfer(vals[i], payout);
            emit RewardPaid(jobId, vals[i], payout);
            unchecked {
                ++i;
            }
        }

        uint256 remainder = amount - distributed;
        if (remainder > 0) {
            // allocate any leftover to the validator with the largest weight
            token.safeTransfer(vals[maxIndex], remainder);
            emit RewardPaid(jobId, vals[maxIndex], remainder);
            distributed += remainder;
        }

        jobEscrows[jobId] = escrow - distributed;
    }

    // ---------------------------------------------------------------
    // dispute fee logic
    // ---------------------------------------------------------------

    /// @notice lock the dispute fee from a payer for later payout via
    ///         `payDisputeFee`
    /// @param payer address providing the fee, must approve first
    /// @param amount token amount with 18 decimals
    function lockDisputeFee(address payer, uint256 amount) external onlyDisputeModule whenNotPaused nonReentrant {
        token.safeTransferFrom(payer, address(this), amount);
        emit DisputeFeeLocked(payer, amount);
    }

    /// @notice pay a locked dispute fee to the recipient
    /// @param to recipient of the fee payout
    /// @param amount token amount with 18 decimals
    function payDisputeFee(address to, uint256 amount) external onlyDisputeModule whenNotPaused nonReentrant {
        token.safeTransfer(to, amount);
        emit DisputeFeePaid(to, amount);
    }

    // ---------------------------------------------------------------
    // slashing logic
    // ---------------------------------------------------------------

    /// @dev internal slashing routine used by dispute and job slashing
    function _slash(address user, Role role, uint256 amount, address recipient, address[] memory validators) internal {
        if (role > Role.Platform) revert InvalidRole();
        require(validators.length <= MAX_VALIDATORS, "too many validators");
        uint256 staked = stakes[user][role];
        if (staked < amount) revert InsufficientStake();
        if (employerSlashPct + treasurySlashPct > 100) revert InvalidPercentage();
        if (treasury != address(0) && !treasuryAllowlist[treasury]) {
            revert InvalidTreasury();
        }

        uint256 employerShare = (amount * employerSlashPct) / 100;
        uint256 treasuryShare = (amount * treasurySlashPct) / 100;
        uint256 burnShare = (amount * (100 - employerSlashPct - treasurySlashPct)) / 100;
        uint256 distributed = employerShare + treasuryShare + burnShare;
        if (distributed < amount) {
            burnShare += amount - distributed;
        }

        uint256 newStake = staked - amount;

        Unbond storage u = unbonds[user];
        if (u.amt != 0) {
            uint256 updated;
            if (staked <= amount) {
                updated = 0;
            } else {
                uint256 reduction = (u.amt * amount) / staked;
                if (reduction >= u.amt) {
                    updated = 0;
                } else {
                    updated = u.amt - reduction;
                    if (updated > newStake) {
                        updated = newStake;
                    }
                }
            }

            if (updated == 0) {
                delete unbonds[user];
            } else {
                u.amt = updated;
                u.unlockAt = uint64(block.timestamp + unbondingPeriod);
                u.jailed = false;
            }
        }

        uint256 pct = getTotalPayoutPct(user);
        uint256 newBoosted = (newStake * pct) / 100;
        uint256 oldBoosted = boostedStake[user][role];
        boostedStake[user][role] = newBoosted;
        totalBoostedStakes[role] = totalBoostedStakes[role] + newBoosted - oldBoosted;
        stakes[user][role] = newStake;
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

        uint256 validatorShare;
        if (validatorRewardPct > 0 && validators.length > 0) {
            uint256 base = burnShare > 0 ? burnShare : treasuryShare;
            validatorShare = (base * validatorRewardPct) / 100;
            if (validatorShare > 0) {
                if (burnShare > 0) burnShare -= validatorShare;
                else treasuryShare -= validatorShare;

                uint256 total;
                uint256 len = validators.length;
                uint256[] memory vals = new uint256[](len);
                for (uint256 i; i < len; ++i) {
                    uint256 s = stakes[validators[i]][Role.Validator];
                    vals[i] = s;
                    total += s;
                }
                if (total > 0) {
                    uint256 remaining = validatorShare;
                    for (uint256 i; i < len; ++i) {
                        uint256 reward = (validatorShare * vals[i]) / total;
                        if (reward > 0) {
                            remaining -= reward;
                            token.safeTransfer(validators[i], reward);
                            emit RewardValidator(validators[i], reward, bytes32(0));
                        }
                    }
                    if (remaining > 0) {
                        if (burnShare > 0) burnShare += remaining;
                        else treasuryShare += remaining;
                    }
                } else {
                    if (burnShare > 0) burnShare += validatorShare;
                    else treasuryShare += validatorShare;
                    validatorShare = 0;
                }
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
            if (treasury != address(0)) {
                token.safeTransfer(treasury, treasuryShare);
            } else {
                burnShare += treasuryShare;
                treasuryShare = 0;
            }
        }
        if (burnShare > 0) {
            // Burned stake originates from the slashed participant, not employer funds.
            _burnToken(bytes32(0), burnShare);
        }
        uint256 redistributed = employerShare + treasuryShare + validatorShare;
        uint256 ratio = redistributed > 0 ? (burnShare * TOKEN_SCALE) / redistributed : 0;
        emit Slash(user, amount, validators.length > 0 ? validators[0] : recipient);
        emit StakeSlashed(user, role, recipient, treasury, employerShare, treasuryShare, burnShare);
        emit SlashingStats(block.timestamp, 0, burnShare, redistributed, ratio);
    }

    /// @dev helper to process validator lists exceeding MAX_VALIDATORS
    function _slashBatched(address user, Role role, uint256 amount, address recipient, address[] calldata validators)
        internal
    {
        uint256 len = validators.length;
        uint256[] memory stakesCache = new uint256[](len);
        uint256 total;
        for (uint256 i; i < len; ++i) {
            uint256 s = stakes[validators[i]][Role.Validator];
            stakesCache[i] = s;
            total += s;
        }
        if (total == 0) {
            address[] memory empty;
            _slash(user, role, amount, recipient, empty);
            return;
        }

        uint256 allocated;
        uint256 start;
        while (start < len) {
            uint256 end = start + MAX_VALIDATORS;
            if (end > len) end = len;
            uint256 chunkStake;
            for (uint256 i = start; i < end; ++i) {
                chunkStake += stakesCache[i];
            }
            uint256 chunkAmount = (amount * chunkStake) / total;
            if (end == len && allocated + chunkAmount < amount) {
                chunkAmount = amount - allocated;
            }
            address[] memory slice = new address[](end - start);
            for (uint256 i = start; i < end; ++i) {
                slice[i - start] = validators[i];
            }
            _slash(user, role, chunkAmount, recipient, slice);
            allocated += chunkAmount;
            start = end;
        }

        if (allocated < amount) {
            address[] memory empty;
            _slash(user, role, amount - allocated, recipient, empty);
        }
    }

    /// @notice slash stake from a user for a specific role and distribute shares
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 18 decimals to slash
    /// @param employer recipient of the employer share
    function slash(address user, Role role, uint256 amount, address employer)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        address[] memory validators;
        _slash(user, role, amount, employer, validators);
    }

    function slash(address user, Role role, uint256 amount, address employer, address[] calldata validators)
        external
        onlyJobRegistry
        whenNotPaused
        nonReentrant
    {
        if (validators.length > MAX_VALIDATORS) {
            _slashBatched(user, role, amount, employer, validators);
        } else {
            _slash(user, role, amount, employer, validators);
        }
    }

    /// @notice slash a validator's stake during dispute resolution
    /// @param user address whose stake will be reduced
    /// @param amount token amount with 18 decimals to slash
    /// @param recipient address receiving the slashed share
    function slash(address user, uint256 amount, address recipient)
        external
        onlyDisputeModule
        whenNotPaused
        nonReentrant
    {
        address[] memory validators;
        _slash(user, Role.Validator, amount, recipient, validators);
    }

    function slash(address user, uint256 amount, address recipient, address[] calldata validators)
        external
        onlyDisputeModule
        whenNotPaused
        nonReentrant
    {
        if (validators.length > MAX_VALIDATORS) {
            _slashBatched(user, Role.Validator, amount, recipient, validators);
        } else {
            _slash(user, Role.Validator, amount, recipient, validators);
        }
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

    /// @notice Recalculate a user's boosted stake after NFT changes
    /// @param user address whose boosted stake is being updated
    /// @param role participant role for the stake
    function syncBoostedStake(address user, Role role) public whenNotPaused {
        if (role > Role.Platform) revert InvalidRole();
        uint256 staked = stakes[user][role];
        uint256 pct = getTotalPayoutPct(user);
        uint256 newBoosted = (staked * pct) / 100;
        uint256 oldBoosted = boostedStake[user][role];
        if (newBoosted == oldBoosted) return;
        boostedStake[user][role] = newBoosted;
        totalBoostedStakes[role] = totalBoostedStakes[role] + newBoosted - oldBoosted;
    }

    /// @notice Return the aggregate stake weighted by NFT multiplier for a role
    /// @param role participant role to query
    /// @return total aggregated boosted stake
    function totalBoostedStake(Role role) external view returns (uint256) {
        return totalBoostedStakes[role];
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
