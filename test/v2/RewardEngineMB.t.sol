// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {RewardEngineMB} from "../../contracts/v2/RewardEngineMB.sol";
import {Thermostat} from "../../contracts/v2/Thermostat.sol";
import {IReputationEngineV2} from "../../contracts/v2/interfaces/IReputationEngineV2.sol";
import {IFeePool} from "../../contracts/v2/interfaces/IFeePool.sol";
import {IEnergyOracle} from "../../contracts/v2/interfaces/IEnergyOracle.sol";

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

contract MockEnergyOracle is IEnergyOracle {
    function verify(Attestation calldata att, bytes calldata) external pure override returns (address) {
        return att.user; // treat user's address as signer for testing
    }
}

contract RewardEngineMBTest is Test {
    RewardEngineMB engine;
    MockFeePool pool;
    MockReputation rep;
    Thermostat thermo;
    MockEnergyOracle oracle;

    address agent = address(0x1);
    address validator = address(0x2);
    address operator = address(0x3);
    address employer = address(0x4);
    address treasury = address(0x5);

    function setUp() public {
        thermo = new Thermostat(int256(1e18), int256(1), int256(2e18));
        pool = new MockFeePool();
       rep = new MockReputation();
        oracle = new MockEnergyOracle();
        engine = new RewardEngineMB(thermo, pool, rep, oracle);
        engine.setSettler(address(this), true);
    }

    function _proof(address user, int256 energy, uint256 epoch, RewardEngineMB.Role role)
        internal
        pure
        returns (RewardEngineMB.Proof memory p)
    {
        IEnergyOracle.Attestation memory att = IEnergyOracle.Attestation({
            jobId: 1,
            user: user,
            energy: energy,
            degeneracy: 1,
            epochId: epoch,
            role: uint8(role),
            nonce: 1,
            deadline: type(uint256).max,
            uPre: 0,
            uPost: 0,
            value: 0
        });
        p.att = att;
        p.sig = bytes("");
    }

    function _proofWithDeg(
        address user,
        int256 energy,
        uint256 degeneracy,
        uint256 epoch,
        RewardEngineMB.Role role
    ) internal pure returns (RewardEngineMB.Proof memory p) {
        IEnergyOracle.Attestation memory att = IEnergyOracle.Attestation({
            jobId: 1,
            user: user,
            energy: energy,
            degeneracy: degeneracy,
            epochId: epoch,
            role: uint8(role),
            nonce: 1,
            deadline: type(uint256).max,
            uPre: 0,
            uPost: 0,
            value: 0
        });
        p.att = att;
        p.sig = bytes("");
    }

    function test_settleEpochDistributesBudget() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        RewardEngineMB.Proof[] memory v = new RewardEngineMB.Proof[](1);
        v[0] = _proof(validator, int256(1e18), 1, RewardEngineMB.Role.Validator);
        data.validators = v;
        RewardEngineMB.Proof[] memory o = new RewardEngineMB.Proof[](1);
        o[0] = _proof(operator, int256(1e18), 1, RewardEngineMB.Role.Operator);
        data.operators = o;
        RewardEngineMB.Proof[] memory e = new RewardEngineMB.Proof[](1);
        e[0] = _proof(employer, int256(1e18), 1, RewardEngineMB.Role.Employer);
        data.employers = e;
        data.paidCosts = 1e18;

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

    function test_setKappaScalesBudget() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        RewardEngineMB.Proof[] memory v = new RewardEngineMB.Proof[](1);
        v[0] = _proof(validator, int256(1e18), 1, RewardEngineMB.Role.Validator);
        data.validators = v;
        RewardEngineMB.Proof[] memory o = new RewardEngineMB.Proof[](1);
        o[0] = _proof(operator, int256(1e18), 1, RewardEngineMB.Role.Operator);
        data.operators = o;
        RewardEngineMB.Proof[] memory e = new RewardEngineMB.Proof[](1);
        e[0] = _proof(employer, int256(1e18), 1, RewardEngineMB.Role.Employer);
        data.employers = e;
        data.paidCosts = 1e18;

        engine.setKappa(2e18);
        engine.settleEpoch(1, data);
        // budget should be double with kappa = 2e18
        assertEq(pool.total(), 2e18, "scaled budget distributed");
    }

    function test_entropyScalingUsesWad() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        RewardEngineMB.Proof[] memory v = new RewardEngineMB.Proof[](1);
        v[0] = _proof(validator, int256(1e18), 1, RewardEngineMB.Role.Validator);
        data.validators = v;
        RewardEngineMB.Proof[] memory o = new RewardEngineMB.Proof[](1);
        o[0] = _proof(operator, int256(1e18), 1, RewardEngineMB.Role.Operator);
        data.operators = o;
        RewardEngineMB.Proof[] memory e = new RewardEngineMB.Proof[](1);
        e[0] = _proof(employer, int256(1e18), 1, RewardEngineMB.Role.Employer);
        data.employers = e;
        data.paidCosts = 0;

        engine.settleEpoch(1, data);

        uint256 budget = 1e18; // Tsys * dS / WAD = 1e18
        assertEq(pool.total(), budget, "entropy scaling");
    }

    function test_setRoleShareEmits() public {
        vm.expectEmit(true, false, false, true);
        emit RewardEngineMB.RoleShareUpdated(RewardEngineMB.Role.Agent, 65e16);
        engine.setRoleShare(RewardEngineMB.Role.Agent, 65e16);
    }

    function test_setMuEmits() public {
        vm.expectEmit(true, false, false, true);
        emit RewardEngineMB.MuUpdated(RewardEngineMB.Role.Agent, 1);
        engine.setMu(RewardEngineMB.Role.Agent, 1);
        assertEq(engine.mu(RewardEngineMB.Role.Agent), 1);
    }

    function test_reverts_on_negative_energy() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, -1, 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        vm.expectRevert(bytes("att"));
        engine.settleEpoch(1, data);
    }

    function test_reverts_on_zero_degeneracy() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proofWithDeg(agent, 1, 0, 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        vm.expectRevert(bytes("att"));
        engine.settleEpoch(1, data);
    }

    function test_replay_nonce_same_epoch_reverts() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;

        engine.settleEpoch(1, data);

        vm.expectRevert(abi.encodeWithSelector(RewardEngineMB.Replay.selector, address(oracle)));
        engine.settleEpoch(1, data);
    }

    function test_same_nonce_different_epochs_ok() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;

        engine.settleEpoch(1, data);

        a[0] = _proof(agent, int256(1e18), 2, RewardEngineMB.Role.Agent);
        data.agents = a;
        engine.settleEpoch(2, data); // should not revert
    }

    function test_mismatched_epoch_reverts() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        // attests to epoch 2 but settle epoch 1
        a[0] = _proof(agent, int256(1e18), 2, RewardEngineMB.Role.Agent);
        data.agents = a;
        vm.expectRevert(abi.encodeWithSelector(RewardEngineMB.InvalidProof.selector, address(oracle)));
        engine.settleEpoch(1, data);
    }

    function test_mismatched_role_reverts() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        // role Operator but aggregated as Agent
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Operator);
        data.agents = a;
        vm.expectRevert(abi.encodeWithSelector(RewardEngineMB.InvalidProof.selector, address(oracle)));
        engine.settleEpoch(1, data);
    }

    function test_only_settler_can_settle_epoch() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;

        address nonSettler = address(0xBEEF);
        vm.expectRevert(bytes("not settler"));
        vm.prank(nonSettler);
        engine.settleEpoch(1, data);

        address settler = address(0xCAFE);
        engine.setSettler(settler, true);
        vm.prank(settler);
        engine.settleEpoch(1, data); // should succeed
    }

    function test_leftover_budget_sent_to_treasury() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](3);
        a[0] = _proof(address(0xA1), int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(address(0xA2), int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[2] = _proof(address(0xA3), int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        data.paidCosts = 1e18;

        engine.setTreasury(treasury);
        engine.settleEpoch(1, data);

        uint256 budget = 1e18;
        uint256 agentBucket = (budget * engine.roleShare(RewardEngineMB.Role.Agent)) / 1e18;
        uint256 perAgent = agentBucket / 3;
        uint256 distributed = perAgent * 3;
        uint256 leftover = budget - distributed;

        assertEq(pool.total(), budget, "total budget accounted");
        assertEq(pool.rewards(treasury), leftover, "leftover to treasury");
    }
}

