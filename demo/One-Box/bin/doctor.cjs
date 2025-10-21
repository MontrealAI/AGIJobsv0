#!/usr/bin/env node
const path = require('node:path');
const {
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
  isUnsetEnvValue,
} = require('../lib/launcher.js');
const { probeRpc, fetchAccountBalance } = require('../lib/rpc.js');

function formatStatus(label, value) {
  const padded = label.padEnd(24, ' ');
  console.log(`   ${padded} ${value}`);
}

(async () => {
  const rootDir = path.resolve(__dirname, '../../');
  const demoDir = __dirname;
  const env = loadEnvironment({ rootDir, demoDir });
  const config = resolveConfig(env, { allowPartial: true });
  const relayerKeyConfigured = !isUnsetEnvValue(env.ONEBOX_RELAYER_PRIVATE_KEY);
  let relayerAddress = null;
  if (relayerKeyConfigured) {
    try {
      const { Wallet } = await import('ethers');
      relayerAddress = new Wallet(env.ONEBOX_RELAYER_PRIVATE_KEY).address;
    } catch (error) {
      console.log('⚠️  Unable to derive relayer address from provided key.');
    }
  }

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
  const rpcDisplay = env.RPC_URL
    ? `${env.RPC_URL}${isUnsetEnvValue(env.RPC_URL, { treatZeroAddress: false }) ? ' (placeholder)' : ''}`
    : '(unset)';
  const jobDisplay = env.JOB_REGISTRY_ADDRESS
    ? `${env.JOB_REGISTRY_ADDRESS}${isUnsetEnvValue(env.JOB_REGISTRY_ADDRESS) ? ' (placeholder)' : ''}`
    : '(unset)';
  formatStatus('RPC_URL', rpcDisplay);
  formatStatus('JOB_REGISTRY_ADDRESS', jobDisplay);
  const relayerKeyStatus = !env.ONEBOX_RELAYER_PRIVATE_KEY
    ? '(unset)'
    : relayerKeyConfigured
    ? '(set)'
    : '(placeholder)';
  formatStatus('ONEBOX_RELAYER_PRIVATE_KEY', relayerKeyStatus);
  formatStatus('Orchestrator port', String(config.orchestratorPort));
  formatStatus('UI port', String(config.uiPort));
  formatStatus('Prefix', config.prefix || '(root)');
  formatStatus('Default mode', config.defaultMode);
  formatStatus('Public orchestrator', config.publicOrchestratorUrl);
  if (config.apiToken) {
    formatStatus('API token', 'provided');
  }
  if (relayerAddress) {
    formatStatus('Relayer address', relayerAddress);
  } else if (relayerKeyConfigured) {
    formatStatus('Relayer address', '⚠️  Unable to derive from supplied key.');
  } else {
    formatStatus('Relayer address', '(not configured)');
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
    if (relayerAddress) {
      const balance = await fetchAccountBalance({
        rpcUrl: env.RPC_URL,
        address: relayerAddress,
      });
      if (balance.status === 'ok') {
        formatStatus('Relayer balance', `${balance.balanceEther} ETH`);
      } else {
        formatStatus(
          'Relayer balance',
          `⚠️  ${balance.error ?? 'Unable to fetch balance.'}`
        );
      }
    } else if (relayerKeyConfigured) {
      formatStatus('Relayer balance', '⚠️  Provide a valid relayer key to inspect funding.');
    } else {
      formatStatus('Relayer balance', '⚠️  Configure ONEBOX_RELAYER_PRIVATE_KEY to evaluate funding.');
    }
  } else if (rpcProbe.status === 'missing') {
    formatStatus('Job registry', '⚠️  Set JOB_REGISTRY_ADDRESS once deployment is live.');
    if (relayerAddress) {
      formatStatus('Relayer balance', '⚠️  RPC_URL missing. Balance check skipped.');
    } else if (!relayerKeyConfigured) {
      formatStatus('Relayer balance', '⚠️  Configure ONEBOX_RELAYER_PRIVATE_KEY to evaluate funding.');
    }
  } else {
    formatStatus('Job registry', '⚠️  RPC unreachable. Bytecode verification skipped.');
    if (relayerAddress) {
      formatStatus('Relayer balance', '⚠️  RPC unreachable. Balance check skipped.');
    } else if (!relayerKeyConfigured) {
      formatStatus('Relayer balance', '⚠️  Configure ONEBOX_RELAYER_PRIVATE_KEY to evaluate funding.');
    }
  }
  console.log('');

  console.log('Owner control checklist:');
  console.log('   • npm run owner:surface          # Snapshot control surfaces');
  console.log('   • npm run owner:update-all       # Apply configuration bundle');
  console.log('   • npm run owner:system-pause     # Emergency pause drill');
  console.log('   • npm run ci:verify-branch-protection');
  console.log('');
})();
