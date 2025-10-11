// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TokenAcknowledgement} from "../utils/TokenAcknowledgement.sol";

/// @title EscrowVault
/// @notice Holds job rewards until the registry resolves the job outcome.
contract EscrowVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public controller;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    mapping(uint256 => uint256) private _escrowed;

    event ControllerUpdated(address indexed controller);
    event EscrowDeposited(uint256 indexed jobId, address indexed from, uint256 amount);
    event EscrowReleased(uint256 indexed jobId, address indexed to, uint256 amount);
    event EscrowRefunded(uint256 indexed jobId, address indexed to, uint256 amount);
    event EscrowBurned(uint256 indexed jobId, uint256 amount);

    error ZeroAddress();
    error NotController();
    error ZeroAmount();
    error InsufficientEscrow();

    constructor(IERC20 token_, address owner_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        TokenAcknowledgement.acknowledge(address(token_), address(this));
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    function setController(address controller_) external onlyOwner {
        if (controller_ == address(0)) revert ZeroAddress();
        controller = controller_;
        emit ControllerUpdated(controller_);
    }

    function balanceOf(uint256 jobId) external view returns (uint256) {
        return _escrowed[jobId];
    }

    function deposit(uint256 jobId, address from, uint256 amount) external onlyController nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(from, address(this), amount);
        _escrowed[jobId] += amount;
        emit EscrowDeposited(jobId, from, amount);
    }

    function release(uint256 jobId, address to, uint256 amount) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 balance = _escrowed[jobId];
        if (balance < amount) revert InsufficientEscrow();
        _escrowed[jobId] = balance - amount;
        token.safeTransfer(to, amount);
        emit EscrowReleased(jobId, to, amount);
    }

    function refund(uint256 jobId, address to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = _escrowed[jobId];
        if (amount == 0) revert ZeroAmount();
        _escrowed[jobId] = 0;
        token.safeTransfer(to, amount);
        emit EscrowRefunded(jobId, to, amount);
    }

    function burn(uint256 jobId, uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = _escrowed[jobId];
        if (balance < amount) revert InsufficientEscrow();
        _escrowed[jobId] = balance - amount;
        token.safeTransfer(BURN_ADDRESS, amount);
        emit EscrowBurned(jobId, amount);
    }
}
