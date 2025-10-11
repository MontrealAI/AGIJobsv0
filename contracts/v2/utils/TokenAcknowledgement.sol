// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title TokenAcknowledgement
/// @notice Utility helpers to acknowledge non-standard ERC20 token terms.
/// @dev The canonical $AGIALPHA token requires contracts to call `acceptTerms`
///      before they can transfer tokens. This library performs a best-effort
///      acknowledgement that tolerates tokens without this extension while
///      reverting when acknowledgement is expected but still missing.
library TokenAcknowledgement {
    error TokenTermsUnacknowledged(address token, address actor);

    bytes4 private constant HAS_ACK_SELECTOR = bytes4(keccak256("hasAcknowledged(address)"));
    bytes4 private constant ACCEPT_TERMS_SELECTOR = bytes4(keccak256("acceptTerms()"));

    /// @notice Attempts to ensure that `actor` acknowledged the token terms.
    /// @param token Address of the ERC20 token contract.
    /// @param actor Address that must be able to transfer the token.
    function acknowledge(address token, address actor) internal {
        if (token == address(0) || actor == address(0)) {
            return;
        }

        if (!_supportsAcknowledgement(token)) {
            // The token does not expose acknowledgement helpers. Nothing else to do.
            return;
        }

        if (_hasAcknowledged(token, actor)) {
            return;
        }

        // Attempt acknowledgement via the non-standard extension. Ignore the
        // return value because the function does not return anything. Any
        // revert will bubble up and be caught by the subsequent check.
        (bool success, ) = token.call(abi.encodeWithSelector(ACCEPT_TERMS_SELECTOR));
        if (!success) {
            revert TokenTermsUnacknowledged(token, actor);
        }

        if (!_hasAcknowledged(token, actor)) {
            revert TokenTermsUnacknowledged(token, actor);
        }
    }

    function _supportsAcknowledgement(address token) private view returns (bool) {
        if (token.code.length == 0) {
            return false;
        }
        (bool ok, ) = token.staticcall(abi.encodeWithSelector(HAS_ACK_SELECTOR, address(this)));
        return ok;
    }

    function _hasAcknowledged(address token, address actor) private view returns (bool) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(HAS_ACK_SELECTOR, actor));
        return ok && data.length >= 32 && abi.decode(data, (bool));
    }
}
