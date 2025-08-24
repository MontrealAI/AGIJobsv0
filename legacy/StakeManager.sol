// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title StakeManager
/// @notice Simple staking contract supporting multiple participant roles.
/// @dev All token amounts use 6 decimals. The provided token must implement
///      `decimals()` and return `6`.
contract StakeManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for staking
    IERC20 public token;

    /// @notice percentage of rewards taken as protocol fee (0-100)
    uint256 public feePct;

    /// @notice percentage of rewards to burn (0-100)
    uint256 public burnPct;

    /// @notice address receiving fees and slashed stakes
    address public treasury;

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

    /// @notice details about AGI NFT types and payout bonuses
    struct AGIType {
        address nftAddress;
        uint256 payoutPercentage;
    }

    /// @notice list of registered AGI types
    AGIType[] public agiTypes;

    /// @notice canonical burn address
    address public constant BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;

    /// @notice emitted when a user acknowledges the tax policy
    event TaxPolicyAcknowledged(address indexed user);

    /// @notice emitted when stake is deposited
    event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when stake is withdrawn
    event StakeWithdrawn(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when stake is slashed
    event StakeSlashed(address indexed user, uint8 indexed role, uint256 amount);

    /// @notice emitted when reward is locked by an employer
    event RewardLocked(address indexed employer, uint256 amount);

    /// @notice emitted when reward is paid out
    event RewardPaid(address indexed to, uint256 amount);

    /// @notice emitted when a reward is distributed among participants
    event RewardDistributed(
        uint256 indexed jobId,
        address indexed agent,
        uint256 agentShare,
        uint256 validatorShare,
        uint256 feeAmount,
        uint256 burnAmount
    );

    /// @notice emitted when treasury address is updated
    event TreasuryUpdated(address indexed treasury);

    /// @notice emitted when staking token is updated
    event TokenUpdated(address indexed token);

    /// @notice emitted when minimum stake is updated
    event MinStakeUpdated(uint256 minStake);

    /// @notice emitted when maximum stake per address is updated
    event MaxStakePerAddressUpdated(uint256 maxStake);

    /// @notice emitted when allowed slashing percentage changes for a role
    event SlashingPercentageUpdated(uint8 indexed role, uint256 percent);

    /// @notice emitted when fee percentage is updated
    event FeePctUpdated(uint256 pct);

    /// @notice emitted when burn percentage is updated
    event BurnPctUpdated(uint256 pct);

    /// @notice emitted when an AGI NFT type is added or updated
    event AGITypeUpdated(address indexed nftAddress, uint256 payoutPercentage);

    /// @notice emitted when an AGI NFT type is removed
    event AGITypeRemoved(address indexed nftAddress);

    /// @notice emitted when blacklist status changes for an address
    event BlacklistUpdated(address indexed user, bool status);

    constructor() Ownable(msg.sender) {
        treasury = msg.sender;
    }

    // ------------------------------------------------------------------
    // Owner functions
    // ------------------------------------------------------------------

    /// @notice pause staking deposits and withdrawals
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice resume staking deposits and withdrawals
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice update minimum stake requirement
    function setMinStake(uint256 newMin) external onlyOwner {
        minStake = newMin;
        emit MinStakeUpdated(newMin);
    }

    /// @notice update maximum stake allowed per address (0 disables limit)
    function setMaxStakePerAddress(uint256 newMax) external onlyOwner {
        maxStakePerAddress = newMax;
        emit MaxStakePerAddressUpdated(newMax);
    }

    /// @notice update allowed slashing percentage for a role
    function setSlashingPercentage(uint8 role, uint256 percent) external onlyOwner {
        require(percent <= 100, "StakeManager: percent > 100");
        slashingPercentages[role] = percent;
        emit SlashingPercentageUpdated(role, percent);
    }

    /// @notice update staking token
    function setToken(IERC20Metadata newToken) external onlyOwner {
        require(newToken.decimals() == 6, "StakeManager: token not 6 decimals");
        token = IERC20(address(newToken));
        emit TokenUpdated(address(newToken));
    }

    /// @notice update protocol fee percentage
    function setFeePct(uint256 pct) external onlyOwner {
        require(pct <= 100, "StakeManager: percent > 100");
        feePct = pct;
        emit FeePctUpdated(pct);
    }

    /// @notice update burn percentage
    function setBurnPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "StakeManager: percent > 100");
        burnPct = pct;
        emit BurnPctUpdated(pct);
    }

    /// @notice update treasury recipient
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice update blacklist status for an address
    function setBlacklist(address user, bool status) external onlyOwner {
        blacklist[user] = status;
        emit BlacklistUpdated(user, status);
    }

    /// @notice Recover ERC20 tokens sent to this contract by mistake.
    function withdrawEmergency(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @notice add or update an AGI NFT type with payout percentage
    function addAGIType(address nftAddress, uint256 payoutPercentage)
        external
        onlyOwner
    {
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ) {
            if (agiTypes[i].nftAddress == nftAddress) {
                agiTypes[i].payoutPercentage = payoutPercentage;
                emit AGITypeUpdated(nftAddress, payoutPercentage);
                return;
            }
            unchecked {
                ++i;
            }
        }
        agiTypes.push(AGIType({nftAddress: nftAddress, payoutPercentage: payoutPercentage}));
        emit AGITypeUpdated(nftAddress, payoutPercentage);
    }

    /// @notice remove an AGI NFT type
    function removeAGIType(address nftAddress) external onlyOwner {
        uint256 length = agiTypes.length;
        for (uint256 i; i < length; ) {
            if (agiTypes[i].nftAddress == nftAddress) {
                agiTypes[i] = agiTypes[length - 1];
                agiTypes.pop();
                emit AGITypeRemoved(nftAddress);
                return;
            }
            unchecked {
                ++i;
            }
        }
        revert("AGIType: not found");
    }

    /// @notice return configured AGI NFT types
    function getAGITypes() external view returns (AGIType[] memory types) {
        types = agiTypes;
    }

    /// @notice return highest payout percentage for an agent based on owned NFTs
    function getHighestPayoutPercentage(address agent)
        public
        view
        returns (uint256 highestPercentage)
    {
        uint256 len = agiTypes.length;
        for (uint256 i; i < len; ) {
            try IERC721(agiTypes[i].nftAddress).balanceOf(agent) returns (
                uint256 bal
            ) {
                if (bal > 0 && agiTypes[i].payoutPercentage > highestPercentage) {
                    highestPercentage = agiTypes[i].payoutPercentage;
                }
            } catch {
                // ignore failing NFT contracts
            }
            unchecked {
                ++i;
            }
        }
    }

    /// @notice lock reward funds from an employer
    function lockReward(address employer, uint256 amount) external {
        token.safeTransferFrom(employer, address(this), amount);
        emit RewardLocked(employer, amount);
    }

    /// @notice pay out reward funds to a recipient
    function payReward(address to, uint256 amount) public {
        token.safeTransfer(to, amount);
        emit RewardPaid(to, amount);
    }

    /// @notice distribute a job reward among agent and validators applying fees
    function distributeReward(
        uint256 jobId,
        address agent,
        address[] calldata validators,
        uint256 reward
    ) external {
        uint256 feeAmount = (reward * feePct) / 100;
        uint256 burnAmount = (reward * burnPct) / 100;
        uint256 remaining = reward - feeAmount - burnAmount;

        if (feeAmount > 0) {
            token.safeTransfer(treasury, feeAmount);
        }
        if (burnAmount > 0) {
            token.safeTransfer(BURN_ADDRESS, burnAmount);
        }

        uint256 agentPct = getHighestPayoutPercentage(agent);
        if (agentPct == 0) {
            agentPct = 100;
        }
        uint256 agentShare = (remaining * agentPct) / 100;
        uint256 validatorShare = remaining - agentShare;

        payReward(agent, agentShare);

        uint256 count = validators.length;
        if (count > 0 && validatorShare > 0) {
            uint256 perValidator = validatorShare / count;
            uint256 rem = validatorShare - perValidator * count;
            for (uint256 i; i < count; ) {
                uint256 amt = perValidator;
                if (i == 0) {
                    amt += rem;
                }
                payReward(validators[i], amt);
                unchecked {
                    ++i;
                }
            }
        } else if (validatorShare > 0) {
            // no validators provided, send remainder to agent
            payReward(agent, validatorShare);
            agentShare += validatorShare;
            validatorShare = 0;
        }

        emit RewardDistributed(jobId, agent, agentShare, validatorShare, feeAmount, burnAmount);
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
        whenNotPaused
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
        whenNotPaused
        nonReentrant
    {
        uint256 staked = stakes[msg.sender][role];
        require(staked >= amount, "StakeManager: insufficient");

        stakes[msg.sender][role] = staked - amount;
        totalStake[msg.sender] -= amount;

        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    /// @notice slash a user's stake for a role and send to treasury
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

        token.safeTransfer(treasury, amount);
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

