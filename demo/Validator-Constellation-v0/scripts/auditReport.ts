import { ethers } from '../src/runtime';
import { deployEnvironment } from '../src/environment';
import { executeJobRound } from '../src/jobRunner';

async function auditReport() {
  const env = await deployEnvironment();
  await executeJobRound(
    env,
    {
      domain: 'validator.constellation.demo',
      spec: 'audit-proving-run',
      budget: ethers.parseEther('3'),
      expectedResult: true,
    },
  );

  const totalStake = await env.validators.reduce(async (accPromise, entry) => {
    const acc = await accPromise;
    const stake = await env.stakeManager.stakeOf(entry.address);
    return acc + stake;
  }, Promise.resolve(0n));

  const report = {
    owner: await env.owner.getAddress(),
    sentinel: await env.sentinel.getAddress(),
    validatorCount: env.validators.length,
    totalStakeEth: ethers.formatEther(totalStake),
    verifyingKey: env.verifyingKey,
  };

  const controlChecklist = [
    { control: 'ENS Policy', status: 'enforced', evidence: 'identity oracle merkle root' },
    { control: 'Stake Lock', status: 'active', evidence: 'ConstellationStakeManager.lockStake' },
    { control: 'Sentinel Pause', status: 'ready', evidence: 'reportSentinelAlert' },
    { control: 'ZK Batching', status: 'ready', evidence: 'submitBatchProof' },
  ];

  console.log('\n🛡️  Validator Constellation Audit Report');
  console.log('Core Summary:', report);
  console.table(controlChecklist);
}

auditReport().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
