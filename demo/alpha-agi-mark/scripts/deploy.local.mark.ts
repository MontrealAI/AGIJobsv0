import { execSync } from 'child_process';

const output = process.env.DEPLOY_DEFAULTS_OUTPUT || 'reports/localhost/agimark/deploy.json';

console.log('Deploying AGI Jobs defaults to localhost…');
execSync(
  `DEPLOY_DEFAULTS_OUTPUT=${output} npx hardhat run scripts/v2/deployDefaults.ts --network localhost`,
  { stdio: 'inherit' }
);
