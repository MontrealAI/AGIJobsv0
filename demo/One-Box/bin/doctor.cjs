#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log('Usage: npm run demo:onebox:doctor -- [--strict]\nRead-only configuration, RPC, contracts, ownership, balance and port checks. --strict returns a failing exit code for unmet prerequisites.'); process.exit(0); }
if (args.some(arg => arg !== '--strict')) { console.error('Unknown option. Use --help.'); process.exit(1); }
const {
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
  isUnsetEnvValue,
  collectPortDiagnostics,
  ROOT_DIR,
  DEMO_DIR,
} = require('../lib/launcher.js');
const {
  probeRpc,
  fetchAccountBalance,
  evaluateAddressShape,
  inspectOwnerSurface,
} = require('../lib/rpc.js');
const {
  collectOwnerAssignments,
  collectPausedContracts,
} = require('../lib/diagnostics.js');

function formatStatus(label, value) {
  const padded = label.padEnd(24, ' ');
  console.log(`   ${padded} ${value}`);
}

function describeContractStatus(probeEntry, { allowMissing = false } = {}) {
  if (!probeEntry || typeof probeEntry !== 'object') {
    return '⚠️  No probe result available.';
  }
  switch (probeEntry.status) {
    case 'ok':
      return '✅ Contract bytecode detected.';
    case 'no_code':
      return '⚠️  No bytecode at configured address.';
    case 'invalid':
      return '⚠️  Invalid address format.';
    case 'placeholder':
      return '⚠️  Placeholder address detected. Update configuration.';
    case 'error':
      return `⚠️  RPC error while fetching bytecode${probeEntry.error ? `: ${probeEntry.error}` : ''}`;
    case 'missing':
      return allowMissing
        ? '⚠️  Address not configured. Configure it to keep owner pause controls active.'
        : '⚠️  Address not provided.';
    default:
      return `⚠️  Unrecognised status: ${String(probeEntry.status)}`;
  }
}

function describeAgentAddress(address) {
  if (!address) {
    return '(not configured)';
  }
  const trimmed = address.trim();
  if (!trimmed) {
    return '(not configured)';
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    if (/^0x0{40}$/i.test(trimmed)) {
      return '⚠️  Placeholder 0x00… address.';
    }
    return `${trimmed} (EOA/contract)`;
  }
  if (evaluateAddressShape(trimmed) === 'invalid' && trimmed.includes('.')) {
    return `${trimmed} (likely ENS name)`;
  }
  return `${trimmed} (custom identifier)`;
}

function describeOwnerResult(result) {
  if (!result || typeof result !== 'object') {
    return '⚠️  Owner probe unavailable.';
  }
  switch (result.status) {
    case 'ok':
      return result.owner;
    case 'missing':
      return '⚠️  Address not configured.';
    case 'invalid':
      return '⚠️  Invalid address format.';
    case 'placeholder':
      return '⚠️  Placeholder 0x00… address configured.';
    case 'missing_rpc':
      return '⚠️  RPC_URL missing; unable to fetch owner.';
    case 'unsupported':
      return '⚠️  Contract does not expose owner() in a compatible form.';
    case 'reverted':
      return `⚠️  Call reverted${result.error ? `: ${result.error}` : ''}`;
    case 'error':
      return `⚠️  Unable to fetch owner${result.error ? `: ${result.error}` : ''}`;
    default:
      return `⚠️  Owner probe status: ${String(result.status)}`;
  }
}

function describePauseResult(result) {
  if (!result || typeof result !== 'object') {
    return '⚠️  Pause probe unavailable.';
  }
  switch (result.status) {
    case 'ok':
      return result.paused ? '⏸️  Paused' : '▶️  Active';
    case 'missing':
      return '⚠️  Address not configured.';
    case 'invalid':
      return '⚠️  Invalid address format.';
    case 'placeholder':
      return '⚠️  Placeholder 0x00… address configured.';
    case 'missing_rpc':
      return '⚠️  RPC_URL missing; unable to read pause state.';
    case 'unsupported':
      return '⚠️  Contract does not expose paused() or reverted on call.';
    case 'error':
      return `⚠️  Unable to fetch pause state${result.error ? `: ${result.error}` : ''}`;
    default:
      return `⚠️  Pause probe status: ${String(result.status)}`;
  }
}

