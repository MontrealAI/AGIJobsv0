// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IFeePool} from "./IFeePool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IStakeManager
/// @notice Interface for staking balances, job escrows and slashing logic
interface IStakeManager {
    /// @notice participant roles
    enum Role {
        Agent,
        Validator,
        Platform
    }

    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event JobFundsLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event JobFundsReleased(bytes32 indexed jobId, address indexed to, uint256 amount);
    event StakeSlashed(
        address indexed user,
        Role indexed role,
        address indexed employer,
        address treasury,
        uint256 employerShare,
        uint256 treasuryShare
    );
    event DisputeFeeLocked(address indexed payer, uint256 amount);
    event DisputeFeePaid(address indexed to, uint256 amount);
    event DisputeModuleUpdated(address module);
    event TokenUpdated(address indexed token);
    event MinStakeUpdated(uint256 minStake);
    event SlashingPercentagesUpdated(uint256 employerSlashPct, uint256 treasurySlashPct);
    event TreasuryUpdated(address indexed treasury);
    event MaxStakePerAddressUpdated(uint256 maxStake);
    event MaxAGITypesUpdated(uint256 oldMax, uint256 newMax);
    event SlashPercentSumEnforcementUpdated(bool enforced);
    event FeePctUpdated(uint256 pct);
    event BurnPctUpdated(uint256 pct);
    event FeePoolUpdated(address indexed feePool);

    /// @notice deposit stake for caller for a specific role
    function depositStake(Role role, uint256 amount) external;

    /// @notice acknowledge the tax policy and deposit stake in one call
    function acknowledgeAndDeposit(Role role, uint256 amount) external;

    /// @notice deposit stake on behalf of a user for a specific role
    function depositStakeFor(address user, Role role, uint256 amount) external;

    /// @notice withdraw available stake for a specific role
    function withdrawStake(Role role, uint256 amount) external;

    /// @notice acknowledge the tax policy and withdraw stake in one call
    function acknowledgeAndWithdraw(Role role, uint256 amount) external;

    /// @notice lock job funds from an employer
    function lockJobFunds(bytes32 jobId, address from, uint256 amount) external;

    /// @notice generic escrow lock when job ID is managed externally
    function lock(address from, uint256 amount) external;

    /// @notice release locked job funds to recipient
    function releaseJobFunds(bytes32 jobId, address to, uint256 amount) external;

    /// @notice release funds locked via {lock}
    function release(address to, uint256 amount) external;

    /// @notice finalize job funds by paying agent and forwarding fees
    function finalizeJobFunds(
        bytes32 jobId,
        address agent,
        uint256 reward,
        uint256 fee,
        IFeePool feePool
    ) external;

    /// @notice set the dispute module authorized to manage dispute fees
    function setDisputeModule(address module) external;

    /// @notice lock a dispute fee from the payer
    function lockDisputeFee(address payer, uint256 amount) external;

    /// @notice pay out a locked dispute fee to the recipient
    function payDisputeFee(address to, uint256 amount) external;

    /// @notice slash stake from a user for a specific role
    function slash(address user, Role role, uint256 amount, address employer) external;

    /// @notice slash validator stake during dispute resolution
    function slash(address user, uint256 amount, address recipient) external;

    /// @notice toggle enforcement requiring slashing percentages to sum to 100
    function setSlashPercentSumEnforcement(bool enforced) external;

    /// @notice owner configuration helpers
    function setToken(IERC20 newToken) external;
    function setMinStake(uint256 _minStake) external;
    function setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) external;
    function setSlashingParameters(uint256 _employerSlashPct, uint256 _treasurySlashPct) external;
    function setTreasury(address _treasury) external;
    function setMaxStakePerAddress(uint256 maxStake) external;
    function setMaxAGITypes(uint256 newMax) external;
    function setFeePct(uint256 pct) external;
    function setFeePool(IFeePool pool) external;
    function setBurnPct(uint256 pct) external;

    /// @notice return total stake deposited by a user for a role
    function stakeOf(address user, Role role) external view returns (uint256);

    /// @notice return aggregate stake for a role
    function totalStake(Role role) external view returns (uint256);

    /// @notice address of the JobRegistry authorized to deposit fees
    function jobRegistry() external view returns (address);

    /// @notice Highest payout percentage for an agent based on AGI type NFTs
    function getHighestPayoutPercentage(address agent) external view returns (uint256);
}

