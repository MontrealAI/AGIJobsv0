#!/usr/bin/env node
const path = require('node:path');
const {
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
} = require('../lib/launcher.js');
const { probeRpc } = require('../lib/rpc.js');

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

  const rpcProbe = await probeRpc({
    rpcUrl: env.RPC_URL,
    jobRegistryAddress: env.JOB_REGISTRY_ADDRESS,
  });

  console.log('Network diagnostics:');
  if (rpcProbe.status === 'ready' && rpcProbe.chain) {
    const { chain } = rpcProbe;
    const networkLabel = chain.networkName
      ? `${chain.networkName} (${chain.decimal})`
      : `Chain ID ${chain.decimal}`;
    formatStatus('RPC connection', `✅ ${networkLabel}`);
  } else if (rpcProbe.status === 'missing') {
    formatStatus('RPC connection', '⚠️  RPC_URL missing.');
  } else {
    formatStatus(
      'RPC connection',
      `⚠️  ${rpcProbe.error ?? 'Unable to reach RPC endpoint.'}`
    );
  }

  if (rpcProbe.status === 'ready') {
    if (rpcProbe.jobRegistry?.address) {
      const { status } = rpcProbe.jobRegistry;
      const detail =
        status === 'ok'
          ? '✅ Contract bytecode detected.'
          : status === 'no_code'
          ? '⚠️  No bytecode at JOB_REGISTRY_ADDRESS.'
          : status === 'placeholder'
          ? '⚠️  Placeholder address detected. Update JOB_REGISTRY_ADDRESS.'
          : status === 'invalid'
          ? '⚠️  Invalid address format.'
          : status === 'error'
          ? '⚠️  RPC error while fetching bytecode.'
          : '⚠️  Address not provided.';
      formatStatus('Job registry', detail);
    } else {
      formatStatus('Job registry', '⚠️  Address not provided.');
    }
  } else if (rpcProbe.status === 'missing') {
    formatStatus('Job registry', '⚠️  Set JOB_REGISTRY_ADDRESS once deployment is live.');
  } else {
    formatStatus('Job registry', '⚠️  RPC unreachable. Bytecode verification skipped.');
  }
  console.log('');

  console.log('Owner control checklist:');
  console.log('   • npm run owner:surface          # Snapshot control surfaces');
  console.log('   • npm run owner:update-all       # Apply configuration bundle');
  console.log('   • npm run owner:system-pause     # Emergency pause drill');
  console.log('   • npm run ci:verify-branch-protection');
  console.log('');
})();
