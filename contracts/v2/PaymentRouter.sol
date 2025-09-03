// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";
import {AGIALPHA, AGIALPHA_DECIMALS} from "./Constants.sol";
import {IPaymentRouter} from "./interfaces/IPaymentRouter.sol";

error InvalidTokenDecimals();
error ZeroAddress();

/// @title PaymentRouter
/// @notice Handles token transfers and allows governance to upgrade the token
contract PaymentRouter is IPaymentRouter, Governable {
    using SafeERC20 for IERC20;

    IERC20 private _token;

    event TokenUpdated(address indexed token);

    constructor(address _governance) Governable(_governance) {
        _setToken(AGIALPHA);
    }

    function token() public view returns (address) {
        return address(_token);
    }

    function updateToken(address newToken) external onlyGovernance {
        _setToken(newToken);
    }

    function _setToken(address newToken) internal {
        if (newToken == address(0)) revert ZeroAddress();
        if (IERC20Metadata(newToken).decimals() != AGIALPHA_DECIMALS) {
            revert InvalidTokenDecimals();
        }
        _token = IERC20(newToken);
        emit TokenUpdated(newToken);
    }

    function transfer(address to, uint256 amount) external {
        _token.safeTransferFrom(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        _token.safeTransferFrom(from, to, amount);
    }

    function burn(address from, uint256 amount) external {
        _token.safeTransferFrom(from, address(this), amount);
        IERC20Burnable(address(_token)).burn(amount);
    }
}

