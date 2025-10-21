const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadEnvironment,
  resolveConfig,
  createDemoUrl,
  normalisePrefix,
} = require('../lib/launcher.js');

test('loadEnvironment merges root and demo .env files with demo taking precedence', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onebox-root-'));
  const tmpDemo = path.join(tmpRoot, 'demo', 'One-Box');
  fs.mkdirSync(tmpDemo, { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, '.env'), 'RPC_URL=http://root.example\nONEBOX_PORT=9000\n');
  fs.writeFileSync(path.join(tmpDemo, '.env'), 'RPC_URL=http://demo.example\nONEBOX_UI_PORT=5000\n');

  const env = loadEnvironment({ rootDir: tmpRoot, demoDir: tmpDemo });
  assert.equal(env.RPC_URL, 'http://demo.example');
  assert.equal(env.ONEBOX_PORT, '9000');
  assert.equal(env.ONEBOX_UI_PORT, '5000');
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('resolveConfig normalises prefix and derives defaults', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_PORT: '9010',
    ONEBOX_UI_PORT: '4400',
    ONEBOX_PUBLIC_ONEBOX_PREFIX: 'mission-control/',
    ONEBOX_API_TOKEN: 'demo',
  };
  const config = resolveConfig(env);
  assert.equal(config.orchestratorPort, 9010);
  assert.equal(config.uiPort, 4400);
  assert.equal(config.prefix, '/mission-control');
  assert.equal(config.apiToken, 'demo');
  assert.equal(config.publicOrchestratorUrl, 'http://127.0.0.1:9010');
});

test('createDemoUrl encodes orchestrator, prefix, token, and mode', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_API_TOKEN: 'secret',
    ONEBOX_UI_DEFAULT_MODE: 'expert',
  };
  const config = resolveConfig(env);
  const url = createDemoUrl(config);
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.searchParams.get('orchestrator'), config.publicOrchestratorUrl);
  assert.equal(parsed.searchParams.get('oneboxPrefix'), config.prefix);
  assert.equal(parsed.searchParams.get('token'), 'secret');
  assert.equal(parsed.searchParams.get('mode'), 'expert');
});

test('normalisePrefix respects explicit blank overrides and fallback defaults', () => {
  assert.equal(normalisePrefix(undefined), '/onebox');
  assert.equal(normalisePrefix('', '/onebox'), '');
  assert.equal(normalisePrefix(' /deep/ops/ '), '/deep/ops');
});
