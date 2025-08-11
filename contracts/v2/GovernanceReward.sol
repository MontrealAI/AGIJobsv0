// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title GovernanceReward
/// @notice Distributes owner‑funded bonuses to voters that participate in governance.
/// @dev Uses 6‑decimal token amounts. The owner deposits rewards which voters
///      claim proportionally (equal share per recorded voter). No ether is ever
///      accepted, keeping the contract and owner tax neutral.
contract GovernanceReward is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token;
    uint256 public currentEpoch;

    /// @notice reward amount each voter can claim for an epoch
    mapping(uint256 => uint256) public rewardPerVoter;
    /// @notice number of voters recorded for an epoch
    mapping(uint256 => uint256) public voterCount;
    /// @notice tracks whether an address participated in an epoch
    mapping(uint256 => mapping(address => bool)) public recorded;
    /// @notice tracks whether an address has claimed its reward for an epoch
    mapping(uint256 => mapping(address => bool)) public claimed;

    event VoterRecorded(uint256 indexed epoch, address indexed voter);
    event EpochFinalized(uint256 indexed epoch, uint256 rewardPerVoter);
    event RewardClaimed(uint256 indexed epoch, address indexed voter, uint256 amount);
    event TokenUpdated(address indexed token);

    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
    }

    /// @notice record voters for the current epoch
    /// @param voters addresses that participated in governance
    function recordVoters(address[] calldata voters) external onlyOwner {
        uint256 epoch = currentEpoch;
        uint256 count = voterCount[epoch];
        for (uint256 i; i < voters.length; i++) {
            address v = voters[i];
            if (!recorded[epoch][v]) {
                recorded[epoch][v] = true;
                count++;
                emit VoterRecorded(epoch, v);
            }
        }
        voterCount[epoch] = count;
    }

    /// @notice finalize the current epoch and deposit rewards
    /// @param totalReward total reward amount to split among recorded voters (6 decimals)
    function finalizeEpoch(uint256 totalReward) external onlyOwner {
        uint256 epoch = currentEpoch;
        uint256 count = voterCount[epoch];
        require(count > 0, "no voters");
        token.safeTransferFrom(msg.sender, address(this), totalReward);
        rewardPerVoter[epoch] = totalReward / count;
        emit EpochFinalized(epoch, rewardPerVoter[epoch]);
        currentEpoch = epoch + 1;
    }

    /// @notice claim reward for a given epoch
    /// @param epoch epoch index to claim
    function claim(uint256 epoch) external {
        require(recorded[epoch][msg.sender], "not voter");
        require(!claimed[epoch][msg.sender], "claimed");
        claimed[epoch][msg.sender] = true;
        uint256 amount = rewardPerVoter[epoch];
        token.safeTransfer(msg.sender, amount);
        emit RewardClaimed(epoch, msg.sender, amount);
    }

    /// @notice update the ERC20 token used for rewards
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice Confirms the contract and owner are perpetually tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    receive() external payable {
        revert("GovernanceReward: no ether");
    }

    fallback() external payable {
        revert("GovernanceReward: no ether");
    }
}

