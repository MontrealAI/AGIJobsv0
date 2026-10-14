'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { keccak256 } = require('ethers');
const {
  verifyReceipt,
  abi,
  profile,
} = require('../../integrations/alpha-agent/verify-receipt.cjs');
const registry = '0x1111111111111111111111111111111111111111';
const worker = '0x2222222222222222222222222222222222222222';
const h = (n) => '0x' + n.repeat(64);
function fixture(event = 'ResultSubmitted') {
  const expected = {
    transactionHash: h('1'),
    event,
    jobId: '42',
    worker,
    resultHash: h('3'),
    resultURI: 'ipfs://result',
    success: true,
    minimumConfirmations: 2,
  };
  const args =
    event === 'ResultSubmitted'
      ? [42, worker, h('3'), 'ipfs://result', 'agent']
      : event === 'AgentAssigned'
      ? [42, worker, 'agent']
      : event === 'JobCompleted'
      ? [42, true]
      : [42, worker];
  const eventLog = abi.encodeEventLog(abi.getEvent(event), args);
  const receipt = {
    hash: h('1'),
    status: 1,
    blockNumber: 10,
    blockHash: h('2'),
    logs: [
      {
        ...eventLog,
        address: registry,
        index: 0,
        transactionHash: h('1'),
        blockHash: h('2'),
        blockNumber: 10,
      },
    ],
  };
  const deployment = {
    backend: profile.backend,
    registry,
    chainId: 31337,
    runtimeKeccak256: keccak256('0x6000'),
  };
  const provider = {
    getNetwork: async () => ({ chainId: 31337n }),
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: h('2') }),
    getBlockNumber: async () => 11,
    getCode: async () => '0x6000',
  };
  return { expected, receipt, deployment, provider };
}
for (const event of [
  'AgentAssigned',
  'ResultSubmitted',
  'JobCompleted',
  'JobFinalized',
]) {
  test(`verifies canonical ${event} without conflating lifecycle stages`, async () => {
    const f = fixture(event);
    const result = await verifyReceipt(f.provider, f.deployment, f.expected);
    assert.equal(result.event, event);
    assert.equal(result.finalizationEventProven, event === 'JobFinalized');
  });
}
const mutations = {
  'log from another transaction': (f) => {
    f.receipt.logs[0].transactionHash = h('9');
  },
  'log from another block hash': (f) => {
    f.receipt.logs[0].blockHash = h('9');
  },
  'log from another block number': (f) => {
    f.receipt.logs[0].blockNumber = 9;
  },
  'missing log transaction': (f) => {
    delete f.receipt.logs[0].transactionHash;
  },
  'missing log block hash': (f) => {
    delete f.receipt.logs[0].blockHash;
  },
  'missing log block number': (f) => {
    delete f.receipt.logs[0].blockNumber;
  },
  'negative log index': (f) => {
    f.receipt.logs[0].index = -1;
  },
  'fractional log index': (f) => {
    f.receipt.logs[0].index = 0.5;
  },
  'unsafe log index': (f) => {
    f.receipt.logs[0].index = Number.MAX_SAFE_INTEGER + 1;
  },
  'missing log index': (f) => {
    delete f.receipt.logs[0].index;
  },
  'invalid receipt block number': (f) => {
    f.receipt.blockNumber = -1;
  },
  'wrong backend': (f) => {
    f.deployment.backend = 'mark';
  },
  'missing full runtime pin': (f) => {
    f.deployment.runtimeKeccak256 = null;
  },
  'wrong runtime': (f) => {
    f.deployment.runtimeKeccak256 = h('a');
  },
  'zero registry': (f) => {
    f.deployment.registry = '0x' + '0'.repeat(40);
  },
  'wrong chain': (f) => {
    f.deployment.chainId = 1;
  },
  'unsafe numeric job ID': (f) => {
    f.expected.jobId = 42;
  },
  'failed transaction': (f) => {
    f.receipt.status = 0;
  },
  'receipt from another transaction': (f) => {
    f.receipt.hash = h('4');
  },
  'noncanonical receipt': (f) => {
    f.receipt.blockHash = h('4');
  },
  'insufficient confirmations': (f) => {
    f.expected.minimumConfirmations = 3;
  },
  'zero confirmations': (f) => {
    f.expected.minimumConfirmations = 0;
  },
  'wrong event emitter': (f) => {
    f.receipt.logs[0].address = worker;
  },
  'removed log': (f) => {
    f.receipt.logs[0].removed = true;
  },
  'duplicate event': (f) => {
    f.receipt.logs.push(f.receipt.logs[0]);
  },
  'wrong job': (f) => {
    f.expected.jobId = '43';
  },
  'wrong worker': (f) => {
    f.expected.worker = registry;
  },
  'wrong result hash': (f) => {
    f.expected.resultHash = h('5');
  },
  'wrong result URI': (f) => {
    f.expected.resultURI = 'ipfs://another';
  },
  'missing result URI': (f) => {
    delete f.expected.resultURI;
  },
  'unknown lifecycle event': (f) => {
    f.expected.event = 'JobPayout';
  },
  'reorg during verification': (f) => {
    let n = 0;
    f.provider.getBlock = async () => ({ hash: ++n === 1 ? h('2') : h('4') });
  },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`rejects ${name}`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(verifyReceipt(f.provider, f.deployment, f.expected));
  });
}
test('rejects failed validation presented as approval', async () => {
  const f = fixture('JobCompleted');
  f.expected.success = false;
  await assert.rejects(
    verifyReceipt(f.provider, f.deployment, f.expected),
    /decision mismatch/
  );
});
test('historical deployment is explicitly not production authorization', () => {
  assert.equal(profile.historicalDeployment.productionApproved, false);
  assert.equal(profile.historicalDeployment.liveIntakeOpen, false);
  assert.equal(profile.historicalDeployment.runtimeKeccak256, null);
  const record = require('../../docs/deployments/ethereum-mainnet-2026-10-12.json');
  assert.equal(
    profile.historicalDeployment.sourceCommit,
    record.deploymentSource.commit
  );
  for (const [name, address] of Object.entries(
    profile.historicalDeployment.addresses
  )) {
    assert.equal(
      address,
      record.contracts.find((c) => c.name === name).address
    );
  }
});

