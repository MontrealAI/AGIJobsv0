# Corrective Successor Hardhat Workflow

## 1) Doctor / preflight
```bash
npm run ci:preflight
npm run compile
node scripts/release/check-agijobmanager-size.js
```

## 2) Release build
```bash
npm run release:manifest
```

## 3) Dry-run
```bash
npx hardhat run scripts/release/deploy-agijobmanager-mainnet.ts --network sepolia
```

## 4) Mainnet deploy
```bash
npx hardhat run scripts/release/deploy-agijobmanager-mainnet.ts --network mainnet
```

## 5) Verify
```bash
npm run release:verify
```

## 6) Post-deploy validation
Confirm:
- deployed manager address
- owner address
- AGIALPHA pinning
- employer burn bps
- read helper availability
- `withdrawAGI` succeeds only within `withdrawableAGI()`
- ENS wiring compatibility

## 7) Release readiness
```bash
npm run release:manifest:summary
```
