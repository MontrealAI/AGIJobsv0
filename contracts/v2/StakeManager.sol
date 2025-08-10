// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";

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
        Validator
    }

    /// @notice ERC20 token used for staking and payouts
    IERC20 public token;

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

    /// @notice escrowed job funds
    mapping(bytes32 => uint256) public jobEscrows;

    /// @notice Dispute module authorized to manage dispute fees
    address public disputeModule;

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

    constructor(IERC20 _token, address owner, address _treasury) Ownable(owner) {
        token = _token;
        treasury = _treasury;
    }

    // ---------------------------------------------------------------
    // owner functions
    // ---------------------------------------------------------------

    /// @notice update the staking/payout token
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice update the minimum stake required
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @notice update slashing percentage splits
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
    function setSlashPercentSumEnforcement(bool enforced) external onlyOwner {
        enforceSlashPercentSum100 = enforced;
        emit SlashPercentSumEnforcementUpdated(enforced);
    }

    /// @notice update treasury recipient address
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice set the JobRegistry used for tax acknowledgement tracking
    function setJobRegistry(address _jobRegistry) external onlyOwner {
        jobRegistry = _jobRegistry;
        emit JobRegistryUpdated(_jobRegistry);
    }

    /// @notice set the dispute module authorized to manage dispute fees
    function setDisputeModule(address module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(module);
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

    /// @notice deposit stake for caller for a specific role
    function depositStake(Role role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        require(amount > 0, "amount");
        uint256 newStake = stakes[msg.sender][role] + amount;
        require(newStake >= minStake, "min stake");
        stakes[msg.sender][role] = newStake;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeDeposited(msg.sender, role, amount);
    }

    /// @notice withdraw available stake for a specific role
    function withdrawStake(Role role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        uint256 staked = stakes[msg.sender][role];
        require(staked >= amount, "stake");
        uint256 newStake = staked - amount;
        require(newStake == 0 || newStake >= minStake, "min stake");
        stakes[msg.sender][role] = newStake;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    // ---------------------------------------------------------------
    // job escrow logic
    // ---------------------------------------------------------------

    /// @notice lock job funds from an employer
    function lockJobFunds(bytes32 jobId, address from, uint256 amount)
        external
        onlyJobRegistry
    {
        token.safeTransferFrom(from, address(this), amount);
        jobEscrows[jobId] += amount;
        emit JobFundsLocked(jobId, from, amount);
    }

    /// @notice release locked job funds to recipient
    function releaseJobFunds(bytes32 jobId, address to, uint256 amount)
        external
        onlyJobRegistry
    {
        uint256 escrow = jobEscrows[jobId];
        require(escrow >= amount, "escrow");
        jobEscrows[jobId] = escrow - amount;
        token.safeTransfer(to, amount);
        emit JobFundsReleased(jobId, to, amount);
    }

    // ---------------------------------------------------------------
    // dispute fee logic
    // ---------------------------------------------------------------

    /// @notice lock the dispute fee from a payer
    function lockDisputeFee(address payer, uint256 amount)
        external
        onlyDisputeModule
        nonReentrant
    {
        token.safeTransferFrom(payer, address(this), amount);
        emit DisputeFeeLocked(payer, amount);
    }

    /// @notice pay a locked dispute fee to the recipient
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
    function slash(address user, Role role, uint256 amount, address employer)
        external
        onlyJobRegistry
    {
        uint256 staked = stakes[user][role];
        require(staked >= amount, "stake");

        uint256 employerShare = (amount * employerSlashPct) / 100;
        uint256 treasuryShare = (amount * treasurySlashPct) / 100;
        uint256 total = employerShare + treasuryShare;

        if (enforceSlashPercentSum100) {
            require(total == amount, "pct");
        }

        stakes[user][role] = staked - amount;

        if (employerShare > 0) {
            token.safeTransfer(employer, employerShare);
        }
        if (treasuryShare > 0) {
            token.safeTransfer(treasury, treasuryShare);
        }

        emit StakeSlashed(user, role, employer, treasury, employerShare, treasuryShare);
    }

    /// @notice Return the total stake deposited by a user for a role
    function stakeOf(address user, Role role) external view returns (uint256) {
        return stakes[user][role];
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

