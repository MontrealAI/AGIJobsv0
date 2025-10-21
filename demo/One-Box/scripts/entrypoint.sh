#!/bin/sh
set -euo pipefail

node <<'NODE'
const fs = require('fs');
const path = require('path');

const config = {
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? '',
  apiToken: process.env.ONEBOX_API_TOKEN ?? '',
};

const target = path.join(process.cwd(), 'runtime-config.js');
const payload = `window.__ONEBOX_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`;
fs.writeFileSync(target, payload, 'utf8');

const indexPath = path.join(process.cwd(), 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('runtime-config.js')) {
  const patched = html.replace('</body>', '  <script src="./runtime-config.js" defer></script>\n</body>');
  fs.writeFileSync(indexPath, patched, 'utf8');
}
NODE

exec "$@"
