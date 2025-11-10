// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract AgialphaStub {
    string public constant name = "AGI ALPHA";
    string public constant symbol = "AGIALPHA";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(from == msg.sender || currentAllowance >= amount, "allowance");
        if (from != msg.sender) {
            unchecked {
                _approve(from, msg.sender, currentAllowance - amount);
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) public {
        require(to != address(0), "mint to zero");
        totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) public {
        require(from != address(0), "burn from zero");
        if (from != msg.sender) {
            uint256 currentAllowance = _allowances[from][msg.sender];
            require(currentAllowance >= amount, "allowance");
            unchecked {
                _approve(from, msg.sender, currentAllowance - amount);
            }
        }
        _burn(from, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) public {
        burn(from, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 balance = _balances[from];
        require(balance >= amount, "burn amount exceeds balance");
        unchecked {
            _balances[from] = balance - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "transfer zero");
        uint256 balance = _balances[from];
        require(balance >= amount, "balance");
        unchecked {
            _balances[from] = balance - amount;
        }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0) && spender != address(0), "approve zero");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
