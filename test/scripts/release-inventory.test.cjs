const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const modules = require('../../config/implementation-modules.json');
const {
  CONTRACT_TARGETS,
  collectContractMetadata,
} = require('../../scripts/release/generate-manifest.js');
const {
  ensureContracts,
} = require('../../scripts/release/validate-manifest.js');
const {
  validateVerificationInventory,
} = require('../../scripts/release/run-etherscan-verification.js');

const address = '0x1234567890123456789012345678901234567890';
const entry = (value = address) => ({
  artifact: 'artifacts/Contract.json',
  abiHash: 'a'.repeat(64),
  bytecodeHash: 'b'.repeat(64),
  deployedBytecodeLength: 10,
  addresses: { config: value },
});
const errorsFor = (contracts) => {
  const errors = [];
  ensureContracts(
    { contracts },
    { requireAddresses: true, optionalContracts: new Set() },
    errors
  );
  return errors;
};

test('release inventories cover every fixed implementation on both supported networks', () => {
  for (const name of Object.values(modules).flat()) {
    assert.equal(
      CONTRACT_TARGETS.filter((target) => target.name === name).length,
      1
    );
    for (const network of ['mainnet', 'sepolia']) {
      const config = require(`../../deployment-config/verification/${network}.json`);
      const targets = config.contracts.filter(
        (target) => target.manifestKey === name
      );
      assert.equal(targets.length, 1);
      assert.deepEqual(targets[0].constructorArgs, []);
    }
  }
});

