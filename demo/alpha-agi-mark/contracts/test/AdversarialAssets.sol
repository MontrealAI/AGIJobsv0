// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITestLaunchVault {
    function notifyLaunch(uint256 amount, bool usedNativeAsset, bytes calldata metadata) external returns (bool);
}

/// @dev Test-only token; configurable fees model assets the fixed-unit curve must reject.
contract FeeAsset is ERC20 {
    uint256 public feeBps;
    bool public chargeSender;

    constructor() ERC20("Fee asset test fixture", "FEE") {}

    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFee(uint256 feeBps_, bool chargeSender_) external {
        feeBps = feeBps_;
        chargeSender = chargeSender_;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = amount * feeBps / 10000;
            if (chargeSender) {
                super._update(from, address(0), fee);
                super._update(from, to, amount);
            } else {
                super._update(from, address(0), fee);
                super._update(from, to, amount - fee);
            }
        } else {
            super._update(from, to, amount);
        }
    }
}

/// @dev Separates transfer from notification so vault receipt guards can be attacked directly.
contract LaunchSourceFixture {
    address public baseAsset;
    bool public usesNativeAsset;

    constructor(address asset) {
        baseAsset = asset;
        usesNativeAsset = asset == address(0);
    }

    function acknowledge(address vault, uint256 amount, bool usedNative) external returns (bool) {
        return ITestLaunchVault(vault).notifyLaunch(amount, usedNative, "0x");
    }

    function deposit(address payable vault) external payable {
        (bool success, ) = vault.call{value: msg.value}("");
        require(success, "Deposit failed");
    }
}
