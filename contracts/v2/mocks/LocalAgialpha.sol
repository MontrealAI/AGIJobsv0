// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title LocalAgialpha
/// @notice Minimal ERC20 stub deployed at the canonical $AGIALPHA address for
///         local demonstrations. This contract intentionally omits access
///         controls and complex tokenomics—only the primitives required by the
///         demo are implemented.
contract LocalAgialpha {
    string public constant name = "AGI ALPHA";
    string public constant symbol = "AGIALPHA";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        require(permitted >= amount, "allowance");
        unchecked {
            allowance[from][msg.sender] = permitted - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        uint256 balance = balanceOf[from];
        require(balance >= amount, "balance");

        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
    }
}
