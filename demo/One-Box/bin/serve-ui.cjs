#!/usr/bin/env node
const { startStaticServer } = require('../lib/static-server.cjs');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be from 1 to 65535');
const endpoint = (process.env.ORCHESTRATOR_URL || '').trim();
if (endpoint) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid public ORCHESTRATOR_URL');
}
startStaticServer(process.env.ONEBOX_DIST_DIR || '/srv/www', {
  uiHost: process.env.ONEBOX_UI_HOST || '0.0.0.0',
  uiPort: port,
  publicOrchestratorUrl: endpoint,
  prefix: process.env.ONEBOX_PREFIX || '/onebox',
  defaultMode: process.env.ONEBOX_UI_DEFAULT_MODE || 'guest',
  demoMode: !endpoint,
}).then(server => {
  console.log(`One-Box UI listening on port ${port} (${endpoint ? 'connected configuration' : 'offline preview'})`);
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
