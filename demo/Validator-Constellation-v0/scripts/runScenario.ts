import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'hardhat';
import { deployEnvironment } from '../src/environment';
import { executeJobRound } from '../src/jobRunner';
import { buildTree, getRoot } from '../src/merkle';

interface ScenarioJob {
  spec: string;
  budget: string;
  expectedResult: boolean;
}

interface ScenarioConfig {
  title: string;
  domain: string;
  jobs: ScenarioJob[];
}

async function loadScenario(filePath: string): Promise<ScenarioConfig> {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data) as ScenarioConfig;
}

async function runScenario() {
  const scenarioPath = process.argv[2] ?? path.join(__dirname, '..', 'scenario', 'baseline.json');
  const scenario = await loadScenario(scenarioPath);
  const env = await deployEnvironment();

  const telemetry = [];
  for (let i = 0; i < scenario.jobs.length; i += 1) {
    const job = scenario.jobs[i];
    telemetry.push(
      await executeJobRound(
        env,
        {
          domain: scenario.domain,
          spec: job.spec,
          budget: ethers.parseEther(job.budget),
          expectedResult: job.expectedResult,
        },
        i,
      ),
    );
  }

  const leaves = telemetry.map((item) => item.leaf);
  const root = getRoot(buildTree(leaves));
  const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
  const witness = ethers.keccak256(
    ethers.solidityPacked(['bytes32', 'uint256', 'address', 'uint256'], [root, BigInt(leaves.length), await env.demo.getAddress(), chainId]),
  );
  const proof = ethers.hexlify(ethers.concat([env.verifyingKey, root, witness]));
  const jobIds = telemetry.map((item) => item.jobId);
  await env.demo.submitBatchProof({ jobIds, jobsRoot: root, proof });

  const summary = {
    scenario: scenario.title,
    domain: scenario.domain,
    jobsExecuted: telemetry.length,
    validators: env.validators.map((v) => v.name),
    sentinel: env.sentinel.address,
  };

  const mermaid = `graph LR
    Owner[Owner]
    Owner -->|Deploys| Demo[Validator Constellation]
    Demo -->|Validates| Jobs((Jobs))
    Jobs -->|Batched zk Proof| zkVerifier
    Demo -->|Sentinel Alert| Sentinel(${env.sentinel.address.slice(0, 10)}...)
    Sentinel -->|Resume| Owner`;

  console.log(`\n📡 Scenario: ${scenario.title}`);
  console.table(
    telemetry.map((item, idx) => ({
      job: scenario.jobs[idx].spec,
      committee: item.committee.length,
      approvals: item.approvals.toString(),
    })),
  );
  console.log('\nMermaid Blueprint:\n');
  console.log(mermaid);
  console.log('\nScenario Summary:\n', summary);
}

runScenario().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
