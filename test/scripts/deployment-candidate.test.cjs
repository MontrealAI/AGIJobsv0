'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ethers } = require('ethers');
const {
  inventory,
  validateConfig,
  buildDeploymentCandidate,
} = require('../../scripts/v2/lib/deployment-candidate.cjs');
const addresses = {
  governance: '0x1000000000000000000000000000000000000001',
  token: '0x2000000000000000000000000000000000000002',
  ens: '0x3000000000000000000000000000000000000003',
};
const token = { address: addresses.token, decimals: 18 };
function config() {
  return {
    network: 'mainnet',
    chainId: 1,
    governance: addresses.governance,
    agialpha: addresses.token,
    econ: {
      feePct: 5,
      burnPct: 1,
      employerSlashPct: 10,
      treasurySlashPct: 90,
      validatorSlashRewardPct: 0,
      commitWindow: '1d',
      revealWindow: '1d',
      minStake: '1000',
      jobStake: '500',
    },
    identity: {
      ens: addresses.ens,
      nameWrapper: ethers.ZeroAddress,
      roots: {
        agentRoot: {
          name: 'agent.agi.eth',
          hash: ethers.namehash('agent.agi.eth'),
        },
        clubRoot: {
          name: 'club.agi.eth',
          hash: ethers.namehash('club.agi.eth'),
        },
      },
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    },
    secureDefaults: { pauseOnLaunch: true },
    tax: { enabled: false },
  };
}
function options(overrides = {}) {
  const input = config();
  return {
    network: 'mainnet',
    config: input,
    configBytes: JSON.stringify(input),
    token,
    readArtifact: ({ name, source }) => ({
      contractName: name,
      sourceName: source,
      bytecode: '0x60016000',
      deployedBytecode: '0x6001',
      abi: [],
    }),
    provider: {
      getNetwork: async () => ({ chainId: 1n }),
      getBlock: async () => ({ number: 42, hash: ethers.id('block') }),
      getCode: async () => '0x6001',
      call: async () =>
        ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [18]),
    },
    ...overrides,
  };
}
test('valid read-only candidate pins evidence, normalizes ENS and keeps execution unauthorized', async () => {
  const input = options();
  const calls = [];
  const readCode = input.provider.getCode;
  input.provider.getCode = async (target, block) => {
    calls.push([target, block]);
    return readCode();
  };
  input.provider.call = async (tx) => {
    assert.equal(tx.blockTag, 42);
    assert.equal(tx.to, addresses.token);
    return ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [18]);
  };
  const report = await buildDeploymentCandidate(input);
  assert.equal(report.status, 'candidate-for-review');
  assert.equal(report.executable, false);
  assert.equal(report.productionApproved, false);
  assert.deepEqual(report.blockers, []);
  assert.equal(
    report.config.identity.agentRootNode,
    ethers.namehash('agent.agi.eth')
  );
  assert.equal(report.config.identity.roots, undefined);
  assert.deepEqual(calls, [
    [addresses.token, 42],
    [addresses.ens, 42],
  ]);
  assert.equal(report.artifacts.length, inventory().length - 1);
  assert.match(report.source.configSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.chain.blockHash, ethers.id('block'));
  assert.equal(Object.hasOwn(report, 'transactions'), false);
});
test('rejects wrong target, zero governance, token mismatch, ambiguous economics and launch unpause', () => {
  const mutations = [
    [
      (c) => {
        c.chainId = 11155111;
      },
      /network\/chainId/,
    ],
    [
      (c) => {
        c.governance = ethers.ZeroAddress;
      },
      /nonzero/,
    ],
    [
      (c) => {
        c.agialpha = addresses.ens;
      },
      /token differs/,
    ],
    [
      (c) => {
        c.econ.feePct = 0.02;
      },
      /whole percentage/,
    ],
    [
      (c) => {
        c.econ.minPlatformStake = '5';
      },
      /does not consume/,
    ],
    [
      (c) => {
        delete c.econ.jobStake;
      },
      /Explicit econ.jobStake/,
    ],
    [
      (c) => {
        c.econ.treasurySlashPct = 1;
      },
      /sum to 100/,
    ],
    [
      (c) => {
        c.secureDefaults.pauseOnLaunch = false;
      },
      /pauseOnLaunch/,
    ],
    [
      (c) => {
        c.identity.roots.agentRoot.hash = ethers.id('wrong');
      },
      /name and hash disagree/,
    ],
    [
      (c) => {
        c.identity.agentRootNode = ethers.id('wrong');
      },
      /disagree/,
    ],
    [
      (c) => {
        c.tax = {
          enabled: true,
          uri: 'ipfs://QmExamplePolicyHash',
          description: 'example',
        };
      },
      /sample metadata/,
    ],
  ];
  for (const [mutate, match] of mutations) {
    const input = config();
    mutate(input);
    assert.throws(() => validateConfig(input, 'mainnet', token), match);
  }
});
test('normalizes accepted compound durations to exact seconds consumed by staged deployment', () => {
  const input = config();
  input.econ.commitWindow = '1h 30m';
  input.econ.revealWindow = '1.5h';
  const normalized = validateConfig(input, 'mainnet', token);
  assert.equal(normalized.econ.commitWindow, 5400);
  assert.equal(normalized.econ.revealWindow, 5400);
  assert.equal(input.econ.commitWindow, '1h 30m');
  input.econ.commitWindow = '3600';
  input.econ.revealWindow = 120;
  assert.equal(validateConfig(input, 'mainnet', token).econ.commitWindow, 3600);
  assert.equal(validateConfig(input, 'mainnet', token).econ.revealWindow, 120);
});
test('wrong RPC chain stops before dependency inspection', async () => {
  const report = await buildDeploymentCandidate(
    options({
      provider: {
        getNetwork: async () => ({ chainId: 11155111n }),
        getBlock: () => {
          throw new Error('must not read wrong chain');
        },
      },
    })
  );
  assert.equal(report.status, 'blocked');
  assert.match(report.blockers[0].detail, /RPC chain ID/);
});
test('offline inspection retains artifact/config evidence and cannot pass readiness', async () => {
  const report = await buildDeploymentCandidate(
    options({ provider: undefined })
  );
  assert.equal(report.status, 'blocked');
  assert.equal(report.chain.status, 'not-checked');
  assert.equal(report.artifacts.length, inventory().length - 1);
  assert.equal(report.blockers[0].gate, 'chain');
});
test('missing dependency code, wrong decimals and reference-block reorg fail closed', async () => {
  for (const replacement of [
    { getCode: async () => '0x' },
    {
      call: async () =>
        ethers.AbiCoder.defaultAbiCoder().encode(['uint8'], [6]),
    },
    {
      getBlock: async (tag) => ({
        number: 42,
        hash: ethers.id(tag === 'latest' ? 'block' : 'reorg'),
      }),
    },
  ]) {
    const input = options();
    Object.assign(input.provider, replacement);
    const report = await buildDeploymentCandidate(input);
    assert.equal(report.status, 'blocked');
    assert.equal(report.blockers[0].gate, 'chain');
    assert.equal(report.chain.status, 'failed');
  }
});
test('RPC failure report never serializes credential-bearing provider errors', async () => {
  const input = options();
  input.provider.getNetwork = async () => {
    throw new Error('https://rpc.example/PRIVATE_KEY?token=SECRET');
  };
  const report = await buildDeploymentCandidate(input);
  assert.equal(report.status, 'blocked');
  assert.doesNotMatch(
    JSON.stringify(report),
    /PRIVATE_KEY|SECRET|rpc\.example/
  );
});
test('missing, oversized or mismatched artifacts block deployment candidate', async () => {
  for (const replacement of [
    () => {
      throw new Error('Compile first');
    },
    ({ name, source }) => ({
      contractName: name,
      sourceName: source,
      abi: [],
      bytecode: '0x60',
      deployedBytecode: `0x${'60'.repeat(24577)}`,
    }),
    ({ name, source }) => ({
      contractName: `${name}Wrong`,
      sourceName: source,
      abi: [],
      bytecode: '0x60',
      deployedBytecode: '0x60',
    }),
  ]) {
    const report = await buildDeploymentCandidate(
      options({ readArtifact: replacement })
    );
    assert.equal(report.status, 'blocked');
    assert.equal(report.artifacts.length, 0);
    assert.ok(
      report.blockers.every((item) => item.gate.startsWith('artifact:'))
    );
  }
});
test('inventory covers actual staged component names and source references exist', async () => {
  const staged = fs.readFileSync('scripts/deploy/stage-protocol.cjs', 'utf8');
  const names = new Set(inventory().map((item) => item.name));
  for (const [, name] of staged.matchAll(/await create\(\s*'([^']+)'/g))
    assert.ok(names.has(name), name);
  for (const item of inventory())
    assert.ok(fs.existsSync(item.source), item.source);
  const report = await buildDeploymentCandidate(options());
  for (const stage of report.stages)
    assert.ok(fs.existsSync(stage.reference), stage.reference);
});
