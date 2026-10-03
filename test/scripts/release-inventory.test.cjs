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
