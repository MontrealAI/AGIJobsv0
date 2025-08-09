// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TaxPolicy
/// @notice Stores canonical tax policy metadata and acknowledgement text.
/// @dev Contract owner alone may update the policy URI or acknowledgement.
/// The contract never holds funds and exists solely to provide an on-chain
/// reference for off-chain tax responsibilities. AGI Employers, AGI Agents, and
/// Validators remain fully responsible for their own tax obligations; the
/// contract and its owner are always tax-exempt.
contract TaxPolicy is Ownable {
    /// @notice Off-chain document describing tax responsibilities.
    string public policyURI;

    /// @notice Plain-text disclaimer accessible from explorers like Etherscan.
    string public acknowledgement;

    /// @notice Emitted when the tax policy URI is updated.
    event TaxPolicyURIUpdated(string uri);

    /// @notice Emitted when the acknowledgement text is updated.
    event AcknowledgementUpdated(string text);

    constructor(address owner_, string memory uri, string memory ack)
        Ownable(owner_)
    {
        policyURI = uri;
        acknowledgement = ack;
        emit TaxPolicyURIUpdated(uri);
        emit AcknowledgementUpdated(ack);
    }

    /// @notice Updates the off-chain policy URI.
    /// @param uri New URI pointing to policy text (e.g., IPFS hash).
    function setPolicyURI(string calldata uri) external onlyOwner {
        policyURI = uri;
        emit TaxPolicyURIUpdated(uri);
    }

    /// @notice Updates the acknowledgement text returned on-chain.
    /// @param text Human-readable disclaimer for participants.
    function setAcknowledgement(string calldata text) external onlyOwner {
        acknowledgement = text;
        emit AcknowledgementUpdated(text);
    }

    /// @notice Returns a human-readable disclaimer confirming tax obligations.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge() external view returns (string memory disclaimer) {
        return acknowledgement;
    }
}

