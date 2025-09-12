// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {RewardEngineMB} from "../../contracts/v2/RewardEngineMB.sol";
import {Thermostat} from "../../contracts/v2/Thermostat.sol";
import {IReputationEngineV2} from "../../contracts/v2/interfaces/IReputationEngineV2.sol";
import {IFeePool} from "../../contracts/v2/interfaces/IFeePool.sol";

contract MockFeePool is IFeePool {
    mapping(address => uint256) public rewards;
    uint256 public total;
    function version() external pure override returns (uint256) {return 2;}
    function depositFee(uint256) external override {}
    function distributeFees() external override {}
    function claimRewards() external override {}
    function governanceWithdraw(address, uint256) external override {}
    function reward(address to, uint256 amount) external override {
        rewards[to] += amount;
        total += amount;
    }
}

contract MockReputation is IReputationEngineV2 {
    mapping(address => int256) public deltas;
    function update(address user, int256 delta) external override {
        deltas[user] = delta;
    }
}

contract RewardEngineMBTest is Test {
    RewardEngineMB engine;
    MockFeePool pool;
    MockReputation rep;
    Thermostat thermo;

    address agent = address(0x1);
    address validator = address(0x2);
    address operator = address(0x3);
    address employer = address(0x4);

    function setUp() public {
        thermo = new Thermostat(int256(1e18), int256(1), int256(2e18));
        pool = new MockFeePool();
        rep = new MockReputation();
        engine = new RewardEngineMB(thermo, pool, rep);
    }

    function _roleData(address user, int256 energy) internal pure returns (RewardEngineMB.RoleData memory rd) {
        address[] memory users = new address[](1);
        users[0] = user;
        int256[] memory energies = new int256[](1);
        energies[0] = energy;
        uint256[] memory deg = new uint256[](1);
        deg[0] = 1;
        rd = RewardEngineMB.RoleData({users: users, energies: energies, degeneracies: deg});
    }

    function test_settleEpochDistributesBudget() public {
        RewardEngineMB.EpochData memory data;
        data.agents = _roleData(agent, int256(1e18));
        data.validators = _roleData(validator, int256(1e18));
        data.operators = _roleData(operator, int256(1e18));
        data.employers = _roleData(employer, int256(1e18));
        data.totalValue = 0;
        data.paidCosts = 1e18;
        data.sumUpre = 0;
        data.sumUpost = 0;

        engine.settleEpoch(1, data);

        uint256 budget = 1e18; // -(dH - Tsys*dS) = 1e18
        assertEq(pool.total(), budget, "budget distributed");
        // Check per-role buckets
        assertEq(pool.rewards(agent), budget * engine.roleShare(RewardEngineMB.Role.Agent) / 1e18);
        assertEq(pool.rewards(validator), budget * engine.roleShare(RewardEngineMB.Role.Validator) / 1e18);
        assertEq(pool.rewards(operator), budget * engine.roleShare(RewardEngineMB.Role.Operator) / 1e18);
        assertEq(pool.rewards(employer), budget * engine.roleShare(RewardEngineMB.Role.Employer) / 1e18);
        // Reputation update sign
        assertEq(rep.deltas(agent), -int256(1e18));
    }
}

