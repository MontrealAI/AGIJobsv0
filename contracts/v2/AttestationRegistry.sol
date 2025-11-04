// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

error UnauthorizedAttestor();
error ZeroAddress();

/// @title AttestationRegistry
/// @notice Allows ENS name owners to grant and revoke attestations
/// for specific roles to other addresses.
contract AttestationRegistry is Ownable, Pausable {
    /// @dev Roles that can be attested for a name.
    enum Role {
        Agent,
        Validator,
        Node
    }

    IENS public ens;
    INameWrapper public nameWrapper;

    /// @notice Mapping of node => role => address => attested
    mapping(bytes32 => mapping(Role => mapping(address => bool))) public attestations;

    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event Attested(bytes32 indexed node, Role indexed role, address indexed who, address attestor);
    event Revoked(bytes32 indexed node, Role indexed role, address indexed who, address attestor);

    constructor(IENS _ens, INameWrapper _nameWrapper) Ownable(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
    }

    function setENS(address ensAddr) external onlyOwner {
        if (ensAddr == address(0)) {
            revert ZeroAddress();
        }
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) external onlyOwner {
        if (wrapper == address(0)) {
            revert ZeroAddress();
        }
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function _ownerOf(bytes32 node) internal view returns (address) {
        if (address(nameWrapper) != address(0)) {
            try nameWrapper.ownerOf(uint256(node)) returns (address owner) {
                if (owner != address(0)) {
                    return owner;
                }
            } catch {}
        }
        if (address(ens) != address(0)) {
            try ens.owner(node) returns (address ensOwner) {
                return ensOwner;
            } catch {}
        }
        return address(0);
    }

    /// @notice Attest that `who` holds `role` for `node`.
    function attest(bytes32 node, Role role, address who) external whenNotPaused {
        if (who == address(0)) {
            revert ZeroAddress();
        }
        if (_ownerOf(node) != msg.sender) {
            revert UnauthorizedAttestor();
        }
        attestations[node][role][who] = true;
        emit Attested(node, role, who, msg.sender);
    }

    /// @notice Revoke a previously granted attestation.
    function revoke(bytes32 node, Role role, address who) external whenNotPaused {
        if (_ownerOf(node) != msg.sender) {
            revert UnauthorizedAttestor();
        }
        attestations[node][role][who] = false;
        emit Revoked(node, role, who, msg.sender);
    }

    /// @notice Pause attestation mutations in case of compromise.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume attestation mutations after recovery.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Check whether `who` has been attested for `role` on `node`.
    function isAttested(bytes32 node, Role role, address who) external view returns (bool) {
        return attestations[node][role][who];
    }
}

