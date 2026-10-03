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

/// @notice Fixed escrow implementation for StakeManager. Deploy via the modular deployment helper.
contract StakeManagerEscrow is StakeManagerBase, DelegateOnly {
    constructor() StakeManagerBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("StakeManagerEscrow:v1");
    }

    /// @notice lock job reward funds from an employer for later release via
    ///         `releaseReward` or `finalizeJobFunds`
    /// @param jobId unique job identifier
    /// @param from employer providing the escrow
    /// @param amount token amount with 18 decimals; employer must approve first
    function lockReward(bytes32 jobId, address from, uint256 amount) external onlyDelegateCall {
        return _entry_lockReward(jobId, from, amount);
    }

    /// @notice Generic escrow lock used when job context is managed externally.
    /// @dev Transfers `amount` tokens from `from` to this contract without
    ///      tracking a job identifier. The caller is expected to account for the
    ///      escrowed balance.
    /// @param from Address providing the funds; must approve first.
    /// @param amount Token amount with 18 decimals to lock.
    function lock(address from, uint256 amount) external onlyDelegateCall {
        return _entry_lock(from, amount);
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
    function releaseReward(bytes32 jobId, address employer, address to, uint256 amount, bool applyBoost)
        external
        onlyDelegateCall
    {
        return _entry_releaseReward(jobId, employer, to, amount, applyBoost);
    }

    /// @notice Refund escrowed funds to the employer without applying fees or burns.
    /// @param jobId Unique job identifier whose escrow is refunded.
    /// @param to Recipient of the refund.
    /// @param amount Token amount with 18 decimals to refund.
    function refundEscrow(bytes32 jobId, address to, uint256 amount) external onlyDelegateCall {
        return _entry_refundEscrow(jobId, to, amount);
    }

    function redistributeEscrow(bytes32 jobId, address recipient, uint256 amount) external onlyDelegateCall {
        return _entry_redistributeEscrow(jobId, recipient, amount);
    }

    function redistributeEscrow(bytes32 jobId, address recipient, uint256 amount, address[] calldata validators)
        external
        onlyDelegateCall
    {
        return _entry_redistributeEscrow(jobId, recipient, amount, validators);
    }

    /// @notice Release funds previously locked via {lock}.
    /// @dev Does not adjust job-specific escrows; the caller must ensure
    ///      sufficient balance was locked earlier. Fees accumulate in the
    ///      FeePool until `FeePool.distributeFees()` is called separately.
    /// @param employer address providing burn approval
    /// @param to Recipient receiving the tokens.
    /// @param amount Base token amount with 18 decimals before AGI bonus.
    /// @param applyBoost When true, applies AGI NFT payout multipliers to `amount`.
    function release(address employer, address to, uint256 amount, bool applyBoost) external onlyDelegateCall {
        return _entry_release(employer, to, amount, applyBoost);
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
    ) external onlyDelegateCall {
        return _entry_finalizeJobFunds(jobId, employer, agent, reward, validatorReward, fee, _feePool, byGovernance);
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
    ) external onlyDelegateCall {
        return _entry_finalizeJobFundsWithPct(
            jobId, employer, agent, agentPct, reward, validatorReward, fee, _feePool, byGovernance
        );
    }

    /// @notice fund the operator reward pool
    /// @param amount token amount with 18 decimals to add
    function fundOperatorRewardPool(uint256 amount) external onlyDelegateCall {
        return _entry_fundOperatorRewardPool(amount);
    }

    /// @notice withdraw tokens from the operator reward pool
    /// @param to recipient of the tokens
    /// @param amount token amount with 18 decimals to withdraw
    function withdrawOperatorRewardPool(address to, uint256 amount) external onlyDelegateCall {
        return _entry_withdrawOperatorRewardPool(to, amount);
    }

    /// @notice Distribute validator rewards evenly using the ValidationModule
    /// @param jobId unique job identifier
    /// @param amount total validator reward pool
    function distributeValidatorRewards(bytes32 jobId, uint256 amount) external onlyDelegateCall {
        return _entry_distributeValidatorRewards(jobId, amount);
    }

    /// @notice lock the dispute fee from a payer for later payout via
    ///         `payDisputeFee`
    /// @param payer address providing the fee, must approve first
    /// @param amount token amount with 18 decimals
    function lockDisputeFee(address payer, uint256 amount) external onlyDelegateCall {
        return _entry_lockDisputeFee(payer, amount);
    }

    /// @notice pay a locked dispute fee to the recipient
    /// @param to recipient of the fee payout
    /// @param amount token amount with 18 decimals
    function payDisputeFee(address to, uint256 amount) external onlyDelegateCall {
        return _entry_payDisputeFee(to, amount);
    }
}
