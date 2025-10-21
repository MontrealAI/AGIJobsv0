#!/bin/sh
set -euo pipefail

node <<'NODE'
const fs = require('fs');
const path = require('path');

const config = {
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? '',
  apiToken: process.env.ONEBOX_API_TOKEN ?? '',
  explorerTxBase: process.env.EXPLORER_TX_BASE ?? '',
  ipfsGatewayBase: process.env.IPFS_GATEWAY_BASE ?? '',
  networkName:
    process.env.AGIJ_NETWORK ?? process.env.AGJ_NETWORK ?? undefined,
  chainId: process.env.CHAIN_ID ?? undefined,
  contracts: [
    {
      id: 'agialphaToken',
      label: 'AGI-Alpha token',
      envKey: 'AGIALPHA_TOKEN',
    },
    {
      id: 'jobRegistry',
      label: 'Job Registry',
      envKey: 'JOB_REGISTRY',
    },
    {
      id: 'systemPause',
      label: 'System Pause',
      envKey: 'SYSTEM_PAUSE_ADDRESS',
    },
    {
      id: 'feePool',
      label: 'Fee Pool',
      envKey: 'FEE_POOL_ADDRESS',
    },
    {
      id: 'identityRegistry',
      label: 'Identity Registry',
      envKey: 'IDENTITY_REGISTRY_ADDRESS',
    },
    {
      id: 'stakeManager',
      label: 'Stake Manager',
      envKey: 'STAKE_MANAGER_ADDRESS',
    },
    {
      id: 'validationModule',
      label: 'Validation Module',
      envKey: 'VALIDATION_MODULE_ADDRESS',
    },
    {
      id: 'disputeModule',
      label: 'Dispute Module',
      envKey: 'DISPUTE_MODULE_ADDRESS',
    },
    {
      id: 'reputationEngine',
      label: 'Reputation Engine',
      envKey: 'REPUTATION_ENGINE_ADDRESS',
    },
  ]
    .map(({ envKey, ...rest }) => {
      const raw = process.env[envKey];
      if (!raw) {
        return null;
      }
      const value = String(raw).trim();
      if (value.length === 0) {
        return null;
      }
      return { ...rest, address: value };
    })
    .filter(Boolean),
};

const target = path.join(process.cwd(), 'runtime-config.js');
const payload = `window.__ONEBOX_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`;
fs.writeFileSync(target, payload, 'utf8');

const indexPath = path.join(process.cwd(), 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('runtime-config.js')) {
  const runtimeTag = '    <script src="./runtime-config.js"></script>\n';
  const moduleIndex = html.indexOf('<script');
  const patched =
    moduleIndex >= 0
      ? html.slice(0, moduleIndex) + runtimeTag + html.slice(moduleIndex)
      : html.replace('</body>', `${runtimeTag}</body>`);
  fs.writeFileSync(indexPath, patched, 'utf8');
}
NODE

exec "$@"
