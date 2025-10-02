const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});

process.env.RPC_URL ??= 'http://127.0.0.1:8545';
process.env.PRIVATE_KEY ??= '0x' + '11'.repeat(32);
process.env.JOB_REGISTRY ??= '0x' + '01'.repeat(20);
process.env.STAKE_MANAGER ??= '0x' + '02'.repeat(20);
process.env.AGIALPHA_TOKEN ??= '0x' + '03'.repeat(20);
process.env.VALIDATION_MODULE ??= '0x' + '04'.repeat(20);
process.env.ATTESTATION_REGISTRY ??= '0x' + '05'.repeat(20);

const quickstart = require('../../examples/ethers-quickstart.js');
const cli = require('../../scripts/validator/cli.ts');
const quickstartTest = quickstart.__test__;
const { raiseDisputeWithOverloads } = cli;

function createRegistryStub() {
  const calls = [];
  const txResponse = { hash: '0xdeadbeef', wait: async () => ({ status: 1 }) };
  const buildCall = (label) => {
    const fn = (...args) => {
      calls.push({ method: label, args });
      return Promise.resolve(txResponse);
    };
    fn.populateTransaction = (...args) => {
      calls.push({ method: `${label}:populate`, args });
      return Promise.resolve({ to: '0x0', data: '0x', value: 0n });
    };
    return fn;
  };

  const registry = {};
  registry.dispute = buildCall('dispute');
  registry['raiseDispute(uint256,bytes32)'] = buildCall('bytes32');
  registry['raiseDispute(uint256,string)'] = buildCall('string');

  return { registry, calls, txResponse };
}

test('quickstart helper routes 32-byte hashes to the bytes32 overload', async () => {
  const { registry, calls } = createRegistryStub();
  const jobId = 1n;
  const hash = '0x' + 'ab'.repeat(32);

  await quickstartTest.callRaiseDispute(registry, jobId, hash);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'bytes32');
  assert.equal(calls[0].args[0], jobId);
  assert.equal(calls[0].args[1], hash);
});

test('quickstart helper routes strings to the string overload', async () => {
  const { registry, calls } = createRegistryStub();
  const jobId = 2n;
  const reason = 'ipfs://evidence/123';

  await quickstartTest.callRaiseDispute(registry, jobId, reason);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'string');
  assert.equal(calls[0].args[0], jobId);
  assert.equal(calls[0].args[1], reason);
});

test('validator CLI helper supports reason-only disputes', async () => {
  const { registry, calls } = createRegistryStub();
  const jobId = 3n;
  const reason = 'ipfs://evidence/456';

  await raiseDisputeWithOverloads(registry, jobId, { reason });

  assert.equal(calls[0].method, 'string');
});

test('validator CLI helper supports hash-only disputes', async () => {
  const { registry, calls } = createRegistryStub();
  const jobId = 4n;
  const hash = '0x' + 'cd'.repeat(32);

  await raiseDisputeWithOverloads(registry, jobId, { evidenceHash: hash });

  assert.equal(calls[0].method, 'bytes32');
});

test('validator CLI helper supports combined disputes', async () => {
  const { registry, calls } = createRegistryStub();
  const jobId = 5n;
  const hash = '0x' + 'ef'.repeat(32);
  const reason = 'ipfs://evidence/789';

  await raiseDisputeWithOverloads(registry, jobId, { evidenceHash: hash, reason });

  assert.equal(calls[0].method, 'dispute');
});

