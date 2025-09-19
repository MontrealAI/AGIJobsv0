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

    /// @dev Reverts when the immutable base URI has not been configured
    error BaseURIUnset();

    /// @dev Reverts when batch minting arrays differ in length
    error ArrayLengthMismatch();

    /// @dev Reverts when attempting to batch mint zero certificates
    error EmptyBatch();

    /// @dev Reverts when batch minting exceeds the configured limit
    error BatchMintLimitExceeded(uint256 size, uint256 max);

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

    /// @notice Mint multiple completion certificates in a single call
    /// @param recipients Recipients for each certificate
    /// @param jobIds Identifiers of the jobs; double as the tokenIds
    /// @param uriHashes Hashes of the metadata URIs for each certificate
    /// @return tokenIds Array of minted certificate identifiers
    function batchMint(
        address[] calldata recipients,
        uint256[] calldata jobIds,
        bytes32[] calldata uriHashes
    ) external returns (uint256[] memory tokenIds);
}

