# Corrective Successor Deployment (AGIJobManager)

- Mainnet AGIALPHA is pinned to `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`.
- Employers fund **payout escrow + burn** at job creation.
- Burn is non-refundable and occurs only once at `createJob`.

## Deploy

```bash
npm run compile
npx hardhat run scripts/release/deploy-agijobmanager-mainnet.ts --network mainnet
```

Required env:
- `OWNER_ADDRESS`
- `AGIALPHA_TOKEN=0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`
- `EMPLOYER_BURN_BPS`
