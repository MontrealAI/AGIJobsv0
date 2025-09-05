# AGIALPHAToken API

ERC‑20 token with 18 decimals used for payments and staking. The live `$AGIALPHA` token is external; this contract resides at [`contracts/test/AGIALPHAToken.sol`](../../contracts/test/AGIALPHAToken.sol) for local testing.

## Functions

- `decimals()` – returns fixed 18 decimal places.
- `mint(address to, uint256 amount)` – owner mints tokens.
- `burn(address from, uint256 amount)` – owner burns tokens from an address.

## Events

Uses standard ERC‑20 `Transfer` and `Approval` events.
