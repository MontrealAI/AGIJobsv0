// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title InsightAccessToken
/// @notice Owner mintable ERC-20 token used for settling foresight trades in the demo marketplace.
contract InsightAccessToken is ERC20, ERC20Pausable, Ownable {
    address private _systemPause;

    event SystemPauseUpdated(address indexed systemPause);

    constructor(address owner_) ERC20(unicode"α-AGI Insight Credit", "AIC") Ownable(owner_) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function systemPause() external view returns (address) {
        return _systemPause;
    }

    function setSystemPause(address newSystemPause) external onlyOwner {
        _systemPause = newSystemPause;
        emit SystemPauseUpdated(newSystemPause);
    }

    modifier onlyOwnerOrSystemPause() {
        if (msg.sender != owner() && msg.sender != _systemPause) {
            revert("NOT_AUTHORIZED");
        }
        _;
    }

    function pause() external onlyOwnerOrSystemPause {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 amount) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, amount);
    }
}
