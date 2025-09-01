// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";

abstract contract TaxAcknowledgement {
    error TaxPolicyNotAcknowledged(address account);

    modifier requiresTaxAcknowledgement(
        ITaxPolicy policy,
        address account,
        address owner,
        address exempt1,
        address exempt2
    ) {
        if (
            account != owner &&
            account != exempt1 &&
            account != exempt2 &&
            address(policy) != address(0)
        ) {
            if (!policy.hasAcknowledged(account)) {
                revert TaxPolicyNotAcknowledged(account);
            }
        }
        _;
    }
}
