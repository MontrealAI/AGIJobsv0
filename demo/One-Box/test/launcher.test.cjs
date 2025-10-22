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
  isUnsetEnvValue,
  parseCliArgs,
  parseShortcutExamples,
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
  assert.equal(config.maxJobBudgetAgia, undefined);
  assert.equal(config.maxJobDurationDays, undefined);
  assert.equal(config.welcomeMessage, '');
  assert.deepEqual(config.shortcutExamples, []);
  assert.deepEqual(config.warnings, []);
});

test('resolveConfig allows explicit CLI overrides to win over environment', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_PORT: '9999',
    ONEBOX_UI_PORT: '4444',
    ONEBOX_PUBLIC_ORCHESTRATOR_URL: 'http://example.invalid',
  };
  const config = resolveConfig(env, {
    orchestratorPort: 8088,
    uiPort: 5050,
    uiHost: '0.0.0.0',
    prefix: '/mission',
    apiToken: 'cli-token',
    defaultMode: 'expert',
    publicOrchestratorUrl: 'http://demo.internal:8088/onebox',
    explorerBase: 'https://scan.example/tx/',
    maxJobBudgetAgia: '123.45',
    maxJobDurationDays: 9,
    welcomeMessage: 'Custom welcome',
    examples: ['Mission one', 'Mission two'],
  });

  assert.equal(config.orchestratorPort, 8088);
  assert.equal(config.uiPort, 5050);
  assert.equal(config.uiHost, '0.0.0.0');
  assert.equal(config.prefix, '/mission');
  assert.equal(config.apiToken, 'cli-token');
  assert.equal(config.defaultMode, 'expert');
  assert.equal(config.publicOrchestratorUrl, 'http://demo.internal:8088/onebox');
  assert.equal(config.explorerBase, 'https://scan.example/tx/');
  assert.equal(config.maxJobBudgetAgia, '123.45');
  assert.equal(config.maxJobDurationDays, 9);
  assert.equal(config.welcomeMessage, 'Custom welcome');
  assert.deepEqual(config.shortcutExamples, ['Mission one', 'Mission two']);
  assert.ok(
    config.warnings.some((warning) =>
      warning.includes('HTTP on a non-loopback host'),
    ),
    'Expected HTTP exposure warning for non-loopback host',
  );
});

test('resolveConfig parses guardrail environment variables', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_MAX_JOB_BUDGET_AGIA: '45.5',
    ONEBOX_MAX_JOB_DURATION_DAYS: '7',
    ONEBOX_UI_WELCOME: 'Hello operator',
    ONEBOX_UI_SHORTCUTS: 'Research | Finalize job 12',
  };
  const config = resolveConfig(env);
  assert.equal(config.maxJobBudgetAgia, '45.5');
  assert.equal(config.maxJobDurationDays, 7);
  assert.equal(config.welcomeMessage, 'Hello operator');
  assert.deepEqual(config.shortcutExamples, ['Research', 'Finalize job 12']);
  assert.deepEqual(config.warnings, []);
});

test('resolveConfig merges CLI example overrides with environment shortcuts', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_UI_SHORTCUTS: 'Research | Finalize job 12',
  };
  const config = resolveConfig(env, { examples: ['Diagnose agent', 'Finalize job 12'] });
  assert.deepEqual(config.shortcutExamples, ['Research', 'Finalize job 12', 'Diagnose agent']);
});

test('resolveConfig warns when exposing orchestrator without API token', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x000000000000000000000000000000000000c0de',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xbeef',
    ONEBOX_PUBLIC_ORCHESTRATOR_URL: 'https://demo.example/onebox',
  };
  const config = resolveConfig(env);
  assert.ok(
    config.warnings.some((warning) =>
      warning.includes('No API token configured while exposing the orchestrator beyond loopback'),
    ),
  );
});

test('resolveConfig warns when the orchestrator URL cannot be parsed', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x000000000000000000000000000000000000c0de',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xbeef',
    ONEBOX_PUBLIC_ORCHESTRATOR_URL: 'not-a-url',
  };
  const config = resolveConfig(env);
  assert.ok(
    config.warnings.some((warning) =>
      warning.includes("is not a valid absolute URL"),
    ),
  );
});

test('resolveConfig collects warnings for malformed guardrails when allowPartial', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_MAX_JOB_BUDGET_AGIA: 'abc',
    ONEBOX_MAX_JOB_DURATION_DAYS: '-1',
  };
  const config = resolveConfig(env, { allowPartial: true });
  assert.equal(config.maxJobBudgetAgia, undefined);
  assert.equal(config.maxJobDurationDays, undefined);
  assert.ok(config.warnings.some((warning) => warning.includes('ONEBOX_MAX_JOB_BUDGET_AGIA')));
  assert.ok(config.warnings.some((warning) => warning.includes('ONEBOX_MAX_JOB_DURATION_DAYS')));
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
  assert.equal(parsed.searchParams.get('welcome'), null);
  assert.equal(parsed.searchParams.get('examples'), null);
});

