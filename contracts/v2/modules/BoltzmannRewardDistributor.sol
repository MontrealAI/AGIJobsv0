// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Mintable} from "../interfaces/IERC20Mintable.sol";
import {ThermoMath} from "../libraries/ThermoMath.sol";

/// @title BoltzmannRewardDistributor
/// @notice Distributes tokens among recipients using Maxwell-Boltzmann weights.
/// @dev Owner may trigger distributions and update temperature.
contract BoltzmannRewardDistributor is Ownable {
    using ThermoMath for int256[];

    IERC20Mintable public immutable token;
    int256 public temperature = 1e18; // default T = 1 in WAD units
    uint256 public constant WAD = 1e18;

    event TemperatureUpdated(int256 newTemperature);
    event RewardsDistributed(uint256 total, uint256 dust);

    constructor(IERC20Mintable _token) Ownable(msg.sender) {
        token = _token;
    }

    /// @notice Set system temperature used in MB weighting.
    /// @param t New temperature in 18-decimal fixed point.
    function setTemperature(int256 t) external onlyOwner {
        require(t > 0, "temp");
        temperature = t;
        emit TemperatureUpdated(t);
    }

    /// @notice Compute MB weights for given energies and degeneracies.
    /// @param energies Energy values for each participant.
    /// @param degeneracies Degeneracy factors.
    /// @return weights Normalized weights scaled by 1e18.
    function weights(
        int256[] calldata energies,
        uint256[] calldata degeneracies
    ) external view returns (uint256[] memory weights) {
        weights = ThermoMath.mbWeights(energies, degeneracies, temperature, 0);
    }

    /// @notice Distribute `amount` of tokens among `recipients` using MB weights.
    /// @param recipients Addresses receiving rewards.
    /// @param energies Energy values for each participant.
    /// @param degeneracies Degeneracy factor for each participant.
    /// @param amount Total token amount to distribute.
    function distribute(
        address[] calldata recipients,
        int256[] calldata energies,
        uint256[] calldata degeneracies,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "amount");
        require(
            recipients.length == energies.length && energies.length == degeneracies.length,
            "len"
        );
        uint256[] memory weights = ThermoMath.mbWeights(energies, degeneracies, temperature, 0);
        uint256 distributed;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 share = (amount * weights[i]) / WAD;
            distributed += share;
            token.mint(recipients[i], share);
        }
        uint256 dust = amount - distributed;
        if (dust > 0) {
            token.mint(owner(), dust);
        }
        emit RewardsDistributed(amount, dust);
    }
}

