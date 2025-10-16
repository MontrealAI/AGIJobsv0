import { execSync } from 'child_process';

if (process.env.MAINNET_ACK !== 'I_KNOW_WHAT_I_AM_DOING') {
  console.error('Refusing to run without MAINNET_ACK=I_KNOW_WHAT_I_AM_DOING');
  process.exit(1);
}

console.log('This helper prints the plan for mainnet deployment.');
execSync('node scripts/v2/verifyOwnerControl.js', { stdio: 'inherit' });
console.log('Execute scripts/v2/deployDefaults.ts with governance approval to roll out changes.');