test('manifest records implementation bytecode and explicit deployment addresses', () => {
  const prior = process.cwd();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agi-release-inventory-')
  );
  const target = CONTRACT_TARGETS.find(
    (item) => item.name === 'JobRegistryLifecycle'
  );
  try {
    const artifact = path.join(directory, 'artifacts', target.artifact);
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(
      artifact,
      JSON.stringify({ abi: [], deployedBytecode: '0x60006000' })
    );
    process.chdir(directory);
    const result = collectContractMetadata(
      target,
      { implementations: { [target.name]: address } },
      {}
    );
    assert.deepEqual(result.warnings, []);
    assert.equal(result.contractEntry.addresses.config, address);
    assert.equal(result.contractEntry.deployedBytecodeLength, 4);
    assert.match(result.contractEntry.bytecodeHash, /^[a-f0-9]{64}$/);
  } finally {
    process.chdir(prior);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('manifest rejects omitted implementations, malformed addresses, and zero addresses', () => {
  assert.match(
    errorsFor({ JobRegistry: entry() }).join('\n'),
    /omits JobRegistry implementation/
  );
  for (const value of ['', 'not-an-address', '0x123', '0x' + '0'.repeat(40)]) {
    assert.match(
      errorsFor({ Example: entry(value) }).join('\n'),
      /missing, malformed, or zero/
    );
  }
  assert.deepEqual(errorsFor({ Example: entry() }), []);
});

function fixture() {
  return {
    manifest: {
      network: { name: 'mainnet' },
      contracts: { A: entry(), B: entry() },
    },
    config: { network: 'mainnet', contracts: [{ name: 'A' }, { name: 'B' }] },
  };
}

test('verification accepts a complete inventory and rejects cross-network evidence', () => {
  const { manifest, config } = fixture();
  assert.doesNotThrow(() =>
    validateVerificationInventory(manifest, config, 'mainnet')
  );
  assert.throws(
    () => validateVerificationInventory(manifest, config, 'sepolia'),
    /network/
  );
  config.network = 'sepolia';
  assert.throws(
    () => validateVerificationInventory(manifest, config, 'mainnet'),
    /network/
  );
});

test('verification rejects empty, partial, duplicate, skipped, and unrelated inventories', () => {
  for (const contracts of [
    [],
    [{ name: 'A' }],
    [{ name: 'A' }, { name: 'A' }],
    [{ name: 'A', skip: true }, { name: 'B' }],
    [{ name: 'Unknown' }],
  ]) {
    const { manifest, config } = fixture();
    config.contracts = contracts;
    assert.throws(() =>
      validateVerificationInventory(manifest, config, 'mainnet')
    );
  }
});

test('verification rejects unresolved and malformed contract addresses before explorer calls', () => {
  for (const value of [undefined, '0x' + '0'.repeat(40), '0x123', 'invalid']) {
    const { manifest, config } = fixture();
    manifest.contracts.A.addresses.config = value;
    assert.throws(
      () => validateVerificationInventory(manifest, config, 'mainnet'),
      /address missing, malformed, or zero/
    );
  }
});

test('canonical mainnet address book matches all 24 recorded contracts without legacy placeholders', () => {
  const book = require('../../docs/deployment-addresses.json');
  const record = require('../../docs/deployments/ethereum-mainnet-2026-10-12.json');
  const implementations = new Set(Object.values(modules).flat());
  assert.equal(record.chainId, 1);
  assert.equal(book.token, record.token.address);
  assert.equal(record.contracts.length, 24);
  assert.equal(Object.keys(book.implementations).length, 10);
  for (const contract of record.contracts) {
    const key = contract.name[0].toLowerCase() + contract.name.slice(1);
    const actual = implementations.has(contract.name)
      ? book.implementations[contract.name]
      : book[key];
    assert.equal(actual, contract.address, contract.name);
    const target = CONTRACT_TARGETS.find((item) => item.name === contract.name);
    if (target) {
      assert.equal(
        collectContractMetadata(target, book, {}).contractEntry.addresses.config,
        contract.address,
        `release manifest address for ${contract.name}`
      );
    }
  }
  const recorded = new Set(record.contracts.map((contract) => contract.address));
  for (const [key, value] of Object.entries(book)) {
    if (key.startsWith('_') || key === 'token' || key === 'implementations') continue;
    assert.ok(value === '0x' + '0'.repeat(40) || recorded.has(value), key);
  }
  for (const key of ['taxPolicy', 'jobManagerV0', 'rewardEngine', 'thermostat', 'hgmControlModule', 'attestationRegistry']) {
    assert.equal(book[key], '0x' + '0'.repeat(40), key);
  }
});

function loadTypeScript(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const localRequire = require('node:module').createRequire(filename);
  const output = require('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: 1, target: 9, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  require('node:vm').runInNewContext(output, {
    module, exports: module.exports, __dirname: path.dirname(filename), process,
    require: (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : localRequire(name),
  }, { filename });
  return module.exports;
}

test('owner-verifier default resolves the checked-in operational address book', () => {
  const { DEFAULT_ADDRESS_BOOK } = loadTypeScript('../../scripts/v2/lib/ownerControlVerification.ts', {
    hardhat: {}, '../../config': {}, './utils': {},
  });
  assert.equal(DEFAULT_ADDRESS_BOOK, path.resolve(__dirname, '../../docs/deployment-addresses.json'));
  assert.equal(JSON.parse(fs.readFileSync(DEFAULT_ADDRESS_BOOK, 'utf8')).deployer,
    require('../../docs/deployments/ethereum-mainnet-2026-10-12.json').coordinator);
});

test('monitoring retains deployed addresses instead of zero summary or override placeholders', async () => {
  const { buildAddressIndex } = loadTypeScript('../../scripts/monitoring/sentinel-utils.ts');
  const zero = '0x' + '0'.repeat(40);
  const index = await buildAddressIndex({ network: 'mainnet', inlineMap: { STAKE_MANAGER: zero } });
  const book = require('../../docs/deployment-addresses.json');
  assert.equal(index.get('STAKE_MANAGER').address, book.stakeManager);
  assert.equal(index.get('JOB_REGISTRY').address, book.jobRegistry);
  assert.equal(index.has('TAX_POLICY'), false);
  for (const resolution of index.values()) assert.notEqual(resolution.address, zero);
});
