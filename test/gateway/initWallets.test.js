const { expect } = require('chai');
const { Wallet } = require('ethers');
const path = require('path');

const { compileAndRequireTsModule } = require('../utils/tsLoader');

const DUMMY_ADDRESS = '0x0000000000000000000000000000000000000001';
const MODULE_PATH = '../../agent-gateway/utils';
const utilsTsPath = path.join(__dirname, MODULE_PATH + '.ts');

function clearModuleCache() {
  try {
    const resolved = require.resolve(MODULE_PATH);
    delete require.cache[resolved];
  } catch {
    // Module may not be cached or resolvable when not yet compiled; ignore.
  }
}

function loadUtils() {
  clearModuleCache();
  return compileAndRequireTsModule(utilsTsPath);
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
    clearModuleCache();
  });

  after(() => {
    clearModuleCache();
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
