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

    /// @dev Reverts when attempting to configure an invalid base URI
    error InvalidBaseURI();

    /// @dev Reverts when attempting to update the base URI after initial set
    error BaseURIAlreadySet();

    /// @dev Reverts when querying metadata before a base URI has been set
    error BaseURINotSet();

    /// @dev Reverts when batch mint parameters exceed the supported bound
    error BatchSizeExceeded(uint256 attempted, uint256 maxAllowed);

    /// @dev Reverts when batch mint parameter lengths do not match
    error ArrayLengthMismatch();

    event CertificateMinted(address indexed to, uint256 indexed jobId, bytes32 uriHash);
    event BaseURISet(string baseURI);

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

    /// @notice Mint multiple completion certificates in a bounded batch
    /// @param recipients Recipients for each certificate
    /// @param jobIds Identifiers for the corresponding jobs / tokenIds
    /// @param uriHashes Metadata hashes for each certificate
    /// @return tokenIds Array of minted token identifiers
    function mintBatch(
        address[] calldata recipients,
        uint256[] calldata jobIds,
        bytes32[] calldata uriHashes
    ) external returns (uint256[] memory tokenIds);

    /// @notice Returns the immutable base token URI
    function baseURI() external view returns (string memory);
}

