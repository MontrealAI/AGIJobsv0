'use strict';
// Reproduce the historical panic and check the repaired source, in a disposable local EVM.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { ethers, network } = require('hardhat');

async function main() {
  if (network.name !== 'hardhat' || network.config.url || network.config.forking) {
    throw Error('Private in-process unforked Hardhat only');
  }
  const metadata = await ethers.provider.send('hardhat_metadata', []);
  if (!metadata.instanceId || metadata.forkedNetwork) throw Error('Disposable local instance required');
  const [owner] = await ethers.getSigners();
  const historicalPath = require.resolve('../v2/lib/prebuilt/ReputationEngine.json');
  assert.equal(createHash('sha256').update(readFileSync(historicalPath)).digest('hex'),
    '8a21b153e6ce189d14ee4f69288301118c22eeaa0026627338764412e0060c36');
  const historicalArtifact = require(historicalPath);
  const stake = await (await ethers.getContractFactory('MockStakeManager')).deploy();
  const historical = await new ethers.ContractFactory(historicalArtifact.abi, historicalArtifact.bytecode, owner).deploy(await stake.getAddress());
  const current = await (await ethers.getContractFactory('contracts/v2/ReputationEngine.sol:ReputationEngine')).deploy(await stake.getAddress());
  for (const engine of [historical, current]) {
    await engine.setCaller(owner.address, true);
    await engine.add(owner.address, 20000);
    assert.equal(await engine.reputationOf(owner.address), 19036n);
  }
  await assert.rejects(historical.add(owner.address, 1), /panic code 0x11/);
  await current.add(owner.address, 1);
  assert.equal(await current.reputationOf(owner.address), 19036n);
  await current.onFinalize(owner.address, true, ethers.parseEther('100'), 100000);
  assert.equal(await current.reputationOf(owner.address), 19068n);
  console.log(JSON.stringify({
    historicalPanicReproduced: true,
    freshSourcePositiveCreditFixed: true,
    scoreAfter20000: '19036',
    scoreAfterOne: '19036',
    scoreAfterSuccessfulHook: '19068',
    fixture: 'actual ReputationEngine with MockStakeManager, unforked disposable EVM',
    registrySettlementCoveredSeparatelyBy: 'test/v2/JobStakeLifecycle.test.js',
    externalTransactions: false,
    independentReview: 'NOT PERFORMED',
    productionApproved: false,
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
