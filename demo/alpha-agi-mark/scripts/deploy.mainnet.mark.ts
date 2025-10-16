import { execSync } from 'child_process';

if (process.env.MAINNET_ACK !== 'I_KNOW_WHAT_I_AM_DOING') {
  console.error('Set MAINNET_ACK=I_KNOW_WHAT_I_AM_DOING to acknowledge production deployment.');
  process.exit(1);
}

console.log('Dry-run only. Configure scripts/v2/deployDefaults.ts with Safe addresses before running for mainnet.');
execSync('echo "Review governance plan and execute via multisig."', { stdio: 'inherit' });
