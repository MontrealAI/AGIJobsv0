// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AGIALPHA, TOKEN_SCALE, BURN_ADDRESS, AGIALPHA_DECIMALS} from "../Constants.sol";
import {IERC20Burnable} from "../interfaces/IERC20Burnable.sol";
import {IJobRegistryTax} from "../interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "../libraries/TaxAcknowledgement.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IDisputeModule} from "../interfaces/IDisputeModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {Thermostat} from "../Thermostat.sol";
import {IHamiltonian} from "../interfaces/IHamiltonian.sol";

import "./StakeManagerBase.sol";
import "./FixedDelegate.sol";

/// @notice Fixed configuration implementation for StakeManager. Deploy via the modular deployment helper.
contract StakeManagerConfiguration is StakeManagerBase, DelegateOnly {
    constructor() StakeManagerBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("StakeManagerConfiguration:v1");
    }

    function setPauser(address _pauser) external onlyDelegateCall {
        return _entry_setPauser(_pauser);
    }

    function setPauserManager(address manager) external onlyDelegateCall {
        return _entry_setPauserManager(manager);
    }

    function setThermostat(address _thermostat) external onlyDelegateCall {
        return _entry_setThermostat(_thermostat);
    }

    function setHamiltonianFeed(address _feed) external onlyDelegateCall {
        return _entry_setHamiltonianFeed(_feed);
    }

    /// @notice enable or disable automatic tuning of minStake based on disputes
    /// @param enabled true to enable auto tuning
    function autoTuneStakes(bool enabled) external onlyDelegateCall {
        return _entry_autoTuneStakes(enabled);
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
    ) external onlyDelegateCall {
        return _entry_configureAutoStake(
            threshold, upPct, downPct, window, floor, ceil, tempThreshold, hThreshold, disputeW, tempW, hamW
        );
    }

    /// @notice record a dispute occurrence for auto stake tuning
    /// @dev disabled while the contract is paused
    function recordDispute() external onlyDelegateCall {
        return _entry_recordDispute();
    }

    /// @notice trigger stake evaluation if the tuning window has elapsed
    /// @dev disabled while the contract is paused
    function checkpointStake() external onlyDelegateCall {
        return _entry_checkpointStake();
    }

    /// @notice update the minimum stake override for a specific role
    /// @param role participant role whose override should change
    /// @param amount minimum stake in 18 decimal tokens (0 disables the override)
    function setRoleMinimum(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_setRoleMinimum(role, amount);
    }

    /// @notice update minimum stake overrides for all roles in a single call
    /// @param agent minimum stake for agents (0 disables override)
    /// @param validator minimum stake for validators (0 disables override)
    /// @param platform minimum stake for platforms (0 disables override)
    function setRoleMinimums(uint256 agent, uint256 validator, uint256 platform) external onlyDelegateCall {
        return _entry_setRoleMinimums(agent, validator, platform);
    }

    /// @notice update the minimum stake required
    /// @param _minStake minimum token amount with 18 decimals
    function setMinStake(uint256 _minStake) external onlyDelegateCall {
        return _entry_setMinStake(_minStake);
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
    ) public onlyDelegateCall {
        return _entry_setSlashPercents(
            employerSlashPctBps, treasurySlashPctBps, validatorSlashPctBps, operatorSlashPctBps, burnSlashPctBps
        );
    }

    /// @notice update slashing percentage splits
    /// @param _employerSlashPct percentage sent to employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to treasury (0-100 or 0-10_000)
    function setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) external onlyDelegateCall {
        return _entry_setSlashingPercentages(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update slashing percentages (alias)
    /// @param _employerSlashPct percentage sent to employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to treasury (0-100 or 0-10_000)
    function setSlashingParameters(uint256 _employerSlashPct, uint256 _treasurySlashPct) external onlyDelegateCall {
        return _entry_setSlashingParameters(_employerSlashPct, _treasurySlashPct);
    }

    /// @notice update the validator share of slashed stakes
    /// @param _validatorSlashPct percentage of the total slashed amount distributed to validators (0-100 or 0-10_000)
    function setValidatorSlashRewardPct(uint256 _validatorSlashPct) external onlyDelegateCall {
        return _entry_setValidatorSlashRewardPct(_validatorSlashPct);
    }

    /// @notice update the full slashing distribution across employer, treasury and validators
    /// @param _employerSlashPct percentage sent to the employer (0-100 or 0-10_000)
    /// @param _treasurySlashPct percentage sent to the treasury (0-100 or 0-10_000)
    /// @param _validatorSlashPct percentage sent to validators (0-100 or 0-10_000)
    function setSlashingDistribution(uint256 _employerSlashPct, uint256 _treasurySlashPct, uint256 _validatorSlashPct)
        external
        onlyDelegateCall
    {
        return _entry_setSlashingDistribution(_employerSlashPct, _treasurySlashPct, _validatorSlashPct);
    }

    /// @notice update the operator share of slashed stakes
    /// @param _operatorSlashPct percentage of the total slashed amount added to the operator reward pool (0-100 or 0-10_000)
    function setOperatorSlashPct(uint256 _operatorSlashPct) external onlyDelegateCall {
        return _entry_setOperatorSlashPct(_operatorSlashPct);
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
    ) external onlyDelegateCall {
        return _entry_setSlashDistribution(_employerSlashPct, _treasurySlashPct, _operatorSlashPct, _validatorSlashPct);
    }

    /// @notice update treasury recipient address
    /// @dev Treasury must be zero (burn) or an allowlisted address distinct from the owner
    /// @param _treasury address receiving treasury slash share
    function setTreasury(address _treasury) external onlyDelegateCall {
        return _entry_setTreasury(_treasury);
    }

    /// @notice Allow or disallow a treasury address
    /// @param _treasury Treasury candidate
    /// @param allowed True to allow, false to revoke
    function setTreasuryAllowlist(address _treasury, bool allowed) external onlyDelegateCall {
        return _entry_setTreasuryAllowlist(_treasury, allowed);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    /// @dev Staking is disabled until a nonzero registry is configured.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    function setJobRegistry(address _jobRegistry) external onlyDelegateCall {
        return _entry_setJobRegistry(_jobRegistry);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    /// @param module module contract allowed to move dispute fees
    function setDisputeModule(address module) external onlyDelegateCall {
        return _entry_setDisputeModule(module);
    }

    /// @notice set the validation module used to source validator lists
    /// @param module ValidationModule contract address
    function setValidationModule(address module) external onlyDelegateCall {
        return _entry_setValidationModule(module);
    }

    /// @notice update the allowlist of additional validator lock managers
    /// @param manager address permitted to manage validator stake locks
    /// @param allowed true to allow, false to revoke
    function setValidatorLockManager(address manager, bool allowed) external onlyDelegateCall {
        return _entry_setValidatorLockManager(manager, allowed);
    }

    /// @notice update job registry and dispute module in one call
    /// @dev Staking is disabled until `jobRegistry` is set.
    /// @param _jobRegistry registry contract enforcing tax acknowledgements
    /// @param _disputeModule module contract allowed to move dispute fees
    function setModules(address _jobRegistry, address _disputeModule) external onlyDelegateCall {
        return _entry_setModules(_jobRegistry, _disputeModule);
    }

    /// @notice Pause staking and escrow operations
    function pause() external onlyDelegateCall {
        return _entry_pause();
    }

    /// @notice Resume staking and escrow operations
    function unpause() external onlyDelegateCall {
        return _entry_unpause();
    }

    /// @notice update protocol fee percentage
    /// @param pct percentage of released amount sent to FeePool (0-100)
    function setFeePct(uint256 pct) external onlyDelegateCall {
        return _entry_setFeePct(pct);
    }

    /// @notice update FeePool contract
    /// @param pool FeePool receiving protocol fees
    function setFeePool(IFeePool pool) external onlyDelegateCall {
        return _entry_setFeePool(pool);
    }

    /// @notice update burn percentage applied on release
    /// @param pct percentage of released amount burned (0-100)
    function setBurnPct(uint256 pct) external onlyDelegateCall {
        return _entry_setBurnPct(pct);
    }

    /// @notice update validator reward percentage
    /// @param pct percentage of released amount allocated to validators (0-100)
    function setValidatorRewardPct(uint256 pct) external onlyDelegateCall {
        return _entry_setValidatorRewardPct(pct);
    }

    /// @notice update the unbonding period for withdrawals
    /// @param newPeriod duration in seconds tokens remain locked after withdrawal request
    function setUnbondingPeriod(uint256 newPeriod) external onlyDelegateCall {
        return _entry_setUnbondingPeriod(newPeriod);
    }

    /// @notice set maximum total stake allowed per address (0 disables limit)
    /// @param maxStake cap on combined stake per address using 18 decimals
    function setMaxStakePerAddress(uint256 maxStake) external onlyDelegateCall {
        return _entry_setMaxStakePerAddress(maxStake);
    }

    /// @notice set recommended minimum and maximum stake values
    /// @dev `newMax` may be zero to disable the limit but must not be below `newMin`
    /// @param newMin recommended minimum stake with 18 decimals
    /// @param newMax recommended maximum total stake per address with 18 decimals
    function setStakeRecommendations(uint256 newMin, uint256 newMax) external onlyDelegateCall {
        return _entry_setStakeRecommendations(newMin, newMax);
    }

    /// @notice Update the maximum number of AGI types allowed
    function setMaxAGITypes(uint256 newMax) external onlyDelegateCall {
        return _entry_setMaxAGITypes(newMax);
    }

    /// @notice Update the maximum total payout percentage across AGI types
    function setMaxTotalPayoutPct(uint256 newMax) external onlyDelegateCall {
        return _entry_setMaxTotalPayoutPct(newMax);
    }

    /// @notice Apply a batch of configuration updates in a single transaction.
    /// @param config Packed configuration toggles and values to apply. Supports pausing/unpausing via
    ///        the `pause` and `unpause` flags for faster incident response.
    /// @param allowlistUpdates Treasury allowlist entries to update before applying setters.
    function applyConfiguration(ConfigUpdate calldata config, TreasuryAllowlistUpdate[] calldata allowlistUpdates)
        external
        onlyDelegateCall
    {
        return _entry_applyConfiguration(config, allowlistUpdates);
    }

    /// @notice Add or update an AGI type NFT bonus
    /// @dev `payoutPct` is expressed as a percentage where `100` represents no
    ///      bonus, values above `100` increase the payout and values below `100`
    ///      can provide a discount. The percentage must not exceed
    ///      {MAX_PAYOUT_PCT}.
    function addAGIType(address nft, uint256 payoutPct) external onlyDelegateCall {
        return _entry_addAGIType(nft, payoutPct);
    }

    /// @notice Remove an AGI type
    function removeAGIType(address nft) external onlyDelegateCall {
        return _entry_removeAGIType(nft);
    }
}
