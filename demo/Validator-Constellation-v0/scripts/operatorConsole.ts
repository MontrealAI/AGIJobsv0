import { ethers } from 'hardhat';
import { deployEnvironment } from '../src/environment';
import { executeJobRound } from '../src/jobRunner';

async function operatorConsole() {
  const env = await deployEnvironment();
  const telemetry = await executeJobRound(
    env,
    {
      domain: 'validator.constellation.demo',
      spec: 'operator-console-health-check',
      budget: ethers.parseEther('2'),
      expectedResult: true,
    },
  );

  const validatorRows = await Promise.all(
    env.validators.map(async (entry) => ({
      validator: entry.name,
      address: entry.signer.address,
      stake: ethers.formatEther(await env.stakeManager.stakeOf(entry.signer.address)),
    })),
  );

  const guardrailStatus = await env.demo.domains(ethers.keccak256(ethers.toUtf8Bytes('validator.constellation.demo')));

  const consoleMermaid = `graph TD
    Operator --> Dashboard
    Dashboard -->|Stake| StakePanel
    Dashboard -->|Domains| DomainPanel
    Dashboard -->|Sentinel| SentinelPanel
    SentinelPanel -->|Resume| Operator
    DomainPanel -->|Pause| SentinelPanel`;

  console.log('\n🛰️  Validator Constellation Operator Console');
  console.table(validatorRows);
  console.log('\nDomain Status:', {
    paused: guardrailStatus.paused,
    pausedAt: guardrailStatus.pausedAt.toString(),
  });
  console.log('\nMost Recent Job Telemetry:', {
    jobId: telemetry.jobId.toString(),
    committeeSize: telemetry.committee.length,
    approvals: telemetry.approvals.toString(),
    rejections: telemetry.rejections.toString(),
  });
  console.log('\nConsole Layout Mermaid:\n');
  console.log(consoleMermaid);
}

operatorConsole().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
