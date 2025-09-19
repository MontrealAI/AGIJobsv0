# CertificateNFT API

ERC‑721 completion certificates with optional marketplace.

## Functions

- `setJobRegistry(address registry)` / `setStakeManager(address manager)` – owner wires modules.
- `setBaseURI(string baseURI)` – owner sets the immutable IPFS base CID.
- `mint(address to, uint256 jobId, bytes32 uriHash)` – JobRegistry mints a certificate anchored to the provided metadata hash.
- `batchMint(address[] to, uint256[] jobIds, bytes32[] uriHashes)` – JobRegistry mints multiple certificates (bounded batch).
- `tokenURI(uint256 tokenId)` – returns `baseURI` concatenated with the stored metadata hash in hex.
- `list(uint256 tokenId, uint256 price)` – certificate holder lists for sale.
- `purchase(uint256 tokenId)` – buy listed certificate.
- `delist(uint256 tokenId)` – remove listing.

## Events

- `JobRegistryUpdated(address registry)`
- `StakeManagerUpdated(address manager)`
- `BaseURISet(string baseURI)`
- `CertificateMinted(address to, uint256 jobId, bytes32 uriHash)`
- `NFTListed(uint256 tokenId, address seller, uint256 price)`
- `NFTPurchased(uint256 tokenId, address buyer, uint256 price)`
- `NFTDelisted(uint256 tokenId)`
