// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ITaxPolicy} from "./ITaxPolicy.sol";

/// @title IJobRegistryTax
/// @notice Minimal interface exposing the TaxPolicy reference from JobRegistry
interface IJobRegistryTax {
    /// @notice Returns the TaxPolicy contract storing canonical acknowledgements
    function taxPolicy() external view returns (ITaxPolicy);
}

