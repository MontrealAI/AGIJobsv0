import { randomBytes } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ethers, network } from 'hardhat';
import {
  CULTURE_ROOT,
  loadCultureConfig,
  updateEnvFile,
  writeDeployments,
} from './utils';

// Public Anvil fixture key. This script refuses non-local networks and non-default accounts.
const LOCAL_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const LOCAL_OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

async function main() {
  const rpc = new URL(process.env.RPC_URL ?? 'http://127.0.0.1:8545');
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (
    process.env.CULTURE_LOCAL_FIXTURES !== '1' ||
    chainId !== 31337 ||
    !['hardhat', 'localhost'].includes(network.name) ||
    !['127.0.0.1', 'localhost', 'culture-chain'].includes(rpc.hostname)
  ) {
    throw new Error(
      'Local fixtures require CULTURE_LOCAL_FIXTURES=1, chain 31337, and a local RPC'
    );
  }
  const [owner] = await ethers.getSigners();
  if (owner.address !== LOCAL_OWNER)
    throw new Error('Local bootstrap requires the default Anvil test account');
  const output =
    process.env.CULTURE_DEPLOY_OUTPUT ??
    path.join(CULTURE_ROOT, 'config/deployments.local.json');
  const envFile =
    process.env.CULTURE_ENV_FILE ?? path.join(CULTURE_ROOT, '.env.local');
  let previous;
  try {
    previous = JSON.parse(await readFile(output, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous) {
    if (previous.network !== 'local-fixtures' || previous.chainId !== chainId) {
      throw new Error(
        'Existing deployment is not a local fixture; refusing to overwrite it'
      );
    }
    for (const key of [
      'cultureRegistry',
      'selfPlayArena',
      'identityRegistry',
      'jobRegistry',
      'stakeManager',
      'validationModule',
    ]) {
      if (
        !ethers.isAddress(previous[key]) ||
        (await ethers.provider.getCode(previous[key])) === '0x'
      ) {
        throw new Error(
          'Local chain differs from the saved deployment. Archive/reset the local manifest and indexer database together before creating a new fixture stack.'
        );
      }
    }
    await access(envFile);
    console.log(
      'Reusing the existing local fixture deployment and environment; state preserved.'
    );
    return;
  }
  const config = await loadCultureConfig();
  const deploy = async (name: string, args: unknown[] = []) => {
    const factory = await ethers.getContractFactory(name, owner);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    return new ethers.Contract(
      await contract.getAddress(),
      factory.interface,
      owner
    );
  };
  const identity = await deploy('MockIdentityRegistry');
  const jobs = await deploy('MockJobRegistry');
  const stake = await deploy('MockStakeManager');
  const validation = await deploy('MockValidationModule');
  for (const [role, accounts] of Object.entries({
    AUTHOR_ROLE: config.roles.authors,
    TEACHER_ROLE: config.roles.teachers,
    STUDENT_ROLE: config.roles.students,
    VALIDATOR_ROLE: config.roles.validators,
  })) {
    for (const account of accounts)
      await (await identity.setRole(ethers.id(role), account, true)).wait();
  }
  if (!config.roles.teachers[0])
    throw new Error('Local fixture needs a teacher');
  await (await jobs.setJob(1, owner.address, config.roles.teachers[0])).wait();
  for (const [index, account] of config.roles.students.entries()) {
    await (await jobs.setJob(10 + index, owner.address, account)).wait();
  }
  for (const [index, account] of config.roles.validators.entries()) {
    await (await jobs.setJob(20 + index, owner.address, account)).wait();
  }
  const dependencies = {
    identityRegistry: await identity.getAddress(),
    jobRegistry: await jobs.getAddress(),
    stakeManager: await stake.getAddress(),
    validationModule: await validation.getAddress(),
  };
  const culture = await deploy('CultureRegistry', [
    owner.address,
    dependencies.identityRegistry,
    config.culture.kinds,
    config.culture.maxCitations,
  ]);
  const arena = await deploy('SelfPlayArena', [
    owner.address,
    owner.address,
    dependencies.identityRegistry,
    dependencies.jobRegistry,
    dependencies.stakeManager,
    dependencies.validationModule,
    config.arena.committeeSize,
    BigInt(config.arena.validatorStake),
    {
      teacher: BigInt(config.arena.teacherReward),
      student: BigInt(config.arena.studentReward),
      validator: BigInt(config.arena.validatorReward),
    },
    config.arena.targetSuccessRateBps,
    config.arena.maxDifficultyStep,
  ]);
  for (const account of config.orchestrators)
    await (await arena.setRelayerAuthorization(account, true)).wait();
  const seeds = JSON.parse(
    await readFile(path.join(CULTURE_ROOT, 'data/seed-artifacts.json'), 'utf8')
  );
  for (const artifact of seeds) {
    if (BigInt(artifact.id) !== (await culture.totalArtifacts()) + 1n)
      throw new Error('Seed IDs must be contiguous and ordered');
    await (
      await culture.mintArtifact(
        artifact.kind,
        artifact.cid,
        artifact.parentId ?? 0,
        artifact.cites ?? []
      )
    ).wait();
  }
  const cultureRegistry = await culture.getAddress();
  const selfPlayArena = await arena.getAddress();
  await writeDeployments(output, {
    network: 'local-fixtures',
    chainId,
    cultureRegistry,
    selfPlayArena,
    ...dependencies,
  });
  await updateEnvFile(envFile, {
    RPC_URL: 'http://culture-chain:8545',
    CHAIN_ID: '31337',
    OWNER_ADDRESS: owner.address,
    DEPLOYER_PRIVATE_KEY: LOCAL_KEY,
    ORCHESTRATOR_PRIVATE_KEY: LOCAL_KEY,
    ORCHESTRATOR_API_TOKEN: randomBytes(32).toString('hex'),
    AGI_JOBS_CORE_ADDRESSES: JSON.stringify(dependencies),
    CULTURE_REGISTRY_ADDRESS: cultureRegistry,
    SELF_PLAY_ARENA_ADDRESS: selfPlayArena,
    DATABASE_URL: 'file:/data/db/culture-graph.db',
    IPFS_API_ENDPOINT: 'http://culture-ipfs:5001',
    IPFS_GATEWAY: 'http://culture-ipfs:8080',
    VITE_DEMO_MODE: 'false',
    VITE_ORCHESTRATOR_URL: 'http://localhost:4005',
    VITE_INDEXER_URL: 'http://localhost:4100/graphql',
    VITE_IPFS_GATEWAY: 'http://localhost:8080',
  });
  console.log(
    `Local fixture stack deployed and ${seeds.length} artifacts seeded. Dependency contracts are test doubles; no paid settlement is proven.`
  );
  console.log(`Manifest: ${output}; local environment: ${envFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
