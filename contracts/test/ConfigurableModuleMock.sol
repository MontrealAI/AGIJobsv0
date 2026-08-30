// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ConfigurableModuleMock
/// @notice Minimal harness used by the OwnerConfigurator test-suite to ensure
///         setter calls are correctly forwarded and observable. The contract
///         purposely mirrors the simple pattern used by production modules:
///         state mutation behind an authorization boundary and structured
///         events for the owner console.
contract ConfigurableModuleMock {
    uint256 private _value;
    address public lastCaller;
    uint256 public lastPaymentReceived;

    error ValueMismatch(uint256 expected, uint256 actual);
    error PaymentMismatch(uint256 expected, uint256 supplied);

    event ValueChanged(uint256 previousValue, uint256 newValue, address caller);

    function setValue(uint256 newValue) external {
        _setValue(newValue);
    }

    function setValueGuarded(uint256 newValue, uint256 expectedCurrent) external {
        if (_value != expectedCurrent) {
            revert ValueMismatch(expectedCurrent, _value);
        }

        _setValue(newValue);
    }

    function setValueWithPayment(uint256 newValue, uint256 requiredPayment)
        external
        payable
    {
        if (msg.value != requiredPayment) {
            revert PaymentMismatch(requiredPayment, msg.value);
        }

        lastPaymentReceived = msg.value;
        _setValue(newValue);
    }

    function currentValue() external view returns (uint256) {
        return _value;
    }

    function _setValue(uint256 newValue) internal {
        uint256 previousValue = _value;
        _value = newValue;
        lastCaller = msg.sender;

        emit ValueChanged(previousValue, newValue, msg.sender);
    }
}
