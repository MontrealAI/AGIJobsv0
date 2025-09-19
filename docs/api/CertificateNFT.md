# CertificateNFT API

ERC‑721 completion certificates with optional marketplace.

## Functions

- `setJobRegistry(address registry)` / `setStakeManager(address manager)` – owner wires modules.
- `setBaseURI(string baseURI)` – owner supplies an immutable IPFS prefix; reverts on second call or empty strings.
- `mint(address to, uint256 jobId, string uri)` – JobRegistry mints certificate.
- `tokenURI(uint256 tokenId)` – returns `baseURI + tokenId` once the prefix is set.
- `list(uint256 tokenId, uint256 price)` – certificate holder lists for sale.
- `purchase(uint256 tokenId)` – buy listed certificate.
- `delist(uint256 tokenId)` – remove listing.

## Events

- `JobRegistryUpdated(address registry)`
- `StakeManagerUpdated(address manager)`
- `BaseURISet(string baseURI)`
- `NFTListed(uint256 tokenId, address seller, uint256 price)`
- `NFTPurchased(uint256 tokenId, address buyer, uint256 price)`
- `NFTDelisted(uint256 tokenId)`
