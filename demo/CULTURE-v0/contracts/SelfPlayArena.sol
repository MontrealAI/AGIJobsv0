// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStakeManager {
    function slash(address participant, uint256 amount) external;
}

interface IValidationModule {
    function jobResult(uint256 jobId) external view returns (bool success, bytes memory metadata);
}

/**
 * @title SelfPlayArena
 * @notice On-chain coordination layer for the CULTURE self-play tournament. Stores the canonical
 *         record of each round so off-chain orchestrators can resume deterministically.
 */
contract SelfPlayArena is Ownable, Pausable, ReentrancyGuard {
    struct Round {
        uint256 id;
        uint32 difficulty;
        uint64 startedAt;
        uint64 closedAt;
        bool finalized;
        uint256 teacherJobId;
        uint256[] studentJobIds;
        address[] validators;
        address[] winners;
    }

    event RoundStarted(uint256 indexed roundId, uint32 difficulty, uint256 teacherJobId);
    event StudentRegistered(uint256 indexed roundId, uint256 jobId);
    event RoundClosed(uint256 indexed roundId);
    event RoundFinalised(uint256 indexed roundId, address[] winners, int32 difficultyDelta);
    event ParametersUpdated(uint32 targetSuccessRate, uint32 maxDifficultyStep, uint32 minDifficulty, uint32 maxDifficulty);

    uint256 private _nextRoundId = 1;
    mapping(uint256 => Round) private _rounds;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;

    uint32 public targetSuccessRate = 6000; // basis points (60%)
    uint32 public maxDifficultyStep = 2;
    uint32 public minDifficulty = 1;
    uint32 public maxDifficulty = 20;
    uint32 public currentDifficulty = 1;

    constructor(address owner_, address validationModule_, address stakeManager_) Ownable(owner_) {
        validationModule = IValidationModule(validationModule_);
        stakeManager = IStakeManager(stakeManager_);
    }

    function setModules(address validationModule_, address stakeManager_) external onlyOwner {
        validationModule = IValidationModule(validationModule_);
        stakeManager = IStakeManager(stakeManager_);
    }

    function configureDifficulty(
        uint32 targetSuccessRate_,
        uint32 maxDifficultyStep_,
        uint32 minDifficulty_,
        uint32 maxDifficulty_
    ) external onlyOwner {
        targetSuccessRate = targetSuccessRate_;
        maxDifficultyStep = maxDifficultyStep_;
        minDifficulty = minDifficulty_;
        maxDifficulty = maxDifficulty_;
        emit ParametersUpdated(targetSuccessRate_, maxDifficultyStep_, minDifficulty_, maxDifficulty_);
    }

    function round(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    function startRound(uint256 teacherJobId) external whenNotPaused onlyOwner returns (uint256 roundId) {
        roundId = _nextRoundId++;
        Round storage stored = _rounds[roundId];
        stored.id = roundId;
        stored.difficulty = currentDifficulty;
        stored.startedAt = uint64(block.timestamp);
        stored.teacherJobId = teacherJobId;
        emit RoundStarted(roundId, stored.difficulty, teacherJobId);
    }

    function registerStudentJob(uint256 roundId, uint256 jobId) external whenNotPaused onlyOwner {
        Round storage stored = _rounds[roundId];
        require(stored.id != 0, "ROUND_NOT_FOUND");
        require(!stored.finalized, "ROUND_FINALISED");
        stored.studentJobIds.push(jobId);
        emit StudentRegistered(roundId, jobId);
    }

    function closeRound(uint256 roundId) external onlyOwner whenNotPaused {
        Round storage stored = _rounds[roundId];
        require(stored.id != 0, "ROUND_NOT_FOUND");
        stored.closedAt = uint64(block.timestamp);
        emit RoundClosed(roundId);
    }

    function finaliseRound(
        uint256 roundId,
        address[] calldata winners,
        address[] calldata dishonestValidators,
        int32 difficultyDelta
    ) external onlyOwner whenNotPaused {
        Round storage stored = _rounds[roundId];
        require(stored.id != 0, "ROUND_NOT_FOUND");
        require(!stored.finalized, "ROUND_FINALISED");
        stored.finalized = true;
        stored.winners = winners;
        currentDifficulty = _applyDifficultyDelta(stored.difficulty, difficultyDelta);
        emit RoundFinalised(roundId, winners, difficultyDelta);
        for (uint256 i = 0; i < dishonestValidators.length; i++) {
            // Slash a nominal amount (actual amount decided off-chain, default 0.1 ether equivalent).
            if (address(stakeManager) != address(0)) {
                stakeManager.slash(dishonestValidators[i], 0.1 ether);
            }
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _applyDifficultyDelta(uint32 baseDifficulty, int32 delta) internal view returns (uint32) {
        int256 proposed = int256(uint256(baseDifficulty)) + delta;
        if (proposed < int256(uint256(minDifficulty))) {
            return minDifficulty;
        }
        if (proposed > int256(uint256(maxDifficulty))) {
            return maxDifficulty;
        }
        uint32 newDifficulty = uint32(uint256(proposed));
        uint32 upperBound = baseDifficulty + maxDifficultyStep;
        if (newDifficulty > upperBound) {
            newDifficulty = upperBound;
        }
        uint32 lowerBound = baseDifficulty > maxDifficultyStep ? baseDifficulty - maxDifficultyStep : minDifficulty;
        if (newDifficulty < lowerBound) {
            newDifficulty = lowerBound;
        }
        return newDifficulty;
    }
}
