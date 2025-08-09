// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";

/// @title TaxPolicy
/// @notice Stores canonical tax policy metadata and acknowledgement text.
/// @dev The owner may update the policy URI or acknowledgement, but neither the
/// contract nor the deploying corporation ever accrues direct, indirect, or
/// theoretical tax liability in any jurisdiction. It accepts no ether and
/// provides only an on-chain pointer for off-chain responsibilities. AGI
/// Employers, AGI Agents, and Validators bear all tax obligations while the
/// infrastructure and its owner remain perpetually exempt.
contract TaxPolicy is Ownable, ITaxPolicy {
    /// @notice Off-chain document describing tax responsibilities.
    string private _policyURI;

    /// @notice Plain-text disclaimer accessible from explorers like Etherscan.
    string private _acknowledgement;

    /// @notice Incrementing version for the current policy text.
    uint256 private _version;

    /// @notice Emitted when the tax policy URI is updated.
    event TaxPolicyURIUpdated(string uri);

    /// @notice Emitted when the acknowledgement text is updated.
    event AcknowledgementUpdated(string text);

    /// @notice Emitted whenever the policy version changes.
    event PolicyVersionUpdated(uint256 version);

    constructor(address owner_, string memory uri, string memory ack)
        Ownable(owner_)
    {
        _policyURI = uri;
        _acknowledgement = ack;
        _version = 1;
        emit TaxPolicyURIUpdated(uri);
        emit AcknowledgementUpdated(ack);
        emit PolicyVersionUpdated(1);
    }

    /// @notice Updates the off-chain policy URI.
    /// @param uri New URI pointing to policy text (e.g., IPFS hash).
    function setPolicyURI(string calldata uri) external onlyOwner {
        _policyURI = uri;
        _version += 1;
        emit TaxPolicyURIUpdated(uri);
        emit PolicyVersionUpdated(_version);
    }

    /// @notice Updates the acknowledgement text returned on-chain.
    /// @param text Human-readable disclaimer for participants.
    function setAcknowledgement(string calldata text) external onlyOwner {
        _acknowledgement = text;
        _version += 1;
        emit AcknowledgementUpdated(text);
        emit PolicyVersionUpdated(_version);
    }

    /// @notice Atomically updates both the policy URI and acknowledgement text.
    /// @param uri New URI pointing to the policy text.
    /// @param text Human-readable disclaimer for participants.
    function setPolicy(string calldata uri, string calldata text) external onlyOwner {
        _policyURI = uri;
        _acknowledgement = text;
        _version += 1;
        emit TaxPolicyURIUpdated(uri);
        emit AcknowledgementUpdated(text);
        emit PolicyVersionUpdated(_version);
    }

    /// @notice Returns a human-readable disclaimer confirming tax obligations.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge() external view returns (string memory disclaimer) {
        return _acknowledgement;
    }

    /// @notice Returns the URI pointing to the canonical policy document.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function policyURI() external view returns (string memory uri) {
        return _policyURI;
    }

    /// @notice Convenience helper returning both acknowledgement and policy URI.
    /// @return ack Plain-text disclaimer confirming participant tax duties.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function policyDetails()
        external
        view
        returns (string memory ack, string memory uri)
    {
        ack = _acknowledgement;
        uri = _policyURI;
    }

    /// @notice Returns the current policy version.
    function policyVersion() external view returns (uint256) {
        return _version;
    }

    /// @notice Bumps the policy version without changing text or URI.
    function bumpPolicyVersion() external onlyOwner {
        _version += 1;
        emit PolicyVersionUpdated(_version);
    }

    /// @notice Confirms the contract and its owner are perpetually tax‑exempt.
    /// @return True, signalling that no tax liability can ever accrue here.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Rejects any incoming ether.
    receive() external payable {
        revert("TaxPolicy: no ether");
    }

    /// @dev Rejects calls with unexpected calldata or funds.
    fallback() external payable {
        revert("TaxPolicy: no ether");
    }
}

