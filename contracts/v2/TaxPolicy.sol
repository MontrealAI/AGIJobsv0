// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TaxPolicy
/// @notice Stores a canonical tax policy URI and acknowledgement helper.
/// @dev Contract owner alone may update the policy URI. The contract never holds
/// funds and exists solely to provide an on-chain reference for off-chain tax
/// responsibilities. AGI Employers, AGI Agents, and Validators remain fully
/// responsible for their own tax obligations; the contract and its owner are
/// always tax‑exempt.
contract TaxPolicy is Ownable {
    /// @notice Off-chain document describing tax responsibilities.
    string public policyURI;

    /// @notice Emitted when the tax policy URI is updated.
    event TaxPolicyURIUpdated(string uri);

    constructor(address owner_, string memory uri) Ownable(owner_) {
        policyURI = uri;
        emit TaxPolicyURIUpdated(uri);
    }

    /// @notice Updates the off-chain policy URI.
    /// @param uri New URI pointing to policy text (e.g., IPFS hash).
    function setPolicyURI(string calldata uri) external onlyOwner {
        policyURI = uri;
        emit TaxPolicyURIUpdated(uri);
    }

    /// @notice Returns a human-readable disclaimer for explorers like Etherscan.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge() external pure returns (string memory disclaimer) {
        return
            "AGI Employers, Agents, and Validators handle all taxes; the contract and owner are tax-exempt.";
    }
}

