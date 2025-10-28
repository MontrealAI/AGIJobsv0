import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadAlphaNodeConfig, makeEnsName } from '../src/config';

const fixturePath = path.resolve('demo/AGI-Alpha-Node-v0/config/mainnet.guide.json');

test('loads and normalises alpha node config', async () => {
  const config = await loadAlphaNodeConfig(fixturePath);
  assert.equal(makeEnsName(config), `${config.operator.ensLabel}.${config.operator.ensRoot}`);
  assert.equal(typeof config.operator.minimumStakeWei, 'bigint');
  assert.equal(typeof config.ai.reinvestThresholdWei, 'bigint');
  assert(config.ai.economicPolicy.rewardSplit.operator + config.ai.economicPolicy.rewardSplit.treasury + config.ai.economicPolicy.rewardSplit.specialists - 1 < 1e-6);
});
