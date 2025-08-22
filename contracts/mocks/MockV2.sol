pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(Role => uint256) public totalStakes;
    address public disputeModule;
    address public override jobRegistry;

    function setJobRegistry(address j) external { jobRegistry = j; }

    function setStake(address user, Role role, uint256 amount) external {
        totalStakes[role] = totalStakes[role] - _stakes[user][role] + amount;
        _stakes[user][role] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function acknowledgeAndDeposit(Role, uint256) external override {}
    function depositStakeFor(address, Role, uint256) external override {}
    function acknowledgeAndWithdraw(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockStake(address, uint256, uint64) external override {}
    function lockReward(bytes32, address, uint256) external override {}
    function lock(address, uint256) external override {}
    function releaseReward(bytes32, address, uint256) external override {}
    function unlockReward(bytes32, address, uint256) external override {}
    function releaseStake(address, uint256) external override {}
    function release(address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function setDisputeModule(address module) external override { disputeModule = module; }
    function setValidationModule(address) external override {}
    function setModules(address, address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}

    function setSlashPercentSumEnforcement(bool) external override {}
    function setToken(IERC20) external override {}
    function setMinStake(uint256) external override {}
    function setSlashingPercentages(uint256, uint256) external override {}
    function setSlashingParameters(uint256, uint256) external override {}
    function setTreasury(address) external override {}
    function setMaxStakePerAddress(uint256) external override {}
    function setMaxAGITypes(uint256) external override {}
    function setFeePct(uint256) external override {}
    function setFeePool(IFeePool) external override {}
    function setBurnPct(uint256) external override {}

    function slash(address user, Role role, uint256 amount, address) external override {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(address user, uint256 amount, address) external override {
        uint256 st = _stakes[user][Role.Validator];
        require(st >= amount, "stake");
        _stakes[user][Role.Validator] = st - amount;
        totalStakes[Role.Validator] -= amount;
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function getAgentPayoutPct(address) external pure override returns (uint256) {
        return 100;
    }

    function burnPct() external pure override returns (uint256) {
        return 0;
    }

    // legacy helper for tests
    function setTokenLegacy(address) external {}
}
