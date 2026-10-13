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

test('explicit mainnet address book matches all 24 recorded contracts without legacy placeholders', () => {
  const book = require('../../docs/deployment-addresses.mainnet.json');
  const record = require('../../docs/deployments/ethereum-mainnet-2026-10-12.json');
  const implementations = new Set(Object.values(modules).flat());
  assert.equal(record.chainId, 1);
  assert.equal(book.network, 'mainnet');
  assert.equal(book.chainId, record.chainId);
  const { deploymentNetwork } = require('../../scripts/v2/lib/runtime-network.cjs');
  assert.deepEqual(deploymentNetwork(book), { network: 'mainnet', chainId: String(record.chainId), local: false });
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
    if (key.startsWith('_') || ['network', 'chainId', 'token', 'implementations'].includes(key)) continue;
    assert.ok(value === '0x' + '0'.repeat(40) || recorded.has(value), key);
  }
  for (const key of ['taxPolicy', 'jobManagerV0', 'rewardEngine', 'thermostat', 'hgmControlModule', 'attestationRegistry']) {
    assert.equal(book[key], '0x' + '0'.repeat(40), key);
  }
});

function loadTypeScript(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const localRequire = require('node:module').createRequire(filename);
  const output = require('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: 1, target: 9, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  require('node:vm').runInNewContext(output, {
    module, exports: module.exports, __dirname: path.dirname(filename), process,
    require: (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : localRequire(name),
    ...globals,
  }, { filename });
  return module.exports;
}

test('mainnet address book cannot be relabeled for another network', () => {
  const { deploymentNetwork } = require('../../scripts/v2/lib/runtime-network.cjs');
  const book = require('../../docs/deployment-addresses.mainnet.json');
  for (const network of ['hardhat', 'sepolia']) {
    assert.throws(() => deploymentNetwork(book, network), /conflicts with the deployment addressbook/);
  }
});

