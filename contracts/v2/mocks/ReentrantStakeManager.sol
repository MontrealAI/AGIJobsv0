// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stake manager mock that attempts to reenter ValidationModule calls.
contract ReentrantStakeManager is IStakeManager {
    uint256 public constant version = 2;

    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(Role => uint256) public totalStakes;
    address public override jobRegistry;
    IValidationModule public validation;

    bool public attackSlash;
    uint256 public attackJobId;

    function setJobRegistry(address j) external { jobRegistry = j; }

    function setValidationModule(address vm) external override { validation = IValidationModule(vm); }

    function setStake(address user, Role role, uint256 amount) external {
        totalStakes[role] = totalStakes[role] - _stakes[user][role] + amount;
        _stakes[user][role] = amount;
    }

    function attackFinalize(uint256 jobId) external { attackSlash = true; attackJobId = jobId; }

    // ------------------------------------------------------------------
    // IStakeManager interface stubs
    // ------------------------------------------------------------------
    function depositStake(Role, uint256) external override {}
    function acknowledgeAndDeposit(Role, uint256) external override {}
    function depositStakeFor(address, Role, uint256) external override {}
    function acknowledgeAndWithdraw(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockStake(address, uint256, uint64) external override {}
    function lockReward(bytes32, address, uint256) external override {}
    function lock(address, uint256) external override {}
    function releaseReward(bytes32, address, address, uint256) external override {}
    function releaseStake(address, uint256) external override {}
    function release(address, address, uint256) external override {}
    function finalizeJobFunds(
        bytes32,
        address,
        address,
        uint256,
        uint256,
        uint256,
        IFeePool,
        bool
    ) external override {}
    function finalizeJobFundsWithPct(
        bytes32,
        address,
        address,
        uint256,
        uint256,
        uint256,
        uint256,
        IFeePool,
        bool
    ) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function fundOperatorRewardPool(uint256) external override {}
    function withdrawOperatorRewardPool(address, uint256) external override {}
    function setDisputeModule(address) external override {}
    function setModules(address, address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}
    function setMinStake(uint256) external override {}
    function setSlashingPercentages(uint256, uint256) external override {}
    function setSlashingParameters(uint256, uint256) external override {}
    function setTreasury(address) external override {}
    function setTreasuryAllowlist(address, bool) external override {}
    function setMaxStakePerAddress(uint256) external override {}
    function setMaxAGITypes(uint256) external override {}
    function setFeePct(uint256) external override {}
    function setFeePool(IFeePool) external override {}
    function setBurnPct(uint256) external override {}
    function setValidatorRewardPct(uint256) external override {}
    function autoTuneStakes(bool) external override {}
    function configureAutoStake(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        int256,
        int256,
        uint256,
        uint256,
        uint256
    ) external override {}
    function setThermostat(address) external override {}
    function setHamiltonianFeed(address) external override {}
    function recordDispute() external override {}
    function checkpointStake() external override {}
    function addAGIType(address, uint256) external override {}
    function removeAGIType(address) external override {}
    function syncBoostedStake(address, Role) external override {}

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function totalBoostedStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function getTotalPayoutPct(address) external pure override returns (uint256) {
        return 100;
    }

    function burnPct() external pure override returns (uint256) {
        return 0;
    }

    function token() external pure override returns (IERC20) {
        return IERC20(address(0));
    }

    function operatorRewardPool() external pure override returns (uint256) {
        return 0;
    }

    function maxTotalPayoutPct() external pure override returns (uint256) {
        return 100;
    }

    function setMaxTotalPayoutPct(uint256) external override {}

    function slash(address user, Role role, uint256 amount, address) external override {
        if (attackSlash) {
            attackSlash = false;
            (bool ok, bytes memory err) = address(validation).call(
                abi.encodeWithSelector(IValidationModule.finalize.selector, attackJobId)
            );
            if (!ok) {
                assembly {
                    revert(add(err, 0x20), mload(err))
                }
            }
        }
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(
        address user,
        Role role,
        uint256 amount,
        address,
        address[] calldata
    ) external override {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(address user, uint256 amount, address) external override {
        if (attackSlash) {
            attackSlash = false;
            (bool ok, bytes memory err) = address(validation).call(
                abi.encodeWithSelector(IValidationModule.finalize.selector, attackJobId)
            );
            if (!ok) {
                assembly {
                    revert(add(err, 0x20), mload(err))
                }
            }
        }
        uint256 st = _stakes[user][Role.Validator];
        require(st >= amount, "stake");
        _stakes[user][Role.Validator] = st - amount;
        totalStakes[Role.Validator] -= amount;
    }

    function slash(
        address user,
        uint256 amount,
        address,
        address[] calldata
    ) external override {
        uint256 st = _stakes[user][Role.Validator];
        require(st >= amount, "stake");
        _stakes[user][Role.Validator] = st - amount;
        totalStakes[Role.Validator] -= amount;
    }
}
