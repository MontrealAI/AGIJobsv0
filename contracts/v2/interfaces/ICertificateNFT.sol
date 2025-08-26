// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ICertificateNFT
/// @notice Interface for minting non-fungible job completion certificates
interface ICertificateNFT {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);
    /// @dev Reverts when caller is not the authorised JobRegistry
    error NotJobRegistry(address caller);

    /// @dev Reverts when attempting to mint more than once for the same job
    error CertificateAlreadyMinted(uint256 jobId);

    /// @dev Reverts when an empty metadata hash is supplied
    error EmptyURI();

    event CertificateMinted(address indexed to, uint256 indexed jobId, bytes32 uriHash);

    /// @notice Mint a completion certificate NFT for a job
    /// @param to Recipient of the certificate
    /// @param jobId Identifier of the job; doubles as the NFT tokenId
    /// @param uriHash Hash of the metadata URI for the certificate
    /// @return tokenId The identifier of the minted certificate
    /// @dev Reverts with {NotJobRegistry} if called by an unauthorised address
    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external returns (uint256 tokenId);
}

