const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { expect } = require('chai');
const { Wallet } = require('ethers');

const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001';
const MODULE_PATH = '../../agent-gateway/utils';
const utilsTsPath = path.join(__dirname, MODULE_PATH + '.ts');

function compileAndRequire(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: 'ES2020',
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    fileName: filePath,
  });

  const moduleExports = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = require.resolve(
        path.join(path.dirname(filePath), specifier)
      );
      return require(resolved);
    }
    return require(specifier);
  };

  const evaluator = new Function(
    'require',
    'module',
    'exports',
    '__filename',
    '__dirname',
    outputText
  );
  evaluator(
    localRequire,
    moduleExports,
    moduleExports.exports,
    filePath,
    path.dirname(filePath)
  );
  return moduleExports.exports;
}

function loadUtils() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return compileAndRequire(utilsTsPath);
}

describe('agent gateway wallet initialisation', function () {
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    delete process.env.BOT_WALLET;
    delete process.env.ORCHESTRATOR_WALLET;
    delete process.env.KEYSTORE_TOKEN;
    delete process.env.STAKE_MANAGER_ADDRESS;
    delete process.env.DISPUTE_MODULE_ADDRESS;
    delete process.env.JOB_REGISTRY_ADDRESS;
    delete process.env.VALIDATION_MODULE_ADDRESS;
    delete process.env.KEYSTORE_URL;
    delete require.cache[require.resolve(MODULE_PATH)];
  });

  after(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
  });

  it('fails when the keystore response has no wallet keys', async function () {
    process.env.JOB_REGISTRY_ADDRESS = DUMMY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = DUMMY_ADDRESS;
    process.env.STAKE_MANAGER_ADDRESS = DUMMY_ADDRESS;
    process.env.KEYSTORE_URL = 'http://localhost/keystore';

    global.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [] }),
    });

    const utils = loadUtils();

    try {
      await utils.initWallets();
      expect.fail('expected initWallets to throw');
    } catch (err) {
      expect(err.message).to.include('Keystore returned no wallet keys');
    }
  });

  it('fails when the configured orchestrator wallet is missing', async function () {
    process.env.JOB_REGISTRY_ADDRESS = DUMMY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = DUMMY_ADDRESS;
    process.env.STAKE_MANAGER_ADDRESS = DUMMY_ADDRESS;
    process.env.KEYSTORE_URL = 'http://localhost/keystore';

    const automationKey = Wallet.createRandom();
    const orchestrator = Wallet.createRandom();
    process.env.BOT_WALLET = automationKey.address;
    process.env.ORCHESTRATOR_WALLET = orchestrator.address;

    global.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ keys: [automationKey.privateKey] }),
    });

    const utils = loadUtils();

    try {
      await utils.initWallets();
      expect.fail('expected initWallets to throw');
    } catch (err) {
      expect(err.message).to.include('Configured ORCHESTRATOR_WALLET');
    }
  });

  it('initialises automation and orchestrator wallets when available', async function () {
    process.env.JOB_REGISTRY_ADDRESS = DUMMY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = DUMMY_ADDRESS;
    process.env.STAKE_MANAGER_ADDRESS = DUMMY_ADDRESS;
    process.env.KEYSTORE_URL = 'http://localhost/keystore';

    const automationKey = Wallet.createRandom();
    const orchestratorKey = Wallet.createRandom();
    process.env.BOT_WALLET = automationKey.address;
    process.env.ORCHESTRATOR_WALLET = orchestratorKey.address;

    global.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        keys: [automationKey.privateKey, orchestratorKey.privateKey],
      }),
    });

    const utils = loadUtils();
    await utils.initWallets();

    expect(utils.walletManager.list()).to.include(automationKey.address);
    expect(utils.walletManager.list()).to.include(orchestratorKey.address);
    expect(utils.automationWallet.address).to.equal(automationKey.address);
    expect(utils.orchestratorWallet.address).to.equal(orchestratorKey.address);
  });
});
