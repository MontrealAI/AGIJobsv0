// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title ICertificateNFT
/// @notice Interface for minting non-fungible job completion certificates
interface ICertificateNFT {
    event BaseURIUpdated(string uri);

    function mint(address to, uint256 jobId, string calldata uri) external returns (uint256 tokenId);

    /// @notice Owner function to set metadata base URI
    function setBaseURI(string calldata uri) external;
}

