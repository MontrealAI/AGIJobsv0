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

    /// @notice Tracks which policy version each address has acknowledged.
    mapping(address => uint256) private _acknowledgedVersion;

    /// @notice Emitted when the tax policy URI is updated.
    event TaxPolicyURIUpdated(string uri);

    /// @notice Emitted when the acknowledgement text is updated.
    event AcknowledgementUpdated(string text);

    /// @notice Emitted whenever the policy version changes.
    event PolicyVersionUpdated(uint256 version);

    /// @notice Emitted when a user acknowledges the tax policy.
    /// @param user Address of the acknowledging participant.
    /// @param version Policy version that was acknowledged.
    event PolicyAcknowledged(address indexed user, uint256 version);

    constructor(string memory uri, string memory ack) Ownable(msg.sender) {
        _policyURI = uri;
        _acknowledgement = ack;
        _version = 1;
        emit TaxPolicyURIUpdated(uri);
        emit AcknowledgementUpdated(ack);
        emit PolicyVersionUpdated(1);
    }
    
    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

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

    /// @notice Record that the transaction origin acknowledges the current tax policy.
    /// @dev Records `tx.origin` so helper contracts can funnel acknowledgements
    ///      while still binding the originating EOA. Contracts cannot spoof
    ///      another user's acknowledgement.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge()
        external
        override
        returns (string memory disclaimer)
    {
        address user = tx.origin;
        _acknowledgedVersion[user] = _version;
        emit PolicyAcknowledged(user, _version);
        return _acknowledgement;
    }

    /// @notice Check if a user has acknowledged the policy.
    function hasAcknowledged(address user)
        external
        view
        override
        returns (bool)
    {
        return _acknowledgedVersion[user] == _version;
    }

    /// @notice Returns the acknowledgement text without recording acceptance.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledgement()
        external
        view
        override
        returns (string memory disclaimer)
    {
        return _acknowledgement;
    }

    /// @notice Returns the URI pointing to the canonical policy document.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function policyURI() external view override returns (string memory uri) {
        return _policyURI;
    }

    /// @notice Convenience helper returning both acknowledgement and policy URI.
    /// @return ack Plain-text disclaimer confirming participant tax duties.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function policyDetails()
        external
        view
        override
        returns (string memory ack, string memory uri)
    {
        ack = _acknowledgement;
        uri = _policyURI;
    }

    /// @notice Returns the current policy version.
    function policyVersion() external view override returns (uint256) {
        return _version;
    }

    /// @notice Bumps the policy version without changing text or URI.
    function bumpPolicyVersion() external override onlyOwner {
        _version += 1;
        emit PolicyVersionUpdated(_version);
    }

    /// @notice Confirms the contract and its owner are perpetually tax‑exempt.
    /// @return True, signalling that no tax liability can ever accrue here.
    function isTaxExempt() external pure override returns (bool) {
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

