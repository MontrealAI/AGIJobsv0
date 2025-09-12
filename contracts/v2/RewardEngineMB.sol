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

    int256 public constant WAD = 1e18;

    event EpochSettled(uint256 indexed epoch, uint256 budget);

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
    }

    function setRoleShare(Role r, uint256 share) external onlyOwner {
        roleShare[r] = share;
    }

    function setMu(Role r, int256 _mu) external onlyOwner {
        mu[r] = _mu;
    }

    /// @notice Settle an epoch and distribute rewards.
    mapping(address => uint256) public usedNonces;

    error InvalidProof(address oracle);
    error Replay(address oracle);

    function settleEpoch(uint256 epoch, EpochData calldata data) external onlyOwner {
        int256 dH = int256(data.totalValue) - int256(data.paidCosts);
        int256 dS = int256(data.sumUpre) - int256(data.sumUpost);
        int256 Tsys = thermostat.systemTemperature();
        int256 free = -(dH - Tsys * dS);
        if (free < 0) free = 0;
        uint256 budget = uint256(free) * kappa / uint256(WAD);

        RoleData memory agents = _aggregate(data.agents);
        RoleData memory validators = _aggregate(data.validators);
        RoleData memory operators = _aggregate(data.operators);
        RoleData memory employers = _aggregate(data.employers);

        _distribute(Role.Agent, budget, agents);
        _distribute(Role.Validator, budget, validators);
        _distribute(Role.Operator, budget, operators);
        _distribute(Role.Employer, budget, employers);
        emit EpochSettled(epoch, budget);
    }

    function _aggregate(Proof[] calldata proofs) internal returns (RoleData memory rd) {
        uint256 n = proofs.length;
        rd.users = new address[](n);
        rd.energies = new int256[](n);
        rd.degeneracies = new uint256[](n);
        uint256 count = 0;
        for (uint256 i = 0; i < n; i++) {
            IEnergyOracle.Attestation calldata att = proofs[i].att;
            address signer = energyOracle.verify(att, proofs[i].sig);
            if (signer == address(0)) revert InvalidProof(address(energyOracle));
            if (att.nonce <= usedNonces[att.user]) revert Replay(address(energyOracle));
            usedNonces[att.user] = att.nonce;
            bool found = false;
            for (uint256 j = 0; j < count; j++) {
                if (rd.users[j] == att.user) {
                    rd.energies[j] += att.energy;
                    rd.degeneracies[j] += att.degeneracy;
                    found = true;
                    break;
                }
            }
            if (!found) {
                rd.users[count] = att.user;
                rd.energies[count] = att.energy;
                rd.degeneracies[count] = att.degeneracy;
                count++;
            }
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

    function _distribute(Role r, uint256 budget, RoleData memory rd) internal {
        if (rd.users.length == 0) return;
        int256 Tr = thermostat.getRoleTemperature(Thermostat.Role(uint8(r)));
        uint256[] memory weights = ThermoMath.mbWeights(rd.energies, rd.degeneracies, Tr, mu[r]);
        uint256 bucket = budget * roleShare[r] / uint256(WAD);
        for (uint256 i = 0; i < rd.users.length; i++) {
            uint256 amt = bucket * weights[i] / uint256(WAD);
            feePool.reward(rd.users[i], amt);
            reputation.update(rd.users[i], -rd.energies[i]);
        }
    }
}

