// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ICertificateNFT
/// @notice Interface for minting non-fungible job completion certificates
interface ICertificateNFT {
    /// @notice Thrown when the caller is not the JobRegistry
    error NotJobRegistry();

    /// @notice Emitted when a certificate is minted for a job
    /// @param to Recipient address of the NFT
    /// @param jobId Identifier of the job the certificate references
    event CertificateMinted(address indexed to, uint256 indexed jobId);

    /// @notice Mint a certificate NFT for a completed job
    /// @param to Recipient of the NFT
    /// @param jobId Identifier of the job being certified
    /// @param uri Optional metadata URI associated with the certificate
    /// @return tokenId The identifier of the minted token
    function mint(
        address to,
        uint256 jobId,
        string calldata uri
    ) external returns (uint256 tokenId);
}

