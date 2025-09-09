// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable2Step} from "./utils/Ownable2Step.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";

/// @title TaxPolicy
/// @notice Stores canonical tax policy metadata and acknowledgement text.
/// @dev The owner may update the policy URI or acknowledgement, but neither the
/// contract nor the deploying corporation ever accrues direct, indirect, or
/// theoretical tax liability in any jurisdiction. It accepts no ether and
/// provides only an on-chain pointer for off-chain responsibilities. AGI
/// Employers, AGI Agents, and Validators bear all tax obligations while the
/// infrastructure and its owner remain perpetually exempt.
contract TaxPolicy is Ownable2Step, ITaxPolicy {
    /// @notice Off-chain document describing tax responsibilities.
    string private _policyURI;

    /// @notice Plain-text disclaimer accessible from explorers like Etherscan.
    string private _acknowledgement;

    /// @notice Incrementing version for the current policy text.
    uint256 private _version;

    /// @notice Tracks which policy version each address has acknowledged.
    mapping(address => uint256) private _acknowledgedVersion;

    /// @notice Addresses allowed to acknowledge the policy for others.
    mapping(address => bool) private _acknowledgers;

    /// @notice Thrown when an unauthorized address attempts to acknowledge for another user.
    error NotAcknowledger();

    /// @notice Emitted when the tax policy URI is updated.
    event TaxPolicyURIUpdated(string uri);

    /// @notice Emitted when the acknowledgement text is updated.
    event AcknowledgementUpdated(string text);

    /// @notice Emitted whenever the policy version changes.
    event PolicyVersionUpdated(uint256 version);

    /// @notice Emitted when the version is bumped without modifying text or URI.
    event PolicyVersionBumped(uint256 version);

    /// @notice Emitted when a user acknowledges the tax policy.
    /// @param user Address of the acknowledging participant.
    /// @param version Policy version that was acknowledged.
    event PolicyAcknowledged(address indexed user, uint256 version);

    /// @notice Emitted when an acknowledger permission changes.
    /// @param acknowledger Address being granted or revoked the role.
    /// @param allowed True if the address is allowed to acknowledge for others.
    event AcknowledgerUpdated(address indexed acknowledger, bool allowed);

    constructor(string memory uri, string memory ack) Ownable2Step(msg.sender) {
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

    /// @notice Allow or revoke an acknowledger address.
    /// @dev When `allowed` is true, `acknowledger` must be a non-zero address representing a valid contract or EOA.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external onlyOwner {
        if (allowed) require(acknowledger != address(0));
        _acknowledgers[acknowledger] = allowed;
        emit AcknowledgerUpdated(acknowledger, allowed);
    }

    /// @notice Record that the caller acknowledges the current tax policy.
    /// @dev Records `msg.sender`, so intermediary contracts acknowledge on their
    ///      own behalf. Contracts cannot spoof another user's acknowledgement;
    ///      meta-transaction forwarders must preserve the caller's address.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge()
        external
        override
        returns (string memory disclaimer)
    {
        address user = msg.sender;
        _acknowledgedVersion[user] = _version;
        emit PolicyAcknowledged(user, _version);
        return _acknowledgement;
    }

    /// @notice Record that `user` acknowledges the current tax policy.
    /// @param user Address of the participant acknowledging the policy.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledgeFor(address user)
        external
        override
        returns (string memory disclaimer)
    {
        if (msg.sender != user && !_acknowledgers[msg.sender]) revert NotAcknowledger();
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

    /// @notice Returns the policy version a user has acknowledged.
    /// @param user Address of the participant.
    /// @return version Policy version acknowledged by `user` (0 if never).
    function acknowledgedVersion(address user)
        external
        view
        override
        returns (uint256 version)
    {
        return _acknowledgedVersion[user];
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
        emit PolicyVersionBumped(_version);
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

