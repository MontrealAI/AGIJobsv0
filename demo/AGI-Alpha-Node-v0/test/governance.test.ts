import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';
import { loadAlphaNodeConfig } from '../src/config';
import {
  applyGovernanceUpdate,
  loadGovernanceUpdate,
} from '../src/blockchain/governance';
import { fixturePath } from './test-utils';

const CONFIG_PATH = fixturePath('mainnet.guide.json');
const GOVERNANCE_MANIFEST_PATH = fixturePath('governance.update.guide.json');

function createOfflineWallet(): Wallet {
  const provider = new JsonRpcProvider('http://127.0.0.1:8545');
  return new Wallet(
    '0x59c6995e998f97a5a0044976f2ca8c3c59dffa6a80ad5f1d54f8b8b3c8d7a9b0',
    provider
  );
}

test('governance manifest parsing normalises values', async () => {
  const update = await loadGovernanceUpdate(GOVERNANCE_MANIFEST_PATH);
  assert.equal(update.minPlatformStakeHuman, '12500');
  assert.equal(
    update.minPlatformStakeWei?.toString(),
    parseEther('12500').toString()
  );
  assert.equal(update.registrars.length, 2);
  assert.equal(update.blacklist.length, 1);
});

test('governance dry-run produces encoded calldata and summary', async () => {
  const config = await loadAlphaNodeConfig(CONFIG_PATH);
  const update = await loadGovernanceUpdate(GOVERNANCE_MANIFEST_PATH);
  const wallet = createOfflineWallet();
  const report = await applyGovernanceUpdate(wallet, config, update, {
    dryRun: true,
  });
  assert.equal(report.dryRun, true);
  assert.notEqual(report.calldata, '0x');
  assert.ok(report.summary.minStake);
  assert.equal(report.summary.minStake?.human, '12500');
  assert.ok(report.notes.some((note) => note.includes('Target PlatformRegistry')));
});
