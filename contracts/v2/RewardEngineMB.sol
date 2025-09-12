// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Thermostat} from "./Thermostat.sol";
import {ThermoMath} from "./libraries/ThermoMath.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IReputationEngineV2} from "./interfaces/IReputationEngineV2.sol";
import {IEnergyOracle} from "./interfaces/IEnergyOracle.sol";

/// @title RewardEngineMB
/// @notice Distributes epoch rewards using Maxwell-Boltzmann statistics.
contract RewardEngineMB is Ownable {
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
        uint256 totalValue;
        uint256 paidCosts;
        uint256 sumUpre;
        uint256 sumUpost;
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

    event EpochSettled(uint256 indexed epoch, uint256 budget);
    event RewardIssued(address indexed user, Role role, uint256 amount);
    event KappaUpdated(uint256 newKappa);
    event TreasuryUpdated(address indexed treasury);
    event RoleShareUpdated(Role indexed role, uint256 share);
    event MuUpdated(Role indexed role, int256 muValue);

    constructor(
        Thermostat _thermostat,
        IFeePool _feePool,
        IReputationEngineV2 _rep,
        IEnergyOracle _oracle
    ) Ownable(msg.sender) {
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

    function setRoleShare(Role r, uint256 share) external onlyOwner {
        roleShare[r] = share;
        _validateRoleShares();
        emit RoleShareUpdated(r, share);
    }

    function setMu(Role r, int256 _mu) external onlyOwner {
        mu[r] = _mu;
        emit MuUpdated(r, _mu);
    }

    /// @notice Set the scaling factor converting free energy to token units.
    /// @param _kappa New scaling coefficient in 18-decimal fixed point.
    function setKappa(uint256 _kappa) external onlyOwner {
        kappa = _kappa;
        emit KappaUpdated(_kappa);
    }

    /// @notice Track highest attestation nonce per user per epoch
    /// @dev used for replay protection across epochs
    mapping(address => mapping(uint256 => uint256)) public usedNonces;
    mapping(address => uint256) private _index;

    error InvalidProof(address oracle);
    error Replay(address oracle);

    function setSettler(address settler, bool allowed) external onlyOwner {
        settlers[settler] = allowed;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function settleEpoch(uint256 epoch, EpochData calldata data) external {
        require(settlers[msg.sender], "not settler");
        int256 dH = int256(data.totalValue) - int256(data.paidCosts);
        int256 dS = int256(data.sumUpre) - int256(data.sumUpost);
        int256 Tsys = thermostat.systemTemperature();
        int256 free = -(dH - (Tsys * dS) / WAD);
        if (free < 0) free = 0;
        uint256 budget = uint256(free) * kappa / uint256(WAD);

        RoleData memory agents = _aggregate(data.agents, epoch, Role.Agent);
        RoleData memory validators = _aggregate(data.validators, epoch, Role.Validator);
        RoleData memory operators = _aggregate(data.operators, epoch, Role.Operator);
        RoleData memory employers = _aggregate(data.employers, epoch, Role.Employer);

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
        emit EpochSettled(epoch, budget);
    }

    function _aggregate(Proof[] calldata proofs, uint256 epoch, Role role)
        internal
        returns (RoleData memory rd)
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