test('createDemoUrl includes welcome and examples when provided', () => {
  const env = {
    RPC_URL: 'http://localhost:8545',
    JOB_REGISTRY_ADDRESS: '0x1234',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xdead',
    ONEBOX_UI_WELCOME: 'Hello operator',
    ONEBOX_UI_SHORTCUTS: '["Spin up research mission", "Finalize job 42"]',
  };
  const config = resolveConfig(env);
  const url = createDemoUrl(config);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('welcome'), 'Hello operator');
  assert.deepEqual(JSON.parse(parsed.searchParams.get('examples')), [
    'Spin up research mission',
    'Finalize job 42',
  ]);
});

test('normalisePrefix respects explicit blank overrides and fallback defaults', () => {
  assert.equal(normalisePrefix(undefined), '/onebox');
  assert.equal(normalisePrefix('', '/onebox'), '');
  assert.equal(normalisePrefix(' /deep/ops/ '), '/deep/ops');
});

test('resolveConfig flags placeholder environment values', () => {
  const env = {
    RPC_URL: 'https://sepolia.infura.io/v3/your-key',
    JOB_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000000',
    ONEBOX_RELAYER_PRIVATE_KEY: '0xYOUR_PRIVATE_KEY',
  };

  assert.throws(() => resolveConfig(env), /Missing required environment variables/);
  const partial = resolveConfig(env, { allowPartial: true });
  const sortedMissing = [...partial.missing].sort();
  assert.deepEqual(sortedMissing, [
    'JOB_REGISTRY_ADDRESS',
    'ONEBOX_RELAYER_PRIVATE_KEY',
    'RPC_URL',
  ].sort());
});

test('isUnsetEnvValue detects placeholders and zero addresses', () => {
  assert.equal(isUnsetEnvValue(''), true);
  assert.equal(isUnsetEnvValue('  '), true);
  assert.equal(isUnsetEnvValue('0x0000000000000000000000000000000000000000'), true);
  assert.equal(isUnsetEnvValue('https://sepolia.infura.io/v3/your-key', { treatZeroAddress: false }), true);
  assert.equal(isUnsetEnvValue('0x000000000000000000000000000000000000abcd'), false);
  assert.equal(isUnsetEnvValue('https://rpc.valid', { treatZeroAddress: false }), false);
});

test('parseCliArgs handles overrides and boolean flags', () => {
  const options = parseCliArgs([
    '--no-browser',
    '--ui-port',
    '5050',
    '--orchestrator-port=9090',
    '--ui-host',
    '0.0.0.0',
    '--prefix',
    '/mission',
    '--token',
    'secret',
    '--mode',
    'expert',
    '--orchestrator-url',
    'http://demo.internal:9090/onebox',
    '--explorer-base',
    'https://scan.example/tx/',
    '--max-budget',
    '77.5',
    '--max-duration',
    '6',
    '--welcome',
    'Hello world',
    '--examples',
    'Alpha mission | Beta mission',
  ]);

  assert.equal(options.openBrowser, false);
  assert.equal(options.uiPort, 5050);
  assert.equal(options.orchestratorPort, 9090);
  assert.equal(options.uiHost, '0.0.0.0');
  assert.equal(options.prefix, '/mission');
  assert.equal(options.apiToken, 'secret');
  assert.equal(options.defaultMode, 'expert');
  assert.equal(options.publicOrchestratorUrl, 'http://demo.internal:9090/onebox');
  assert.equal(options.explorerBase, 'https://scan.example/tx/');
  assert.equal(options.maxJobBudgetAgia, '77.5');
  assert.equal(options.maxJobDurationDays, 6);
  assert.equal(options.welcomeMessage, 'Hello world');
  assert.deepEqual(options.examples, ['Alpha mission', 'Beta mission']);
});

test('parseShortcutExamples accepts JSON arrays and deduplicates', () => {
  assert.deepEqual(parseShortcutExamples('["Mission", "Mission"]'), ['Mission']);
  assert.deepEqual(parseShortcutExamples('One | Two\nThree'), ['One', 'Two', 'Three']);
  assert.deepEqual(parseShortcutExamples(['Alpha', 'Beta']), ['Alpha', 'Beta']);
});

test('parseCliArgs throws for invalid numeric or mode values', () => {
  assert.throws(() => parseCliArgs(['--ui-port', '-1']));
  assert.throws(() => parseCliArgs(['--mode', 'power']));
  assert.throws(() => parseCliArgs(['--max-budget', 'abc']));
  assert.throws(() => parseCliArgs(['--max-duration', '0']));
});
