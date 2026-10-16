'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {
  validateLocalContext,
  boundConfig,
  requireControlledAuthority,
} = require('../../demo/aurora/bin/local-authority.cjs');
const root = path.resolve(__dirname, '../..');
const config = require('../../demo/aurora/config/deployer.hardhat.json');
const creator = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const env = {
  LOCAL_NODE_STATE: '/tmp/owned-node',
  AGI_LOCAL_LOCK_OWNER: '{}',
  CHAIN_ID: '31337',
};

test('local authority rejects public networks, nonloopback endpoints and missing owned-node proof', () => {
  assert.equal(
    validateLocalContext('localhost', 31337, env).url,
    'http://127.0.0.1:8545'
  );
  for (const [network, chain, values] of [
    ['mainnet', 1, env],
    ['sepolia', 31337, env],
    ['localhost', 1, env],
    ['localhost', 31337, { ...env, RPC_URL: 'https://example.org' }],
    ['localhost', 31337, { ...env, LOCAL_NODE_STATE: '' }],
    ['localhost', 31337, { ...env, AGI_LOCAL_LOCK_OWNER: '' }],
  ])
    assert.throws(() => validateLocalContext(network, chain, values));
});

test('local commissioning binds explicit roles and campaign to the original raw configuration', () => {
  const c = {
    ...config,
    campaign: {
      chainId: 31337,
      blockNumber: 7,
      blockHash: '0x' + '11'.repeat(32),
    },
  };
  const bytes = JSON.stringify(c);
  const report = {
    provenance: 'new-staged-creation',
    withTax: true,
    creator,
    chainId: 31337,
    governance: c.governance,
    // The core normalizes role key order in its persisted report.
    authority: Object.fromEntries(Object.entries(c.authority).sort()),
    creationScope: { campaign: c.campaign },
    configSha256: createHash('sha256').update(bytes).digest('hex'),
    coordinator: config.governance,
    creationRecords: { Deployer: { address: config.governance } },
    contracts: {},
  };
  for (const name of [
    'StakeManager',
    'JobRegistry',
    'ValidationModule',
    'ReputationEngine',
    'DisputeModule',
    'CertificateNFT',
    'PlatformRegistry',
    'JobRouter',
    'PlatformIncentives',
    'FeePool',
    'IdentityRegistry',
    'SystemPause',
    'ArbitratorCommittee',
    'TaxPolicy',
  ]) {
    report.contracts[name] = c.governance;
    report.creationRecords[name] = { address: c.governance };
  }
  assert.deepEqual(boundConfig(report, bytes), c);
  for (const mutate of [
    (r) => {
      r.withTax = false;
    },
    (r) => {
      r.contracts.SystemPause = creator;
    },
    (r) => {
      r.coordinator = creator;
    },
    (r) => {
      delete r.contracts.IdentityRegistry;
    },
    (r) => {
      r.governance = creator;
    },
    (r) => {
      r.authority.feePoolTreasury = creator;
    },
    (r) => {
      r.creationScope.campaign.blockNumber--;
    },
    (r) => {
      r.provenance = 'historical-addressbook';
    },
    (r) => {
      r.configSha256 = '0'.repeat(64);
    },
  ]) {
    const bad = JSON.parse(JSON.stringify(report));
    mutate(bad);
    assert.throws(() => boundConfig(bad, bytes));
  }
  assert.throws(() => boundConfig(report, bytes + '\n'));
});

test('disposable audit permits only explicitly absent ENS and never claims public activation', () => {
  const blockers = [
    'ENS.agentRootNode: no readable registry',
    'ENS.clubRootNode: no readable registry',
  ];
  const certificate = {
    chainId: 31337,
    boundedBlockers: blockers,
    sourceVerificationComplete: false,
    activationReady: false,
    productionApproved: false,
  };
  const result = requireControlledAuthority(certificate);
  assert.equal(result.localFixtureReadbackPassed, true);
  assert.equal(result.sourceVerificationComplete, false);
  assert.equal(result.activationReady, false);
  assert.equal(result.productionApproved, false);
  for (const bad of [
    { ...certificate, chainId: 1 },
    { ...certificate, boundedBlockers: [...blockers, 'Deployer.owner'] },
    { ...certificate, boundedBlockers: [...blockers, 'FeePool.governance'] },
    { ...certificate, boundedBlockers: [blockers[0], blockers[0]] },
    {
      ...certificate,
      boundedBlockers: [
        blockers[0],
        'ENS.clubRootNode: external authority read incomplete',
      ],
    },
  ])
    assert.throws(() => requireControlledAuthority(bad));
});

test('explicit hardhat fixture refuses public overrides, recovery inputs and forwarded flags before runtime', () => {
  for (const extra of [
    { HARDHAT_NETWORK: 'mainnet' },
    { DEPLOYER_ADDRESS: creator },
    { DEPLOY_DEFAULTS_RESUME_EVIDENCE: 'old.json' },
    { DEPLOY_DEFAULTS_CONFIG: 'old.json' },
    { args: ['--network', 'mainnet'] },
  ]) {
    const { args = [], ...values } = extra;
    const result = spawnSync(
      process.execPath,
      ['demo/aurora/bin/deploy-hardhat.cjs', ...args],
      { cwd: root, env: { ...process.env, ...values }, encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /Deployment evidence/);
  }
});

test('Aurora and ASI launchers share the fresh local campaign configuration', () => {
  for (const name of [
    'demo/aurora/bin/aurora-local.sh',
    'demo/asi-takeoff/bin/asi-takeoff-local.sh',
  ]) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    assert.match(text, /start_local_node\nprepare_local_deployment_config/);
    assert.match(text, /DEPLOY_DEFAULTS_CONFIG="\$AURORA_LOCAL_DEPLOY_CONFIG"/);
  }
  assert.equal(
    require('../../package.json').scripts['deploy:local'],
    'node demo/aurora/bin/deploy-hardhat.cjs'
  );
});
