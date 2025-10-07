// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {RewardEngineMB} from "../../contracts/v2/RewardEngineMB.sol";
import {Thermostat} from "../../contracts/v2/Thermostat.sol";
import {ThermoMath} from "../../contracts/v2/libraries/ThermoMath.sol";
import {IReputationEngineV2} from "../../contracts/v2/interfaces/IReputationEngineV2.sol";
import {IFeePool} from "../../contracts/v2/interfaces/IFeePool.sol";
import {IEnergyOracle} from "../../contracts/v2/interfaces/IEnergyOracle.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";

int256 constant MAX_EXP_INPUT = 133_084258667509499440;
int256 constant MIN_EXP_INPUT = -41_446531673892822322;

error ReentrancyGuardReentrantCall();

contract MockFeePool is IFeePool {
    mapping(address => uint256) public rewards;
    uint256 public total;

    function version() external pure override returns (uint256) {
        return 2;
    }

    function depositFee(uint256) external override {}
    function distributeFees() external override {}
    function claimRewards() external override {}
    function governanceWithdraw(address, uint256) external override {}

    function reward(address to, uint256 amount) external override {
        rewards[to] += amount;
        total += amount;
    }
}

contract ReentrantFeePool is IFeePool {
    RewardEngineMB engine;
    mapping(address => uint256) public rewards;

    function setEngine(RewardEngineMB _engine) external {
        engine = _engine;
    }

    function version() external pure override returns (uint256) {
        return 2;
    }

    function depositFee(uint256) external override {}
    function distributeFees() external override {}
    function claimRewards() external override {}
    function governanceWithdraw(address, uint256) external override {}

    function reward(address to, uint256 amount) external override {
        rewards[to] += amount;
        RewardEngineMB.EpochData memory data; // empty
        engine.settleEpoch(99, data); // attempt reentrancy
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

    function isSigner(address) external pure override returns (bool) {
        return true;
    }

    function signerCount() external pure override returns (uint256) {
        return 0;
    }

    function getSigners() external pure override returns (address[] memory) {
        return new address[](0);
    }
}

contract RewardEngineMBHarness is RewardEngineMB {
    constructor(Thermostat _thermo, IFeePool _feePool, IReputationEngineV2 _rep, IEnergyOracle _oracle, address _gov)
        RewardEngineMB(_thermo, _feePool, _rep, _oracle, _gov)
    {}

    function exposeWeights(RoleData memory rd, Role r) external view returns (uint256[] memory w, uint256 sum) {
        return _weights(rd, r);
    }
}

contract RewardEngineMBTest is Test {
    RewardEngineMBHarness engine;
    MockFeePool pool;
    MockReputation rep;
    Thermostat thermo;
    MockEnergyOracle oracle;
    AGIALPHAToken token;

    address agent = address(0x1);
    address validator = address(0x2);
    address operator = address(0x3);
    address employer = address(0x4);
    address treasury = address(0x5);

    function _sumProofs(RewardEngineMB.Proof[] memory proofs)
        internal
        pure
        returns (uint256 value, uint256 uPre, uint256 uPost)
    {
        for (uint256 i; i < proofs.length; i++) {
            value += proofs[i].att.value;
            uPre += proofs[i].att.uPre;
            uPost += proofs[i].att.uPost;
        }
    }

    function _expectedBudget(RewardEngineMB.EpochData memory data)
        internal
        view
        returns (uint256)
    {
        (uint256 valueAgents, uint256 preAgents, uint256 postAgents) = _sumProofs(data.agents);
        (uint256 valueValidators, uint256 preValidators, uint256 postValidators) = _sumProofs(data.validators);
        (uint256 valueOperators, uint256 preOperators, uint256 postOperators) = _sumProofs(data.operators);
        (uint256 valueEmployers, uint256 preEmployers, uint256 postEmployers) = _sumProofs(data.employers);

        uint256 totalValue = valueAgents + valueValidators + valueOperators + valueEmployers;
        uint256 sumUpre = preAgents + preValidators + preOperators + preEmployers;
        uint256 sumUpost = postAgents + postValidators + postOperators + postEmployers;

        int256 dH = int256(totalValue) - int256(data.paidCosts);
        int256 dS = int256(sumUpre) - int256(sumUpost);

        int256 Tsys;
        if (address(engine.thermostat()) != address(0)) {
            Tsys = engine.thermostat().systemTemperature();
        }
        if (Tsys <= 0) {
            Tsys = engine.temperature();
        }
        int256 free = -(dH - (Tsys * dS) / int256(1e18));
        if (free < 0) free = 0;
        return uint256(free) * engine.kappa() / 1e18;
    }

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(payable(AGIALPHA));
        thermo = new Thermostat(int256(1e18), int256(1), int256(2e18), address(this));
        pool = new MockFeePool();
        rep = new MockReputation();
        oracle = new MockEnergyOracle();
        engine = new RewardEngineMBHarness(thermo, pool, rep, oracle, address(this));
        engine.setSettler(address(this), true);
        engine.setTreasury(treasury);
        bytes32 ownerSlot = bytes32(uint256(5));
        vm.store(AGIALPHA, ownerSlot, bytes32(uint256(uint160(address(engine)))));
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

    function _proofWithDeg(address user, int256 energy, uint256 degeneracy, uint256 epoch, RewardEngineMB.Role role)
        internal
        pure
        returns (RewardEngineMB.Proof memory p)
    {
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

        uint256 budget = _expectedBudget(data);
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

    function test_setKappaRejectsZero() public {
        vm.expectRevert("kappa");
        engine.setKappa(0);
    }

    function test_setKappaRejectsOverflow() public {
        uint256 maxKappa = engine.MAX_KAPPA();
        engine.setKappa(maxKappa);
        assertEq(engine.kappa(), maxKappa);
        vm.expectRevert("kappa overflow");
        engine.setKappa(maxKappa + 1);
    }

    function test_setTreasuryRejectsZero() public {
        vm.expectRevert("treasury");
        engine.setTreasury(address(0));
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

        uint256 budget = _expectedBudget(data);
        assertEq(pool.total(), budget, "entropy scaling");
    }

    function test_baseline_energy_adjusts_reputation() public {
        engine.setBaselineEnergy(RewardEngineMB.Role.Agent, int256(1e18));
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        address efficient = address(0xA1);
        address wasteful = address(0xA2);
        a[0] = _proof(efficient, int256(5e17), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        a[1] = _proof(wasteful, int256(2e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        engine.settleEpoch(1, data);
        assertGt(rep.deltas(efficient), 0);
        assertLt(rep.deltas(wasteful), 0);
    }

    function test_equal_energies_uniform_split() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        address a1 = address(0xA1);
        address a2 = address(0xA2);
        a[0] = _proof(a1, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(a2, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        engine.setTreasury(treasury);
        engine.settleEpoch(1, data);
        uint256 budget = _expectedBudget(data);
        uint256 bucket = budget * engine.roleShare(RewardEngineMB.Role.Agent) / 1e18;
        uint256 expected = bucket / 2;
        assertApproxEqAbs(pool.rewards(a1), expected, 1);
        assertApproxEqAbs(pool.rewards(a2), expected, 1);
    }

    function test_large_energy_disparity_winner_take_most() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        address low = address(0xA1);
        address high = address(0xA2);
        a[0] = _proof(low, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(high, int256(40e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        engine.setTreasury(treasury);
        engine.settleEpoch(1, data);
        uint256 budget = _expectedBudget(data);
        uint256 bucket = budget * engine.roleShare(RewardEngineMB.Role.Agent) / 1e18;
        assertGt(pool.rewards(low), bucket * 99 / 100);
        assertLt(pool.rewards(high), bucket / 100);
    }

    function test_minTemp_extreme_skew() public {
        int256 minT = thermo.minTemp();
        thermo.setRoleTemperature(Thermostat.Role.Agent, minT);
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        address low = address(0xA1);
        address high = address(0xA2);
        a[0] = _proof(low, 0, 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(high, 40, 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        engine.setTreasury(treasury);
        engine.settleEpoch(1, data);
        uint256 budget = _expectedBudget(data);
        uint256 bucket = budget * engine.roleShare(RewardEngineMB.Role.Agent) / 1e18;
        assertGt(pool.rewards(low), bucket * 99 / 100);
        assertLt(pool.rewards(high), bucket / 100);
    }

    function test_maxTemp_near_uniform() public {
        int256 maxT = thermo.maxTemp();
        thermo.setRoleTemperature(Thermostat.Role.Agent, maxT);
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        address a1 = address(0xA1);
        address a2 = address(0xA2);
        a[0] = _proof(a1, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(a2, int256(2e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        engine.setTreasury(treasury);
        engine.settleEpoch(1, data);
        uint256 budget = _expectedBudget(data);
        uint256 bucket = budget * engine.roleShare(RewardEngineMB.Role.Agent) / 1e18;
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = int256(1e18);
        E[1] = int256(2e18);
        g[0] = 1;
        g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, maxT, 0);
        uint256 expected1 = bucket * w[0] / 1e18;
        uint256 expected2 = bucket * w[1] / 1e18;
        assertApproxEqAbs(pool.rewards(a1), expected1, 1);
        assertApproxEqAbs(pool.rewards(a2), expected2, 1);
    }

    function test_mbWeights_sums_to_1e18() public pure {
        int256[] memory E = new int256[](3);
        uint256[] memory g = new uint256[](3);
        E[0] = 1e18;
        E[1] = 2e18;
        E[2] = 3e18;
        g[0] = 1;
        g[1] = 1;
        g[2] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum = w[0] + w[1] + w[2];
        assertApproxEqAbs(sum, 1e18, 1);
    }

    function test_mbWeights_normalization_deterministic() public view {
        int256[] memory E = new int256[](4);
        uint256[] memory g = new uint256[](4);
        E[0] = -2e18;
        E[1] = -5e17;
        E[2] = 0;
        E[3] = 3e18;
        g[0] = 1;
        g[1] = 2;
        g[2] = 3;
        g[3] = 1;

        uint256[] memory w = ThermoMath.mbWeights(E, g, engine.temperature(), 0);

        uint256 sum;
        for (uint256 i; i < w.length; i++) {
            sum += w[i];
        }

        assertApproxEqAbs(sum, 1e18, 1, "weights normalize with degeneracy");
        assertGt(w[0], w[3], "lower energy higher weight");
    }

    function test_setRoleShareEmits() public {
        vm.expectEmit(true, false, false, true);
        emit RewardEngineMB.RoleShareUpdated(RewardEngineMB.Role.Agent, 65e16);
        engine.setRoleShare(RewardEngineMB.Role.Agent, 65e16);
    }

    function test_setRoleShares_updates_all_roles() public {
        uint256 agentShare = 60e16;
        uint256 validatorShare = 20e16;
        uint256 operatorShare = 15e16;
        uint256 employerShare = 5e16;

        engine.setRoleShares(agentShare, validatorShare, operatorShare, employerShare);

        assertEq(engine.roleShare(RewardEngineMB.Role.Agent), agentShare);
        assertEq(engine.roleShare(RewardEngineMB.Role.Validator), validatorShare);
        assertEq(engine.roleShare(RewardEngineMB.Role.Operator), operatorShare);
        assertEq(engine.roleShare(RewardEngineMB.Role.Employer), employerShare);
    }

    function test_setRoleShares_reverts_when_sum_invalid() public {
        vm.expectRevert(
            abi.encodeWithSelector(RewardEngineMB.InvalidRoleShareSum.selector, uint256(105e16))
        );
        engine.setRoleShares(70e16, 15e16, 15e16, 5e16);
    }

    function test_setSettlerEmits() public {
        vm.expectEmit(true, false, false, true);
        emit RewardEngineMB.SettlerUpdated(address(0xBEEF), true);
        engine.setSettler(address(0xBEEF), true);
    }

    function test_setMuEmits() public {
        vm.expectEmit(true, false, false, true);
        emit RewardEngineMB.MuUpdated(RewardEngineMB.Role.Agent, 1);
        engine.setMu(RewardEngineMB.Role.Agent, 1);
        assertEq(engine.mu(RewardEngineMB.Role.Agent), 1);
    }

    function test_setMu_scales_mb_weights() public {
        RewardEngineMB.RoleData memory rd;
        rd.users = new address[](2);
        rd.energies = new int256[](2);
        rd.degeneracies = new uint256[](2);
        rd.users[0] = address(0xAA1);
        rd.users[1] = address(0xAA2);
        rd.energies[0] = int256(1e18);
        rd.energies[1] = int256(2e18);
        rd.degeneracies[0] = 1;
        rd.degeneracies[1] = 2;

        (uint256[] memory wBase, uint256 sumBase) = engine.exposeWeights(rd, RewardEngineMB.Role.Agent);

        engine.setMu(RewardEngineMB.Role.Agent, 20e18);
        (uint256[] memory wMu, uint256 sumMu) = engine.exposeWeights(rd, RewardEngineMB.Role.Agent);

        assertGt(sumMu, sumBase, "mu increases aggregate weight");
        assertGt(wMu[0], wBase[0], "low energy scaled up");
        assertGt(wMu[1], wBase[1], "high energy scaled up");

        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory proofs = new RewardEngineMB.Proof[](2);
        proofs[0] = _proof(rd.users[0], rd.energies[0], 1, RewardEngineMB.Role.Agent);
        proofs[0].att.uPre = 1e18;
        proofs[1] = _proofWithDeg(rd.users[1], rd.energies[1], rd.degeneracies[1], 1, RewardEngineMB.Role.Agent);
        data.agents = proofs;

        engine.settleEpoch(1, data);

        uint256 lowReward = pool.rewards(rd.users[0]);
        uint256 highReward = pool.rewards(rd.users[1]);

        assertGt(lowReward, 0, "low energy rewarded");
        assertGt(highReward, 0, "high energy rewarded");

        uint256 expectedRatio = (wMu[0] * rd.degeneracies[0]) * 1e18 / (wMu[1] * rd.degeneracies[1]);
        uint256 actualRatio = (lowReward * 1e18) / highReward;

        assertApproxEqRel(actualRatio, expectedRatio, 1e15, "relative payout tracks weights");
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

        vm.expectRevert(bytes("settled"));
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

    function test_epoch_cannot_be_settled_twice() public {
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;

        engine.settleEpoch(1, data);
        vm.expectRevert(bytes("settled"));
        engine.settleEpoch(1, data);
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

        uint256 budget = _expectedBudget(data);
        uint256 agentBucket = (budget * engine.roleShare(RewardEngineMB.Role.Agent)) / 1e18;
        uint256 perAgent = agentBucket / 3;
        uint256 distributed = perAgent * 3;
        uint256 leftover = budget - distributed;

        assertEq(pool.total(), budget, "total budget accounted");
        assertEq(pool.rewards(treasury), leftover, "leftover to treasury");
    }

    function test_leftover_without_treasury_reverts() public {
        RewardEngineMBHarness alt = new RewardEngineMBHarness(thermo, pool, rep, oracle, address(this));
        alt.setSettler(address(this), true);
        bytes32 ownerSlot = bytes32(uint256(5));
        vm.store(AGIALPHA, ownerSlot, bytes32(uint256(uint160(address(alt)))));

        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        a[0] = _proof(address(0xA1), int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        a[1] = _proof(address(0xA2), int256(2e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        alt.setKappa(1);
        vm.expectRevert(abi.encodeWithSelector(RewardEngineMB.TreasuryNotSet.selector));
        alt.settleEpoch(1, data);

        vm.store(AGIALPHA, ownerSlot, bytes32(uint256(uint160(address(engine)))));
    }

    function test_proof_array_length_bound() public {
        engine.setMaxProofs(1);
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](2);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[1] = _proof(address(0xBEEF), int256(1e18), 1, RewardEngineMB.Role.Agent);
        data.agents = a;
        vm.expectRevert(abi.encodeWithSelector(RewardEngineMB.ProofCountExceeded.selector, 2, 1));
        engine.settleEpoch(1, data);
    }

    function test_reentrancy_guard_on_settleEpoch() public {
        ReentrantFeePool rpool = new ReentrantFeePool();
        RewardEngineMB eng = new RewardEngineMB(thermo, rpool, rep, oracle, address(this));
        rpool.setEngine(eng);
        eng.setSettler(address(this), true);
        eng.setSettler(address(rpool), true);
        eng.setTreasury(treasury);
        bytes32 ownerSlot = bytes32(uint256(5));
        vm.store(AGIALPHA, ownerSlot, bytes32(uint256(uint160(address(eng)))));
        RewardEngineMB.EpochData memory data;
        RewardEngineMB.Proof[] memory a = new RewardEngineMB.Proof[](1);
        a[0] = _proof(agent, int256(1e18), 1, RewardEngineMB.Role.Agent);
        a[0].att.uPre = 1e18;
        data.agents = a;
        vm.expectRevert(ReentrancyGuardReentrantCall.selector);
        eng.settleEpoch(1, data);
    }
}
