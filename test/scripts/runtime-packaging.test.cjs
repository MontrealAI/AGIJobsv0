const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

test('compiled validator help loads its protocol, review admission and recovery assets without credentials', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'apps/validator/dist/apps/validator/index.js'), '--help'],
    {
      cwd: root,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VALIDATOR_REVIEW_FILE/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
});

for (const entry of [
  'apps/orchestrator/dist/apps/orchestrator/main.js',
  'agent-gateway/dist/agent-gateway/index.js',
]) {
  test(`${entry} reaches configuration validation`, () => {
    const result = spawnSync(process.execPath, [path.join(root, entry)], {
      cwd: root,
      env: { PATH: process.env.PATH, JOB_REGISTRY_ADDRESS: '' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /JOB_REGISTRY_ADDRESS is required/);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
  });
}
test('compiled gateway loads its token and ENS configuration helpers', () => {
  const {
    loadTokenConfig,
    loadEnsConfig,
  } = require('../../agent-gateway/dist/scripts/config');
  assert.equal(loadTokenConfig({ network: 'mainnet' }).config.decimals, 18);
  assert.ok(loadEnsConfig({ network: 'mainnet', persist: false }).config);
});
test('compiled gateway can load its gRPC schema', () => {
  const loader = require('@grpc/proto-loader');
  const schema = loader.loadSync(
    path.join(
      root,
      'agent-gateway/dist/agent-gateway/protos/agent_gateway.proto'
    )
  );
  assert.ok(Object.keys(schema).length > 0);
});

test('compiled gateway includes its receipt-attestation runtime dependency graph', async () => {
  const attestation = require('../../agent-gateway/dist/agent-gateway/attestation');
  attestation.setReceiptAttester(null);
  const result = await attestation.attestExecutionReceipt({
    jobId: 'packaging-smoke',
  });
  assert.match(result.digest, /^0x[0-9a-f]{64}$/i);
  assert.equal(result.attestation, undefined);
});
