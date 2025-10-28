// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title AlphaNodeController
/// @notice Reference controller granting the operator full authority over orchestrator parameters.
contract AlphaNodeController {
    address private _owner;
    event ParameterUpdated(bytes32 indexed key, bytes value);
    event Paused(address indexed caller);
    event Resumed(address indexed caller);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    bool public paused;
    mapping(bytes32 => bytes) private _parameters;
    address private _pendingOwner;

    constructor(address initialOwner) {
        require(initialOwner != address(0), "invalid owner");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "only owner");
        _;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "invalid owner");
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(_owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == _pendingOwner, "not pending owner");
        address previous = _owner;
        _owner = _pendingOwner;
        _pendingOwner = address(0);
        emit OwnershipTransferred(previous, _owner);
    }

    function setParameter(bytes32 key, bytes calldata value) external onlyOwner {
        _parameters[key] = value;
        emit ParameterUpdated(key, value);
    }

    function getParameter(bytes32 key) external view returns (bytes memory) {
        return _parameters[key];
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function resume() external onlyOwner {
        paused = false;
        emit Resumed(msg.sender);
    }
}
