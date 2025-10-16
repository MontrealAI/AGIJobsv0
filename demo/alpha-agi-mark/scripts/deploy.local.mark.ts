import { execSync } from 'child_process';

const output = process.env.AGIMARK_DEPLOY_OUTPUT || 'reports/localhost/agimark/receipts/deploy.json';
console.log('Deploying AGI Jobs v0 (v2) defaults to localhost...');
execSync(
  `DEPLOY_DEFAULTS_OUTPUT=${output} npx hardhat run scripts/v2/deployDefaults.ts --network localhost`,
  { stdio: 'inherit' }
);
