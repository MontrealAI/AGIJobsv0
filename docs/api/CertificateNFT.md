# CertificateNFT API

ERC‑721 completion certificates with optional marketplace.

## Functions

- `setJobRegistry(address registry)` / `setStakeManager(address manager)` – owner wires modules.
- `setBaseURI(string baseURI)` – permanently configure the IPFS base CID for metadata.
- `mint(address to, uint256 jobId, bytes32 uriHash)` – JobRegistry mints certificate with metadata hash binding.
- `tokenURI(uint256 tokenId)` – returns `ipfs://` URI derived from the base CID and stored hash.
- `list(uint256 tokenId, uint256 price)` – certificate holder lists for sale.
- `purchase(uint256 tokenId)` – buy listed certificate.
- `delist(uint256 tokenId)` – remove listing.

## Events

- `JobRegistryUpdated(address registry)`
- `StakeManagerUpdated(address manager)`
- `NFTListed(uint256 tokenId, address seller, uint256 price)`
- `NFTPurchased(uint256 tokenId, address buyer, uint256 price)`
- `NFTDelisted(uint256 tokenId)`
- `BaseURISet(string baseURI)`