(async () => {
  const rootDir = ROOT_DIR;
  const demoDir = DEMO_DIR;
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
  const failures = [...missing.map(key => `Missing ${key}`)];
  try { resolveConfig(env); } catch (error) { failures.push(error.message); }
  if (relayerKeyConfigured && !relayerAddress) failures.push('Invalid relayer private key');
  if (missing.length) {
    console.log('⚠️  Missing variables:');
    missing.forEach((key) => console.log(`   • ${key}`));
    console.log('');
  } else {
    console.log('✅ All required environment variables present.');
    console.log('');
  }

  console.log('Runtime summary:');
  let rpcDisplay = '(unset)';
  if (env.RPC_URL) {
    try { const url = new URL(env.RPC_URL); rpcDisplay = `${url.protocol}//${url.host}/[endpoint path hidden]`; }
    catch { rpcDisplay = '(invalid endpoint)'; }
  }
  const jobDisplay = config.jobRegistryAddress
    ? `${config.jobRegistryAddress}${isUnsetEnvValue(config.jobRegistryAddress) ? ' (placeholder)' : ''}`
    : '(unset)';
  const stakeDisplay = config.stakeManagerAddress
    ? `${config.stakeManagerAddress}${isUnsetEnvValue(config.stakeManagerAddress) ? ' (placeholder)' : ''}`
    : '(unset)';
  const pauseDisplay = config.systemPauseAddress
    ? `${config.systemPauseAddress}${isUnsetEnvValue(config.systemPauseAddress) ? ' (placeholder)' : ''}`
    : '(unset)';
  formatStatus('RPC_URL', rpcDisplay);
  formatStatus('JOB_REGISTRY_ADDRESS', jobDisplay);
  formatStatus('STAKE_MANAGER_ADDRESS', stakeDisplay);
  formatStatus('SYSTEM_PAUSE_ADDRESS', pauseDisplay);
  if (config.agentAddress) {
    formatStatus('AGENT_ADDRESS', config.agentAddress);
  }
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
  if (config.welcomeMessage) {
    formatStatus('Welcome prompt', config.welcomeMessage);
  }
  if (config.shortcutExamples.length > 0) {
    formatStatus('Shortcuts', config.shortcutExamples.join(' | '));
  }
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

  console.log('Organisational guardrails:');
  formatStatus(
    'Max job budget',
    config.maxJobBudgetAgia ? `${config.maxJobBudgetAgia} AGIALPHA` : '(not configured)'
  );
  formatStatus(
    'Max job duration',
    config.maxJobDurationDays ? `${config.maxJobDurationDays} day(s)` : '(not configured)'
  );
  if (config.warnings.length > 0) {
    console.log('   Configuration warnings:');
    for (const warning of config.warnings) {
      console.log(`     • ${warning}`);
    }
  }
  console.log('');

  const portDiagnostics = await collectPortDiagnostics(config);
  config.portDiagnostics = portDiagnostics;

  console.log('Port availability:');
  for (const diag of portDiagnostics) {
    const label = `${diag.label} (${diag.host}:${diag.port})`.padEnd(24, ' ');
    const status =
      diag.status === 'available'
        ? '✅ available'
        : diag.status === 'blocked'
        ? '⚠️  in use'
        : '⚠️  unknown';
    console.log(`   ${label} ${status}`);
    if (diag.status === 'blocked' && diag.error instanceof Error) {
      console.log(`      • Close the conflicting process and re-run the launch.`);
    } else if (diag.status === 'unknown' && diag.error instanceof Error) {
      console.log(`      • ${diag.error.message}`);
    }
  }
  console.log('');

  console.log('Launch URL preview:');
  console.log(`   ${createDemoUrl(config)}`);
  console.log('');

  const rpcProbe = await probeRpc({
    rpcUrl: isUnsetEnvValue(env.RPC_URL, { treatZeroAddress: false }) ? undefined : env.RPC_URL,
    jobRegistryAddress: config.jobRegistryAddress,
    stakeManagerAddress: config.stakeManagerAddress,
    systemPauseAddress: config.systemPauseAddress,
  });

  for (const entry of portDiagnostics) if (entry.status !== 'available') failures.push(`${entry.label}: ${entry.status}`);
  if (rpcProbe.status !== 'ready') failures.push('RPC unavailable');
  else {
    if (env.CHAIN_ID && String(rpcProbe.chain.decimal) !== env.CHAIN_ID.trim()) failures.push('CHAIN_ID mismatch');
    for (const key of ['jobRegistry', 'stakeManager', 'systemPause']) if (rpcProbe[key].status !== 'ok') failures.push(`${key}: ${rpcProbe[key].status}`);
  }
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
    formatStatus('Job registry', describeContractStatus(rpcProbe.jobRegistry));
    formatStatus('Stake manager', describeContractStatus(rpcProbe.stakeManager));
    formatStatus('System pause', describeContractStatus(rpcProbe.systemPause, { allowMissing: true }));
    if (relayerAddress) {
      const balance = await fetchAccountBalance({
        rpcUrl: env.RPC_URL,
        address: relayerAddress,
      });
      if (balance.status === 'ok') {
        formatStatus('Relayer balance', `${balance.balanceEther} ETH`);
        if (BigInt(balance.balanceHex) === 0n) failures.push('Relayer has no gas balance');
      } else {
        failures.push('Relayer balance unavailable');
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
    formatStatus('Stake manager', '⚠️  Configure STAKE_MANAGER_ADDRESS once available.');
    formatStatus('System pause', '⚠️  Configure SYSTEM_PAUSE_ADDRESS once available.');
    if (relayerAddress) {
      formatStatus('Relayer balance', '⚠️  RPC_URL missing. Balance check skipped.');
    } else if (!relayerKeyConfigured) {
      formatStatus('Relayer balance', '⚠️  Configure ONEBOX_RELAYER_PRIVATE_KEY to evaluate funding.');
    }
  } else {
    formatStatus('Job registry', '⚠️  RPC unreachable. Bytecode verification skipped.');
    formatStatus('Stake manager', '⚠️  RPC unreachable. Bytecode verification skipped.');
    formatStatus('System pause', '⚠️  RPC unreachable. Bytecode verification skipped.');
    if (relayerAddress) {
      formatStatus('Relayer balance', '⚠️  RPC unreachable. Balance check skipped.');
    } else if (!relayerKeyConfigured) {
      formatStatus('Relayer balance', '⚠️  Configure ONEBOX_RELAYER_PRIVATE_KEY to evaluate funding.');
    }
  }
  console.log('');

  if (rpcProbe.status === 'ready') {
    const ownerSurface = await inspectOwnerSurface({
      rpcUrl: env.RPC_URL,
      jobRegistryAddress: config.jobRegistryAddress,
      stakeManagerAddress: config.stakeManagerAddress,
      systemPauseAddress: config.systemPauseAddress,
    });

    console.log('Governance ownership surface:');
    formatStatus('Job registry owner', describeOwnerResult(ownerSurface.jobRegistry.owner));
    formatStatus('Job registry pause', describePauseResult(ownerSurface.jobRegistry.paused));
    formatStatus('Stake manager owner', describeOwnerResult(ownerSurface.stakeManager.owner));
    formatStatus('Stake manager pause', describePauseResult(ownerSurface.stakeManager.paused));
    formatStatus('System pause owner', describeOwnerResult(ownerSurface.systemPause.owner));
    formatStatus('System pause state', describePauseResult(ownerSurface.systemPause.paused));
    for (const [key, surface] of Object.entries(ownerSurface)) {
      if (surface.owner.status !== 'ok') failures.push(`${key} owner unresolved`);
      if (key !== 'systemPause' && surface.paused.status !== 'ok') failures.push(`${key} pause state unresolved`);
      if (surface.paused.paused) failures.push(`${key} is paused`);
    }
    const ownerAssignments = collectOwnerAssignments(ownerSurface);
    console.log('Owner consolidation:');
    if (ownerAssignments.length === 0) {
      console.log('   • Unable to resolve owner custody from RPC responses.');
    } else {
      for (const assignment of ownerAssignments) {
        console.log(
          `   • ${assignment.owner} controls ${assignment.contracts.join(', ')}`
        );
      }
    }
    const pausedContracts = collectPausedContracts(ownerSurface);
    console.log('Paused subsystems:');
    if (pausedContracts.length === 0) {
      console.log('   • No paused state confirmed; unsupported or failed probes remain unknown.');
    } else {
      for (const label of pausedContracts) {
        console.log(`   • ${label}`);
      }
    }
    console.log('');
  }

  if (config.agentAddress) {
    formatStatus('Agent identifier', describeAgentAddress(config.agentAddress));
    console.log('');
  }

  console.log('Owner control checklist:');
  console.log('   • npm run owner:surface          # Snapshot control surfaces');
  console.log('   • Review owner changes with the deployment runbook before signing.');
  console.log('   • npm run owner:system-pause     # Emergency pause drill');
  console.log('   • npm run ci:verify-branch-protection');
  console.log('');
  console.log(failures.length ? `Not ready for connected operation: ${failures.join('; ')}` : 'Read-only checks passed. This is not production commissioning or a security audit.');
  if (args.includes('--strict') && failures.length) process.exitCode = 1;
})().catch(error => { console.error('One-Box doctor failed:', error.message); process.exitCode = 1; });
