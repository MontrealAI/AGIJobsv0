// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {Thermostat} from "./Thermostat.sol";
import {ThermoMath} from "./libraries/ThermoMath.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IReputationEngineV2} from "./interfaces/IReputationEngineV2.sol";
import {IEnergyOracle} from "./interfaces/IEnergyOracle.sol";
import {IERC20Mintable} from "./interfaces/IERC20Mintable.sol";
import {AGIALPHA} from "./Constants.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RewardEngineMB
/// @notice Distributes epoch rewards using Maxwell-Boltzmann statistics.
contract RewardEngineMB is Governable, ReentrancyGuard {

    enum Role {
        Agent,
        Validator,
        Operator,
        Employer
    }

    struct RoleData {
        address[] users;
        int256[] energies;
        uint256[] degeneracies;
    }

    struct Proof {
        IEnergyOracle.Attestation att;
        bytes sig;
    }

    struct EpochData {
        Proof[] agents;
        Proof[] validators;
        Proof[] operators;
        Proof[] employers;
        uint256 paidCosts;
    }

    Thermostat public thermostat;
    IFeePool public feePool;
    IReputationEngineV2 public reputation;
    IEnergyOracle public energyOracle;
    IERC20Mintable public immutable token = IERC20Mintable(AGIALPHA);

    uint256 public kappa = 1e18; // scaling factor
    mapping(Role => uint256) public roleShare; // scaled to 1e18
    mapping(Role => int256) public mu;
    mapping(Role => int256) public baselineEnergy;
    mapping(address => bool) public settlers;
    address public treasury;
    uint256 public maxProofs = 100;
    mapping(uint256 => bool) public epochSettled;

    /// @notice Fallback temperature when Thermostat is unset.
    int256 public temperature;

    int256 public constant WAD = 1e18;
    uint256 public constant MAX_KAPPA = type(uint256).max / uint256(WAD);

    error InvalidRoleShareSum(uint256 sum);
    error ProofCountExceeded(uint256 length, uint256 maxLength);
    error TreasuryNotSet();

    event EpochSettled(
        uint256 indexed epoch, uint256 budget, int256 dH, int256 dS, int256 systemTemperature, uint256 dust
    );
    event RewardIssued(address indexed user, Role role, uint256 amount);
    event KappaUpdated(uint256 newKappa);
    event TreasuryUpdated(address indexed treasury);
    event RoleShareUpdated(Role indexed role, uint256 share);
    event MuUpdated(Role indexed role, int256 muValue);
    event BaselineEnergyUpdated(Role indexed role, int256 baseline);
    event SettlerUpdated(address indexed settler, bool allowed);
    event RewardBudget(
        uint256 indexed epoch, uint256 minted, uint256 dust, uint256 redistributed, uint256 distributionRatio
    );

    constructor(
        Thermostat _thermostat,
        IFeePool _feePool,
        IReputationEngineV2 _rep,
        IEnergyOracle _oracle,
        address _governance
    ) Governable(_governance) {
        thermostat = _thermostat;
        feePool = _feePool;
        reputation = _rep;
        energyOracle = _oracle;
        roleShare[Role.Agent] = 65e16; // 65%
        roleShare[Role.Validator] = 15e16;
        roleShare[Role.Operator] = 15e16;
        roleShare[Role.Employer] = 5e16;
        _validateRoleShares();
        temperature = int256(WAD);
    }

    /// @notice Configure how much of the reward budget a role receives.
    /// @param r The participant role to adjust.
    /// @param share Portion of the budget scaled by 1e18.
    function setRoleShare(Role r, uint256 share) external onlyGovernance {
        roleShare[r] = share;
        _validateRoleShares();
        emit RoleShareUpdated(r, share);
    }

    /// @notice Update the reward distribution for all roles in a single call.
    /// @dev Prevents transient invalid states when rebalancing the shares.
    /// @param agentShare Portion of the budget for agents scaled by 1e18.
    /// @param validatorShare Portion of the budget for validators scaled by 1e18.
    /// @param operatorShare Portion of the budget for operators scaled by 1e18.
    /// @param employerShare Portion of the budget for employers scaled by 1e18.
    function setRoleShares(
        uint256 agentShare,
        uint256 validatorShare,
        uint256 operatorShare,
        uint256 employerShare
    ) external onlyGovernance {
        roleShare[Role.Agent] = agentShare;
        roleShare[Role.Validator] = validatorShare;
        roleShare[Role.Operator] = operatorShare;
        roleShare[Role.Employer] = employerShare;
        _validateRoleShares();
        emit RoleShareUpdated(Role.Agent, agentShare);
        emit RoleShareUpdated(Role.Validator, validatorShare);
        emit RoleShareUpdated(Role.Operator, operatorShare);
        emit RoleShareUpdated(Role.Employer, employerShare);
    }

    /// @notice Set the chemical potential \(\mu\) used in MB weighting for a role.
    /// @param r The role whose \(\mu\) is being configured.
    /// @param _mu Fixed-point chemical potential value.
    function setMu(Role r, int256 _mu) external onlyGovernance {
        mu[r] = _mu;
        emit MuUpdated(r, _mu);
    }

    /// @notice Configure the baseline energy used for reputation updates.
    /// @param r The role whose baseline is being set.
    /// @param baseline Baseline energy value.
    function setBaselineEnergy(Role r, int256 baseline) external onlyGovernance {
        baselineEnergy[r] = baseline;
        emit BaselineEnergyUpdated(r, baseline);
    }

    /// @notice Set the scaling factor converting free energy to token units.
    /// @param _kappa New scaling coefficient in 18-decimal fixed point.
    function setKappa(uint256 _kappa) external onlyGovernance {
        require(_kappa > 0, "kappa");
        require(_kappa <= MAX_KAPPA, "kappa overflow");
        kappa = _kappa;
        emit KappaUpdated(_kappa);
    }

    /// @notice Track highest attestation nonce per user per epoch
    /// @dev used for replay protection across epochs
    mapping(address => mapping(uint256 => uint256)) public usedNonces;
    mapping(address => uint256) private _index;

    error InvalidProof(address oracle);
    error Replay(address oracle);

    /// @notice Grant or revoke permission to settle reward epochs.
    /// @param settler Address being updated.
    /// @param allowed True to authorize the settler, false to revoke.
    function setSettler(address settler, bool allowed) external onlyGovernance {
        settlers[settler] = allowed;
        emit SettlerUpdated(settler, allowed);
    }

    /// @notice Set the treasury address to receive unallocated rewards.
    /// @param _treasury Destination for leftover budgets.
    function setTreasury(address _treasury) external onlyGovernance {
        require(_treasury != address(0), "treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Set the maximum number of proofs allowed per role in an epoch.
    /// @param max Maximum length of each proofs array.
    function setMaxProofs(uint256 max) external onlyGovernance {
        maxProofs = max;
    }

    /// @notice Update the Thermostat contract reference.
    /// @param _thermostat New thermostat contract or zero address to disable.
    function setThermostat(Thermostat _thermostat) external onlyGovernance {
        thermostat = _thermostat;
    }

    /// @notice Set a manual system temperature when no Thermostat is used.
    /// @param temp Temperature value in WAD units.
    function setTemperature(int256 temp) external onlyGovernance {
        require(temp > 0, "temp");
        temperature = temp;
    }

    /// @notice Distribute rewards for an epoch based on energy attestations.
    /// @param epoch The epoch identifier to settle.
    /// @param data Batches of signed attestations and paid cost data.
    function settleEpoch(uint256 epoch, EpochData calldata data) external nonReentrant
    /// #if_succeeds {:msg "budget >= redistributed"} budget >= redistributed;
    {
        require(settlers[msg.sender], "not settler");
        require(!epochSettled[epoch], "settled");
        uint256 totalValue;
        uint256 sumUpre;
        uint256 sumUpost;

        RoleData memory agents;
        RoleData memory validators;
        RoleData memory operators;
        RoleData memory employers;
        uint256 v;
        uint256 pre;
        uint256 post;

        (agents, v, pre, post) = _aggregate(data.agents, epoch, Role.Agent);
        totalValue += v;
        sumUpre += pre;
        sumUpost += post;
        (validators, v, pre, post) = _aggregate(data.validators, epoch, Role.Validator);
        totalValue += v;
        sumUpre += pre;
        sumUpost += post;
        (operators, v, pre, post) = _aggregate(data.operators, epoch, Role.Operator);
        totalValue += v;
        sumUpre += pre;
        sumUpost += post;
        (employers, v, pre, post) = _aggregate(data.employers, epoch, Role.Employer);
        totalValue += v;
        sumUpre += pre;
        sumUpost += post;

        int256 dH = int256(totalValue) - int256(data.paidCosts);
        int256 dS = int256(sumUpre) - int256(sumUpost);
        int256 Tsys;
        if (address(thermostat) != address(0)) {
            Tsys = thermostat.systemTemperature();
        }
        if (Tsys <= 0) {
            Tsys = temperature;
        }
        require(Tsys > 0, "temp");
        int256 free = -(dH - (Tsys * dS) / WAD);
        if (free < 0) free = 0;
        uint256 budget = uint256(free) * kappa / uint256(WAD);

        uint256 minted;
        if (budget > 0) {
            if (treasury == address(0)) revert TreasuryNotSet();
            token.mint(address(feePool), budget);
            minted = budget;
        }

        // compute weights for each role
        (uint256[] memory wA, uint256 sumA) = _weights(agents, Role.Agent);
        (uint256[] memory wV, uint256 sumV) = _weights(validators, Role.Validator);
        (uint256[] memory wO, uint256 sumO) = _weights(operators, Role.Operator);
        (uint256[] memory wE, uint256 sumE) = _weights(employers, Role.Employer);

        uint256 redistributed;
        redistributed += _distribute(Role.Agent, budget, agents, wA, sumA);
        redistributed += _distribute(Role.Validator, budget, validators, wV, sumV);
        redistributed += _distribute(Role.Operator, budget, operators, wO, sumO);
        redistributed += _distribute(Role.Employer, budget, employers, wE, sumE);

        uint256 dust = budget > redistributed ? budget - redistributed : 0;
        if (dust > 0) {
            feePool.reward(treasury, dust);
        }
        uint256 ratio = budget > 0 ? (redistributed * uint256(WAD)) / budget : 0;
        epochSettled[epoch] = true;
        emit RewardBudget(epoch, minted, dust, redistributed, ratio);
        emit EpochSettled(epoch, budget, dH, dS, Tsys, dust);
    }

    function _aggregate(Proof[] calldata proofs, uint256 epoch, Role role)
        internal
        returns (RoleData memory rd, uint256 value, uint256 uPre, uint256 uPost)
    {
        uint256 n = proofs.length;
        if (n > maxProofs) revert ProofCountExceeded(n, maxProofs);
        rd.users = new address[](n);
        rd.energies = new int256[](n);
        rd.degeneracies = new uint256[](n);
        uint256 count = 0;
        for (uint256 i = 0; i < n; i++) {
            IEnergyOracle.Attestation calldata att = proofs[i].att;
            require(att.energy >= 0 && att.degeneracy > 0, "att");
            if (att.epochId != epoch || att.role != uint8(role)) revert InvalidProof(address(energyOracle));
            address signer = energyOracle.verify(att, proofs[i].sig);
            if (signer == address(0)) revert InvalidProof(address(energyOracle));
            if (att.nonce <= usedNonces[att.user][epoch]) revert Replay(address(energyOracle));
            usedNonces[att.user][epoch] = att.nonce;
            value += att.value;
            uPre += att.uPre;
            uPost += att.uPost;
            uint256 idx = _index[att.user];
            if (idx == 0) {
                rd.users[count] = att.user;
                rd.energies[count] = att.energy;
                rd.degeneracies[count] = att.degeneracy;
                _index[att.user] = ++count;
            } else {
                uint256 pos = idx - 1;
                rd.energies[pos] += att.energy;
                rd.degeneracies[pos] += att.degeneracy;
            }
        }
        for (uint256 i = 0; i < count; i++) {
            delete _index[rd.users[i]];
        }
        assembly {
            let users := mload(rd)
            let energies := mload(add(rd, 0x20))
            let degeneracies := mload(add(rd, 0x40))
            mstore(users, count)
            mstore(energies, count)
            mstore(degeneracies, count)
        }
    }

    function _weights(RoleData memory rd, Role r) internal view returns (uint256[] memory w, uint256 sum) {
        int256 Tr =
            address(thermostat) != address(0)
                ? thermostat.getRoleTemperature(Thermostat.Role(uint8(r)))
                : temperature;
        require(Tr > 0, "T>0");
        uint256 n = rd.users.length;
        w = new uint256[](n);
        if (n == 0) return (w, 0);

        int256 muR = mu[r];
        for (uint256 i = 0; i < n; i++) {
            int256 x = ((muR - rd.energies[i]) * int256(WAD)) / Tr;
            uint256 weight = ThermoMath.expWad(x);
            uint256 degeneracy = rd.degeneracies[i];
            if (degeneracy > type(uint256).max / weight) revert ThermoMath.WeightOverflow();
            uint256 scaled = weight * degeneracy;
            if (sum > type(uint256).max - scaled) revert ThermoMath.WeightOverflow();
            w[i] = weight;
            sum += scaled;
        }
    }

    function _distribute(
        Role r,
        uint256 budget,
        RoleData memory rd,
        uint256[] memory w,
        uint256 sum
    ) internal returns (uint256 distributed) {
        uint256 bucket = budget * roleShare[r] / uint256(WAD);
        if (bucket == 0 || rd.users.length == 0) return 0;

        int256 baseline = baselineEnergy[r];
        for (uint256 i = 0; i < rd.users.length; i++) {
            uint256 gw = w[i] * rd.degeneracies[i];
            uint256 amt = sum > 0 ? (bucket * gw) / sum : 0;
            feePool.reward(rd.users[i], amt);
            reputation.update(rd.users[i], baseline - rd.energies[i]);
            emit RewardIssued(rd.users[i], r, amt);
            distributed += amt;
        }
    }

    function _validateRoleShares() private view {
        uint256 sum =
            roleShare[Role.Agent] + roleShare[Role.Validator] + roleShare[Role.Operator] + roleShare[Role.Employer];
        if (sum != uint256(WAD)) revert InvalidRoleShareSum(sum);
    }
}
