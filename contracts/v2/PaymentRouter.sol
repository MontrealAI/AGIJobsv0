// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AGIALPHA_DECIMALS} from "./Constants.sol";

/// @title PaymentRouter
/// @notice Routes ERC20 transfers for the AGI Jobs protocol with a configurable token.
contract PaymentRouter is Governable {
    using SafeERC20 for IERC20;

    error InvalidToken();
    error InvalidTokenDecimals();

    IERC20 private _token;

    event TokenUpdated(address indexed newToken);

    constructor(address token_, address governance_) Governable(governance_) {
        _setToken(token_);
    }

    function token() external view returns (IERC20) {
        return _token;
    }

    function setToken(address newToken) external onlyGovernance {
        _setToken(newToken);
    }

    function transfer(address to, uint256 amount) external {
        _token.safeTransfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        _token.safeTransferFrom(from, to, amount);
    }

    function _setToken(address newToken) internal {
        if (newToken == address(0)) revert InvalidToken();
        if (IERC20Metadata(newToken).decimals() != AGIALPHA_DECIMALS) revert InvalidTokenDecimals();
        _token = IERC20(newToken);
        emit TokenUpdated(newToken);
    }
}
