const { expect } = require('chai');
const path = require('path');

const { compileAndRequireTsModule } = require('../utils/tsLoader');

const MODULE_PATH = '../../agent-gateway/utils';
const utilsTsPath = path.join(__dirname, MODULE_PATH + '.ts');
const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001';

function clearModuleCache() {
  try {
    const resolved = require.resolve(MODULE_PATH);
    delete require.cache[resolved];
  } catch {
    // Ignore when module hasn't been loaded yet.
  }
}

function loadUtils() {
  clearModuleCache();
  return compileAndRequireTsModule(utilsTsPath);
}

describe('agent gateway configuration validation', function () {
  const envBackup = {};

  beforeEach(function () {
    envBackup.RPC_URL = process.env.RPC_URL;
    envBackup.PORT = process.env.PORT;
    envBackup.FETCH_TIMEOUT_MS = process.env.FETCH_TIMEOUT_MS;
    envBackup.STALE_JOB_MS = process.env.STALE_JOB_MS;
    envBackup.SWEEP_INTERVAL_MS = process.env.SWEEP_INTERVAL_MS;
    envBackup.KEYSTORE_URL = process.env.KEYSTORE_URL;
    envBackup.JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS;
    envBackup.VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS;

    process.env.RPC_URL = 'http://localhost:8545';
    process.env.PORT = '3000';
    process.env.FETCH_TIMEOUT_MS = '5000';
    process.env.STALE_JOB_MS = String(60 * 60 * 1000);
    process.env.SWEEP_INTERVAL_MS = String(60 * 1000);
    process.env.KEYSTORE_URL = 'https://keystore.local/keys';
    process.env.JOB_REGISTRY_ADDRESS = DUMMY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = DUMMY_ADDRESS;
  });

  afterEach(function () {
    process.env.RPC_URL = envBackup.RPC_URL;
    process.env.PORT = envBackup.PORT;
    process.env.FETCH_TIMEOUT_MS = envBackup.FETCH_TIMEOUT_MS;
    process.env.STALE_JOB_MS = envBackup.STALE_JOB_MS;
    process.env.SWEEP_INTERVAL_MS = envBackup.SWEEP_INTERVAL_MS;
    process.env.KEYSTORE_URL = envBackup.KEYSTORE_URL;
    process.env.JOB_REGISTRY_ADDRESS = envBackup.JOB_REGISTRY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = envBackup.VALIDATION_MODULE_ADDRESS;

    clearModuleCache();
  });

  it('rejects RPC URLs with unsupported schemes', function () {
    process.env.RPC_URL = 'ftp://example.com';

    expect(() => loadUtils()).to.throw(/RPC_URL/);
  });

  it('rejects non-numeric port values', function () {
    process.env.PORT = 'not-a-number';

    expect(() => loadUtils()).to.throw(/PORT/);
  });

  it('enforces positive fetch timeout', function () {
    process.env.FETCH_TIMEOUT_MS = '0';

    expect(() => loadUtils()).to.throw(/FETCH_TIMEOUT_MS/);
  });

  it('enforces sane stale job timeout floor', function () {
    process.env.STALE_JOB_MS = '1000';

    expect(() => loadUtils()).to.throw(/STALE_JOB_MS/);
  });
});
