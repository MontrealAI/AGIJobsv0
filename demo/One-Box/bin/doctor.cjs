#!/usr/bin/env node
const path = require('node:path');
const { loadEnvironment, resolveConfig, createDemoUrl } = require('../lib/launcher.js');

function formatStatus(label, value) {
  const padded = label.padEnd(24, ' ');
  console.log(`   ${padded} ${value}`);
}

(async () => {
  const rootDir = path.resolve(__dirname, '../../');
  const demoDir = __dirname;
  const env = loadEnvironment({ rootDir, demoDir });
  const config = resolveConfig(env, { allowPartial: true });

  console.log('AGI Jobs One-Box configuration check');
  console.log('====================================');
  const missing = config.missing;
  if (missing.length) {
    console.log('⚠️  Missing variables:');
    missing.forEach((key) => console.log(`   • ${key}`));
    console.log('');
  } else {
    console.log('✅ All required environment variables present.');
    console.log('');
  }

  console.log('Runtime summary:');
  formatStatus('RPC_URL', env.RPC_URL ?? '(unset)');
  formatStatus('JOB_REGISTRY_ADDRESS', env.JOB_REGISTRY_ADDRESS ?? '(unset)');
  formatStatus('ONEBOX_RELAYER_PRIVATE_KEY', env.ONEBOX_RELAYER_PRIVATE_KEY ? '(set)' : '(unset)');
  formatStatus('Orchestrator port', String(config.orchestratorPort));
  formatStatus('UI port', String(config.uiPort));
  formatStatus('Prefix', config.prefix || '(root)');
  formatStatus('Default mode', config.defaultMode);
  formatStatus('Public orchestrator', config.publicOrchestratorUrl);
  if (config.apiToken) {
    formatStatus('API token', 'provided');
  }
  console.log('');

  console.log('Launch URL preview:');
  console.log(`   ${createDemoUrl(config)}`);
  console.log('');

  console.log('Owner control checklist:');
  console.log('   • npm run owner:surface          # Snapshot control surfaces');
  console.log('   • npm run owner:update-all       # Apply configuration bundle');
  console.log('   • npm run owner:system-pause     # Emergency pause drill');
  console.log('   • npm run ci:verify-branch-protection');
  console.log('');
})();
