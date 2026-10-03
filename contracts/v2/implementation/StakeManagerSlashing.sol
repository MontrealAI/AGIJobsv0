// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AGIALPHA, TOKEN_SCALE, BURN_ADDRESS, AGIALPHA_DECIMALS} from "../Constants.sol";
import {IERC20Burnable} from "../interfaces/IERC20Burnable.sol";
import {IJobRegistryTax} from "../interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "../libraries/TaxAcknowledgement.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IDisputeModule} from "../interfaces/IDisputeModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {Thermostat} from "../Thermostat.sol";
import {IHamiltonian} from "../interfaces/IHamiltonian.sol";

import "./StakeManagerBase.sol";
import "./FixedDelegate.sol";

/// @notice Fixed slashing implementation for StakeManager. Deploy via the modular deployment helper.
contract StakeManagerSlashing is StakeManagerBase, DelegateOnly {
    constructor() StakeManagerBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("StakeManagerSlashing:v1");
    }

    /// @notice slash stake from a user for a specific role and distribute shares
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 18 decimals to slash
    /// @param employer recipient of the employer share
    function slash(address user, Role role, uint256 amount, address employer) external onlyDelegateCall {
        return _entry_slash(user, role, amount, employer);
    }

    function slash(address user, Role role, uint256 amount, address employer, address[] calldata validators)
        external
        onlyDelegateCall
    {
        return _entry_slash(user, role, amount, employer, validators);
    }

    /// @notice slash a validator's stake during dispute resolution
    /// @param user address whose stake will be reduced
    /// @param amount token amount with 18 decimals to slash
    /// @param recipient address receiving the slashed share
    function slash(address user, uint256 amount, address recipient) external onlyDelegateCall {
        return _entry_slash(user, amount, recipient);
    }

    function slash(address user, uint256 amount, address recipient, address[] calldata validators)
        external
        onlyDelegateCall
    {
        return _entry_slash(user, amount, recipient, validators);
    }

    /// @notice Governance-controlled emergency slashing helper.
    /// @dev Allows the timelock controller to claw back a percentage of stake
    ///      from a malicious participant and redirect it to a beneficiary.
    /// @param user Address of the staker whose funds are being slashed.
    /// @param role Stake role being slashed.
    /// @param pctBps Percentage of the user's stake to slash expressed in basis points (1/100 of a percent).
    /// @param beneficiary Address receiving the employer share of the slash.
    /// @return amount Amount of tokens removed from the user's stake (18 decimals).
    function governanceSlash(address user, Role role, uint256 pctBps, address beneficiary)
        external
        onlyDelegateCall
        returns (uint256 amount)
    {
        return _entry_governanceSlash(user, role, pctBps, beneficiary);
    }
}
