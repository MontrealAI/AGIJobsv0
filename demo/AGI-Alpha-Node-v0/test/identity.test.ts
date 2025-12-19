import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAlphaNodeConfig } from '../src/config';
import { verifyNodeIdentity } from '../src/identity/verify';
import type { EnsLookup, EnsResolution } from '../src/identity/types';
import { fixturePath } from './test-utils';

class StubLookup implements EnsLookup {
  constructor(private readonly resolution: EnsResolution) {}
  resolve(): Promise<EnsResolution> {
    return Promise.resolve(this.resolution);
  }
}

test('identity verification succeeds for matching owner', async () => {
  const config = await loadAlphaNodeConfig(fixturePath('mainnet.guide.json'));
  const lookup = new StubLookup({
    owner: config.operator.address,
    wrapperOwner: config.operator.address,
    registrant: config.operator.address,
    expiry: Math.floor(Date.now() / 1000) + 60,
    contentHash: null,
    records: { 'agijobs:v2:node': config.operator.address }
  });
  const result = await verifyNodeIdentity(config, lookup);
  assert(result.matches);
});

test('identity verification reports mismatches', async () => {
  const config = await loadAlphaNodeConfig(fixturePath('mainnet.guide.json'));
  const lookup = new StubLookup({
    owner: '0x0000000000000000000000000000000000000001',
    wrapperOwner: '0x0000000000000000000000000000000000000001',
    registrant: '0x0000000000000000000000000000000000000001',
    expiry: Math.floor(Date.now() / 1000) - 10,
    contentHash: null,
    records: {}
  });
  const result = await verifyNodeIdentity(config, lookup);
  assert(!result.matches);
  assert(result.reasons.length >= 1);
});
