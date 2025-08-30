// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";

/// @title CertificateNFT (module)
/// @notice ERC721 certificate minted upon successful job completion.
/// @dev Only participants bear any tax obligations; the contract holds no
///      ether and rejects unsolicited transfers.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;

    event JobRegistryUpdated(address registry);

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external onlyJobRegistry returns (uint256 tokenId) {
        if (uriHash == bytes32(0)) revert EmptyURI();
        tokenId = jobId;
        _safeMint(to, tokenId);
        tokenHashes[tokenId] = uriHash;
        emit CertificateMinted(to, jobId, uriHash);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        revert("Off-chain URI");
    }

    /// @notice Confirms this NFT module and owner remain tax neutral.
    /// @return Always true, indicating no tax liabilities can accrue.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract and its owner
    /// free of taxable assets.
    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("CertificateNFT: no ether");
    }
}