test('protected owner verifier accepts explicit mainnet and isolated local address books', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-owner-books-'));
  const localBook = path.join(directory, 'local.json');
  fs.writeFileSync(localBook, '{}\n');
  try {
    for (const chainId of [1n, 31337n, 11155111n]) {
      const queried = [];
      const { verifyOwnerControl } = loadTypeScript('../../scripts/v2/lib/ownerControlVerification.ts', {
        hardhat: {
          network: { name: chainId === 1n ? 'mainnet' : 'hardhat' },
          ethers: {
            ...require('ethers'),
            getSigners: async () => [],
            provider: {
              getNetwork: async () => ({ chainId, name: 'fixture' }),
              getCode: async (value) => { queried.push(value); return '0x'; },
            },
          },
        },
        '../../config': {
          inferNetworkKey: (value) => value.name,
          loadOwnerControlConfig: () => ({ config: { modules: { stakeManager: { type: 'ownable' } } }, path: 'fixture' }),
        },
        './utils': {},
      });
      const addressBookPath = chainId === 1n
        ? path.resolve(__dirname, '../../docs/deployment-addresses.mainnet.json')
        : localBook;
      const result = await verifyOwnerControl({ addressBookPath });
      assert.equal(result.metadata.addressBookPath, addressBookPath);
      if (chainId === 1n) {
        assert.deepEqual(queried, [require('../../docs/deployment-addresses.mainnet.json').stakeManager]);
        assert.equal(result.summary.error, 1); // No code in this mocked provider: fail closed.
      } else {
        assert.deepEqual(queried, []);
        assert.equal(result.summary.missingAddress, 1);
        assert.equal(result.summary.error, 0);
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('monitoring retains deployed addresses instead of zero summary or override placeholders', async () => {
  const { buildAddressIndex } = loadTypeScript('../../scripts/monitoring/sentinel-utils.ts');
  const zero = '0x' + '0'.repeat(40);
  const index = await buildAddressIndex({ network: 'mainnet', inlineMap: { STAKE_MANAGER: zero } });
  const book = require('../../docs/deployment-addresses.mainnet.json');
  assert.equal(index.get('STAKE_MANAGER').address, book.stakeManager);
  assert.equal(index.get('JOB_REGISTRY').address, book.jobRegistry);
  assert.equal(index.has('TAX_POLICY'), false);
  for (const resolution of index.values()) assert.notEqual(resolution.address, zero);
  const testnet = await buildAddressIndex({ network: 'sepolia' });
  for (const resolution of testnet.values()) {
    assert.notEqual(resolution.address, book.stakeManager);
    assert.notEqual(resolution.address, book.jobRegistry);
  }
});

test('mainnet sentinel templates resolve only recorded contracts while retaining policy-change alerts', async () => {
  const { buildAddressIndex, substitutePlaceholders, ensureSentinelSchema } = loadTypeScript('../../scripts/monitoring/sentinel-utils.ts');
  const index = await buildAddressIndex({ network: 'mainnet' });
  const record = require('../../docs/deployments/ethereum-mainnet-2026-10-12.json');
  const deployed = new Set(record.contracts.map((contract) => contract.address));
  const directory = path.resolve(__dirname, '../../monitoring/onchain');
  for (const filename of ['parameter-change-sentinel.json', 'pause-governance-sentinel.json', 'role-rotation-sentinel.json']) {
    const { rendered, missing } = substitutePlaceholders(fs.readFileSync(path.join(directory, filename), 'utf8'), index);
    assert.equal(missing.length, 0, filename);
    const sentinel = JSON.parse(rendered);
    ensureSentinelSchema(sentinel);
    assert.ok(sentinel.addresses.length > 0);
    for (const value of sentinel.addresses) assert.ok(deployed.has(value), `${filename}: ${value}`);
    if (filename === 'parameter-change-sentinel.json') {
      assert.equal(sentinel.addresses.length, 3);
      for (const event of ['TaxPolicyUpdated(address)', 'TaxPolicyUpdated(address,uint256)']) {
        assert.ok(sentinel.conditions.some((condition) => condition.event === event), event);
      }
    }
  }
});

test('generic transaction defaults cannot select any live deployment', () => {
  const book = require('../../docs/deployment-addresses.json');
  const zero = '0x' + '0'.repeat(40);
  for (const [key, value] of Object.entries(book)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'object') {
      for (const address of Object.values(value)) assert.equal(address, zero, key);
    } else assert.equal(value, zero, key);
  }
  assert.equal(book.identityRegistry, zero); // auditIdentityRegistry --clear rejects this.
  for (const key of ['stakeManager', 'jobRegistry', 'systemPause', 'certificateNFT']) {
    assert.equal(book[key], zero); // transfer-ownership skips absent addresses.
  }
});

test('existing transaction entrypoints make no contract calls with generic defaults', async () => {
  for (const chainId of [1n, 11155111n, 31337n]) {
    for (const script of ['../../scripts/transfer-ownership.ts', '../../scripts/v2/auditIdentityRegistry.ts']) {
      const errors = [];
      const calls = [];
      const fixtureProcess = { argv: ['node', script, '--new-owner', '0x' + '1'.repeat(40), '--clear'], exitCode: 0 };
      const unexpected = async (...args) => { calls.push(args); throw new Error('Unexpected contract access'); };
      loadTypeScript(script, {
        hardhat: { ethers: {
          ...require('ethers'), getSigners: async () => [],
          provider: { getNetwork: async () => ({ chainId }), getCode: unexpected },
          getContractAt: unexpected,
        } },
      }, { process: fixtureProcess, console: { log() {}, error: (error) => errors.push(error.message) } });
      // Both entrypoints first await the already-resolved signer fixture. Their
      // zero-address branch then completes without asynchronous contract access.
      await new Promise(setImmediate);
      assert.deepEqual(calls, [], `${script} on chain ${chainId}`);
      const identityAudit = script.includes('auditIdentityRegistry');
      assert.deepEqual(errors, identityAudit ? ['identity registry address missing'] : []);
      assert.equal(fixtureProcess.exitCode, identityAudit ? 1 : 0);
    }
  }
});

test('release provenance retains the canonical Forge pin without unsupported TOML options', () => {
  const {
    parseFoundryToolchain,
  } = require('../../scripts/release/generate-manifest.js');
  assert.deepEqual(parseFoundryToolchain(), { solc: '0.8.37', forge: '1.4.4' });
  const prior = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-provenance-'));
  try {
    fs.writeFileSync(
      path.join(directory, 'foundry.toml'),
      'solc_version = "0.8.37"\n'
    );
    process.chdir(directory);
    assert.throws(() => parseFoundryToolchain(), /File not found/);
    fs.mkdirSync('config');
    fs.writeFileSync(
      'config/foundry-toolchain.json',
      JSON.stringify({ version: 'nightly' })
    );
    assert.throws(() => parseFoundryToolchain(), /canonical Foundry/);
    fs.writeFileSync(
      'config/foundry-toolchain.json',
      JSON.stringify({ version: '1.4.4' })
    );
    assert.deepEqual(parseFoundryToolchain(), {
      solc: '0.8.37',
      forge: '1.4.4',
    });
  } finally {
    process.chdir(prior);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
