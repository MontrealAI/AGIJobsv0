// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {Thermostat} from "./Thermostat.sol";
import {ThermoMath} from "./libraries/ThermoMath.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IReputationEngineV2} from "./interfaces/IReputationEngineV2.sol";
import {IEnergyOracle} from "./interfaces/IEnergyOracle.sol";

/// @title RewardEngineMB
/// @notice Distributes epoch rewards using Maxwell-Boltzmann statistics.
contract RewardEngineMB is Governable {
    using ThermoMath for int256[];

    enum Role {Agent, Validator, Operator, Employer}

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

    uint256 public kappa = 1e18; // scaling factor
    mapping(Role => uint256) public roleShare; // scaled to 1e18
    mapping(Role => int256) public mu;
    mapping(address => bool) public settlers;
    address public treasury;

    int256 public constant WAD = 1e18;

    error InvalidRoleShareSum(uint256 sum);

    event EpochSettled(
        uint256 indexed epoch,
        uint256 budget,
        int256 dH,
        int256 dS,
        int256 systemTemperature,
        uint256 leftover
    );
    event RewardIssued(address indexed user, Role role, uint256 amount);
    event KappaUpdated(uint256 newKappa);
    event TreasuryUpdated(address indexed treasury);
    event RoleShareUpdated(Role indexed role, uint256 share);
    event MuUpdated(Role indexed role, int256 muValue);
    event SettlerUpdated(address indexed settler, bool allowed);
    event RewardBudget(
        uint256 indexed epoch,
        uint256 minted,
        uint256 burned,
        uint256 redistributed,
        uint256 distributionRatio
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
    }

    /// @notice Configure how much of the reward budget a role receives.
    /// @param r The participant role to adjust.
    /// @param share Portion of the budget scaled by 1e18.
    function setRoleShare(Role r, uint256 share) external onlyGovernance {
        roleShare[r] = share;
        _validateRoleShares();
        emit RoleShareUpdated(r, share);
    }

    /// @notice Set the chemical potential \(\mu\) used in MB weighting for a role.
    /// @param r The role whose \(\mu\) is being configured.
    /// @param _mu Fixed-point chemical potential value.
    function setMu(Role r, int256 _mu) external onlyGovernance {
        mu[r] = _mu;
        emit MuUpdated(r, _mu);
    }

    /// @notice Set the scaling factor converting free energy to token units.
    /// @param _kappa New scaling coefficient in 18-decimal fixed point.
    function setKappa(uint256 _kappa) external onlyGovernance {
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
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Distribute rewards for an epoch based on energy attestations.
    /// @param epoch The epoch identifier to settle.
    /// @param data Batches of signed attestations and paid cost data.
    function settleEpoch(uint256 epoch, EpochData calldata data) external
        /// #if_succeeds {:msg "budget >= distributed"} budget >= distributed;
    {
        require(settlers[msg.sender], "not settler");
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
        int256 Tsys = thermostat.systemTemperature();
        int256 free = -(dH - (Tsys * dS) / WAD);
        if (free < 0) free = 0;
        uint256 budget = uint256(free) * kappa / uint256(WAD);

        uint256 distributed;
        distributed += _distribute(Role.Agent, budget, agents);
        distributed += _distribute(Role.Validator, budget, validators);
        distributed += _distribute(Role.Operator, budget, operators);
        distributed += _distribute(Role.Employer, budget, employers);

        uint256 leftover = budget - distributed;
        if (leftover > 0) {
            require(treasury != address(0), "treasury");
            feePool.reward(treasury, leftover);
        }
        uint256 ratio = budget > 0 ? (distributed * uint256(WAD)) / budget : 0;
        emit RewardBudget(epoch, budget, 0, distributed, ratio);
        emit EpochSettled(epoch, budget, dH, dS, Tsys, leftover);
    }

    function _aggregate(Proof[] calldata proofs, uint256 epoch, Role role)
        internal
        returns (RoleData memory rd, uint256 value, uint256 uPre, uint256 uPost)
    {
        uint256 n = proofs.length;
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

    function _distribute(Role r, uint256 budget, RoleData memory rd) internal returns (uint256 distributed) {
        if (rd.users.length == 0) return 0;
        int256 Tr = thermostat.getRoleTemperature(Thermostat.Role(uint8(r)));
        uint256[] memory weights = ThermoMath.mbWeights(rd.energies, rd.degeneracies, Tr, mu[r]);
        uint256 bucket = budget * roleShare[r] / uint256(WAD);
        for (uint256 i = 0; i < rd.users.length; i++) {
            uint256 amt = bucket * weights[i] / uint256(WAD);
            feePool.reward(rd.users[i], amt);
            reputation.update(rd.users[i], -rd.energies[i]);
            emit RewardIssued(rd.users[i], r, amt);
            distributed += amt;
        }
    }

    function _validateRoleShares() private view {
        uint256 sum =
            roleShare[Role.Agent] +
            roleShare[Role.Validator] +
            roleShare[Role.Operator] +
            roleShare[Role.Employer];
        if (sum != uint256(WAD)) revert InvalidRoleShareSum(sum);
    }
}

