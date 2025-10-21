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
