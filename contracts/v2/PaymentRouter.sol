// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPaymentRouter} from "./interfaces/IPaymentRouter.sol";

/// @title PaymentRouter
/// @notice Routes token transfers and allows the owner to update the token
contract PaymentRouter is Ownable, IPaymentRouter {
    using SafeERC20 for IERC20;

    /// @inheritdoc IPaymentRouter
    IERC20 public token;

    event TokenUpdated(address indexed token);

    constructor(IERC20 _token) Ownable(msg.sender) {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    /// @notice Update the ERC20 token used for transfers
    /// @param _token New token address
    function setToken(IERC20 _token) external onlyOwner {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    /// @inheritdoc IPaymentRouter
    function transfer(address to, uint256 amt) external override {
        token.safeTransferFrom(msg.sender, to, amt);
    }
}

