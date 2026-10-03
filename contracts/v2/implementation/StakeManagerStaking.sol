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

/// @notice Fixed staking implementation for StakeManager. Deploy via the modular deployment helper.
contract StakeManagerStaking is StakeManagerBase, DelegateOnly {
    constructor() StakeManagerBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("StakeManagerStaking:v1");
    }

    /// @notice lock a portion of a user's stake for a period of time
    /// @param user address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockStake(address user, uint256 amount, uint64 lockTime) external onlyDelegateCall {
        return _entry_lockStake(user, amount, lockTime);
    }

    /// @notice release previously locked stake for a user
    /// @param user address whose stake is being unlocked
    /// @param amount token amount with 18 decimals to unlock
    function releaseStake(address user, uint256 amount) external onlyDelegateCall {
        return _entry_releaseStake(user, amount);
    }

    /// @notice lock validator stake for a validation round
    /// @param jobId identifier of the job requesting validation
    /// @param user validator address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockValidatorStake(uint256 jobId, address user, uint256 amount, uint64 lockTime)
        external
        onlyDelegateCall
    {
        return _entry_lockValidatorStake(jobId, user, amount, lockTime);
    }

    /// @notice release validator stake locked for validation
    /// @param jobId identifier of the job releasing the lock
    /// @param user validator address whose stake is being unlocked
    /// @param amount token amount with 18 decimals to unlock
    function unlockValidatorStake(uint256 jobId, address user, uint256 amount) external onlyDelegateCall {
        return _entry_unlockValidatorStake(jobId, user, amount);
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
    function depositStakeFor(address user, Role role, uint256 amount) external onlyDelegateCall {
        return _entry_depositStakeFor(user, role, amount);
    }

    /// @notice deposit stake for caller for a specific role after approving tokens
    /// @param role participant role for the stake
    /// @param amount token amount with 18 decimals; caller must approve first
    function depositStake(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_depositStake(role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and deposit $AGIALPHA stake in one call.
     * @dev Caller must `approve` this contract to transfer at least `amount`
     *      tokens beforehand. Invoking this helper implicitly accepts the
     *      current tax policy via the associated `JobRegistry`.
     * @param role Participant role receiving credit for the stake.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndDeposit(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_acknowledgeAndDeposit(role, amount);
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
    function acknowledgeAndDepositFor(address user, Role role, uint256 amount) external onlyDelegateCall {
        return _entry_acknowledgeAndDepositFor(user, role, amount);
    }

    /// @notice request withdrawal of staked tokens subject to unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake
    /// @param amount token amount with 18 decimals to withdraw
    function requestWithdraw(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_requestWithdraw(role, amount);
    }

    /// @notice finalize a previously requested withdrawal after unbonding period
    /// @dev Enforces the current tax policy via `requiresTaxAcknowledgement`.
    /// @param role participant role of the stake being withdrawn
    function finalizeWithdraw(Role role) external onlyDelegateCall {
        return _entry_finalizeWithdraw(role);
    }

    /**
     * @notice Withdraw previously staked $AGIALPHA for a specific role.
     * @dev Stake must be unlocked and caller must have deposited tokens
     *      beforehand via `approve` + deposit.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Token amount with 18 decimals to withdraw.
     */
    function withdrawStake(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_withdrawStake(role, amount);
    }

    /**
     * @notice Acknowledge the tax policy and withdraw $AGIALPHA stake in one call.
     * @dev Caller must have staked tokens previously, which required an `approve`
     *      for this contract. Invoking this helper acknowledges the current tax
     *      policy via the associated `JobRegistry`.
     * @param role Participant role of the stake being withdrawn.
     * @param amount Withdraw amount in $AGIALPHA with 18 decimals.
     */
    function acknowledgeAndWithdraw(Role role, uint256 amount) external onlyDelegateCall {
        return _entry_acknowledgeAndWithdraw(role, amount);
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
    function acknowledgeAndWithdrawFor(address user, Role role, uint256 amount) external onlyDelegateCall {
        return _entry_acknowledgeAndWithdrawFor(user, role, amount);
    }

    /// @notice Recalculate a user's boosted stake after NFT changes
    /// @param user address whose boosted stake is being updated
    /// @param role participant role for the stake
    function syncBoostedStake(address user, Role role) public onlyDelegateCall {
        return _entry_syncBoostedStake(user, role);
    }
}
