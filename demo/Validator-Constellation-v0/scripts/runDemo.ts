import { ethers } from 'hardhat';
import { buildTree, getRoot } from '../src/merkle';
import { deployEnvironment } from '../src/environment';
import { executeJobRound, type JobExecutionTelemetry } from '../src/jobRunner';

const CONSTELLATION_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes('validator.constellation.demo'));

async function runDemo() {
  const env = await deployEnvironment();
  const telemetry: JobExecutionTelemetry[] = [];

  for (let i = 0; i < 3; i += 1) {
    telemetry.push(
      await executeJobRound(
        env,
        {
          domain: 'validator.constellation.demo',
          spec: `validator-job-${i}`,
          budget: ethers.parseEther('5'),
          expectedResult: true,
        },
        i,
      ),
    );
  }

  const leaves = telemetry.map((item) => item.leaf);
  const tree = buildTree(leaves);
  const root = getRoot(tree);
  const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
  const witness = ethers.keccak256(
    ethers.solidityPacked(['bytes32', 'uint256', 'address', 'uint256'], [root, BigInt(leaves.length), await env.demo.getAddress(), chainId]),
  );
  const proof = ethers.hexlify(ethers.concat([env.verifyingKey, root, witness]));
  const jobIds = telemetry.map((item) => item.jobId);
  await env.demo.submitBatchProof({ jobIds, jobsRoot: root, proof });

  await env.demo.connect(env.sentinel).reportSentinelAlert(CONSTELLATION_DOMAIN, jobIds[0], 'demo-guardrail');
  await env.demo.connect(env.owner).resumeDomain(CONSTELLATION_DOMAIN);

  const validatorTable = await Promise.all(
    env.validators.map(async (entry) => ({
      validator: entry.name,
      address: entry.signer.address,
      stake: ethers.formatEther(await env.stakeManager.stakeOf(entry.signer.address)),
    })),
  );

  const mermaidFlow = `graph TD
    Owner[Owner Multisig] -->|Configures ENS Roots| IdentityOracle
    Owner -->|Funds Treasury| StakeManager
    Owner -->|Boots Demo| DemoCore[ValidatorConstellationDemo]
    IdentityOracle -->|Verifies ENS| Validators
    StakeManager -->|Locks Stake| Validators
    Validators -->|Commit & Reveal| DemoCore
    Agent -->|Creates Job & Budget| DemoCore
    DemoCore -->|Batched Finality| zkVerifier
    DemoCore -->|Sentinel Pause| Sentinel
    Sentinel -->|Domain Alert| Owner`;

  const timeline = `gantt
    dateFormat  X
    axisFormat  %L
    section Launch
    Deploy Core :done, 0, 1
    Stake Validators :done, 1, 1
    section Validation
    Job Creation :active, 2, 1
    Commit & Reveal :active, 3, 1
    Batched Finality :4, 1
    section Guardrails
    Sentinel Ready :5, 1
    Domain Resume :6, 1`;

  const summary = {
    totalJobsFinalised: telemetry.length,
    committees: telemetry.map((item) => ({ jobId: item.jobId.toString(), size: item.committee.length })),
    domain: 'validator.constellation.demo',
    owner: env.owner.address,
    sentinel: env.sentinel.address,
    sentinelEvent: 'demo-guardrail',
  };

  console.log('\n🚀 Validator Constellation Demo Ready');
  console.table(validatorTable);
  console.log('\nMermaid Flow Diagram (paste into https://mermaid.live):\n');
  console.log(mermaidFlow);
  console.log('\nGantt Timeline:\n');
  console.log(timeline);
  console.log('\nOperational Summary:\n', summary);
}

runDemo().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
