// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakeManager
/// @notice Simple staking contract supporting multiple participant roles.
/// @dev All token amounts use 6 decimals. The provided token must implement
///      `decimals()` and return `6`.
contract StakeManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for staking
    IERC20 public token;

    /// @notice minimum stake required per role
    uint256 public minStake;

    /// @notice maximum aggregate stake allowed per address (0 disables limit)
    uint256 public maxStakePerAddress;

    /// @notice blacklist of addresses prohibited from staking
    mapping(address => bool) public blacklist;

    /// @notice maximum slashing percentage per role (0-100)
    mapping(uint8 => uint256) public slashingPercentages;

    /// @notice staked amount per address and role
    mapping(address => mapping(uint8 => uint256)) public stakes;

    /// @notice total stake per address across all roles
    mapping(address => uint256) public totalStake;

    /// @notice tracks which addresses acknowledged the tax policy
    mapping(address => bool) private _taxAcknowledged;

    /// @notice emitted when a user acknowledges the tax policy
    event TaxPolicyAcknowledged(address indexed user);

    /// @notice emitted when stake is deposited
    event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when stake is withdrawn
    event StakeWithdrawn(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when stake is slashed
    event StakeSlashed(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when staking token is updated
    event TokenUpdated(address indexed token);

    /// @notice emitted when blacklist status changes for an address
    event BlacklistUpdated(address indexed user, bool status);

    /// @param _token ERC20 token with 6 decimals used for staking
    /// @param owner address that receives contract ownership
    constructor(IERC20Metadata _token, address owner) Ownable(owner) {
        require(_token.decimals() == 6, "StakeManager: token not 6 decimals");
        token = IERC20(address(_token));
    }

    // ------------------------------------------------------------------
    // Owner functions
    // ------------------------------------------------------------------

    /// @notice update minimum stake requirement
    function setMinStake(uint256 newMin) external onlyOwner {
        minStake = newMin;
    }

    /// @notice update maximum stake allowed per address (0 disables limit)
    function setMaxStakePerAddress(uint256 newMax) external onlyOwner {
        maxStakePerAddress = newMax;
    }

    /// @notice update allowed slashing percentage for a role
    function setSlashingPercentage(uint8 role, uint256 percent) external onlyOwner {
        require(percent <= 100, "StakeManager: percent > 100");
        slashingPercentages[role] = percent;
    }

    /// @notice update staking token
    function setToken(IERC20Metadata newToken) external onlyOwner {
        require(newToken.decimals() == 6, "StakeManager: token not 6 decimals");
        token = IERC20(address(newToken));
        emit TokenUpdated(address(newToken));
    }

    /// @notice update blacklist status for an address
    function setBlacklist(address user, bool status) external onlyOwner {
        blacklist[user] = status;
        emit BlacklistUpdated(user, status);
    }

    // ------------------------------------------------------------------
    // Staking logic
    // ------------------------------------------------------------------

    /// @notice require caller to acknowledge current tax policy
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            require(_taxAcknowledged[msg.sender], "acknowledge tax policy");
        }
        _;
    }

    /// @notice allow users to acknowledge the tax policy
    function acknowledgeTaxPolicy() external {
        _taxAcknowledged[msg.sender] = true;
        emit TaxPolicyAcknowledged(msg.sender);
    }

    /// @notice returns whether msg.sender has acknowledged the tax policy
    function isTaxExempt() external view returns (bool) {
        return _taxAcknowledged[msg.sender];
    }

    /// @notice deposit stake for a given role
    /// @param role numeric identifier of participant role
    /// @param amount token amount with 6 decimals
    function depositStake(uint8 role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        require(amount > 0, "StakeManager: amount 0");

        require(!blacklist[msg.sender], "StakeManager: blacklisted");
        uint256 newRoleStake = stakes[msg.sender][role] + amount;
        require(newRoleStake >= minStake, "StakeManager: below min");

        uint256 newTotal = totalStake[msg.sender] + amount;
        if (maxStakePerAddress > 0) {
            require(newTotal <= maxStakePerAddress, "StakeManager: exceeds max");
        }

        stakes[msg.sender][role] = newRoleStake;
        totalStake[msg.sender] = newTotal;

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeDeposited(msg.sender, role, amount);
    }

    /// @notice withdraw stake for a given role
    /// @param role numeric identifier of participant role
    /// @param amount token amount with 6 decimals
    function withdrawStake(uint8 role, uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        uint256 staked = stakes[msg.sender][role];
        require(staked >= amount, "StakeManager: insufficient");

        stakes[msg.sender][role] = staked - amount;
        totalStake[msg.sender] -= amount;

        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    /// @notice slash a user's stake for a role and send to contract owner
    /// @param user address whose stake will be reduced
    /// @param role numeric identifier of participant role
    /// @param percent percentage to slash (0-100)
    function slash(address user, uint8 role, uint256 percent)
        external
        onlyOwner
        nonReentrant
    {
        require(percent > 0, "StakeManager: percent 0");
        require(percent <= slashingPercentages[role], "StakeManager: pct too high");
        require(percent <= 100, "StakeManager: percent > 100");

        uint256 staked = stakes[user][role];
        uint256 amount = (staked * percent) / 100;

        stakes[user][role] = staked - amount;
        totalStake[user] -= amount;

        token.safeTransfer(owner(), amount);
        emit StakeSlashed(user, role, amount);
    }

    /// @dev Reject direct ETH transfers.
    receive() external payable {
        revert("StakeManager: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("StakeManager: no ether");
    }
}

