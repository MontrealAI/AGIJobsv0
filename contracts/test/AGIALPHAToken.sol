// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AGIALPHA_DECIMALS} from "../v2/Constants.sol";

/// @title AGIALPHAToken
/// @notice ERC20 token with 18 decimals used across AGI Jobs v2.
/// @dev Owner can mint or burn to maintain full control. Decimals set to 18
///      for standard ERC20 compatibility. The
///      contract holds no special tax logic and never accepts ether to
///      preserve tax neutrality for the owner.
contract AGIALPHAToken is ERC20, Ownable {

    /// @notice tracks addresses that acknowledged token terms
    mapping(address => bool) private _acknowledged;

    /// @notice emitted when an address accepts token terms
    event TermsAccepted(address indexed account);

    constructor() ERC20("AGI ALPHA", "AGIALPHA") Ownable(msg.sender) {
        _acknowledged[msg.sender] = true;
    }

    /// @notice Returns token decimals (18).
    /// @dev Uses shared constant to guarantee consistency across contracts.
    function decimals() public pure override returns (uint8) {
        return AGIALPHA_DECIMALS;
    }

    // ---------------------------------------------------------------------
    // Terms acknowledgement
    // ---------------------------------------------------------------------

    /// @notice Accepts token terms required for transfers.
    function acceptTerms() external {
        _acknowledged[msg.sender] = true;
        emit TermsAccepted(msg.sender);
    }

    /// @notice Returns whether an address has accepted token terms.
    /// @param account address to query
    function hasAcknowledged(address account) public view returns (bool) {
        return _acknowledged[account];
    }

    /// @dev Require acknowledgement for non-owner transfers.
    function _update(address from, address to, uint256 value) internal override {
        bool ownerOp = msg.sender == owner() || from == owner() || to == owner();
        if (!ownerOp && from != address(0)) {
            require(hasAcknowledged(from), "AGIALPHA: sender not acknowledged");
        }
        super._update(from, to, value);
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Mint new tokens to an address.
    /// @param to recipient of minted tokens
    /// @param amount token amount with 18 decimals
    function mint(address to, uint256 amount) external onlyOwner {
        _acknowledged[to] = true;
        _mint(to, amount);
    }

    /// @notice Burn tokens from an address.
    /// @param from address holding the tokens
    /// @param amount token amount with 18 decimals
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /// @dev Reject direct ETH transfers to preserve tax neutrality.
    receive() external payable {
        revert("AGIALPHA: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("AGIALPHA: no ether");
    }
}