test('shared bounded work spec uses exact bytes and excludes runtime assignment', () => {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const bytes = fs.readFileSync(
    require.resolve('../../integrations/alpha-agent/fixtures/work-spec.json')
  );
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    '1cb2ef99471efe7d7213d35ce64d87ed0f67dc8d60988501129a38e06a3ec815'
  );
  const spec = JSON.parse(bytes);
  assert.equal(spec.market, profile.backend);
  assert.equal(spec.executor, 'alpha-native-v1');
  assert.equal(spec.schema, 'agialpha.bounded-work-spec.v1');
  assert.equal(spec.jobId, undefined);
  assert.equal(spec.assignment, undefined);
});

test('retained local acceptance matches the exact reviewed artifact bytes', () => {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const evidence = require('../../integrations/alpha-agent/fixtures/local-acceptance.json');
  const bytes = fs.readFileSync(
    require.resolve(
      '../../integrations/alpha-agent/fixtures/reviewed-artifact.json'
    )
  );
  assert.equal(
    evidence.resultHash,
    '0x' + crypto.createHash('sha256').update(bytes).digest('hex')
  );
  assert.equal(evidence.scope, 'disposable-local-fixture');
  assert.equal(evidence.productionApproved, false);
  assert.equal(evidence.submission.finalizationEventProven, false);
  assert.equal(evidence.approval.finalizationEventProven, false);
  assert.equal(evidence.finalization.finalizationEventProven, true);
});
