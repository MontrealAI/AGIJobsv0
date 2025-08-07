// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title ICertificateNFT
/// @notice Interface for minting non-fungible job completion certificates
interface ICertificateNFT {
    function mint(address to, uint256 jobId, string calldata uri) external returns (uint256 tokenId);
}

