import 'dotenv/config';
import { ethers, network } from 'hardhat';
import { z } from 'zod';
import path from 'node:path';
import { loadCultureConfig, parseAddressesBlob, updateEnvFile, writeDeployments } from './utils';
import { loadContractArtifact, type ArtifactDescriptor } from './hardhat-utils';

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  DEPLOYER_PRIVATE_KEY: z.string().min(1),
  OWNER_ADDRESS: z.string().min(1),
  AGI_JOBS_CORE_ADDRESSES: z.string().optional(),
  CULTURE_DEPLOY_OUTPUT: z.string().optional(),
  CULTURE_ENV_FILE: z.string().optional()
});

const CULTURE_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/CultureRegistry.sol:CultureRegistry',
  fallback: 'CultureRegistry'
};
const ARENA_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/SelfPlayArena.sol:SelfPlayArena',
  fallback: 'SelfPlayArena'
};

async function main() {
  const env = EnvSchema.parse(process.env);
  const config = await loadCultureConfig();
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);

  console.log(`📦 Deploying CULTURE stack from ${wallet.address}`);
  const identityRegistry = parseAddressesBlob(env.AGI_JOBS_CORE_ADDRESSES).identityRegistry ?? ethers.ZeroAddress;

  const cultureArtifact = await loadContractArtifact(CULTURE_ARTIFACT);
  const cultureFactory = new ethers.ContractFactory(cultureArtifact.abi, cultureArtifact.bytecode, wallet);
  const culture = await cultureFactory.deploy(
    config.owner.address,
    identityRegistry,
    config.culture.kinds,
    config.culture.maxCitations
  );
  await culture.waitForDeployment();
  const cultureAddress = await culture.getAddress();
  console.log(`✅ CultureRegistry deployed at ${cultureAddress}`);

  const arenaArtifact = await loadContractArtifact(ARENA_ARTIFACT);
  const arenaFactory = new ethers.ContractFactory(arenaArtifact.abi, arenaArtifact.bytecode, wallet);
  const arena = await arenaFactory.deploy(
    config.owner.address,
    identityRegistry,
    config.arena.baseRewards.teacher,
    config.arena.baseRewards.student,
    config.arena.baseRewards.validator,
    config.arena.committeeSize,
    config.arena.validatorStake,
    Math.round(config.arena.targetSuccessRate * 10_000)
  );
  await arena.waitForDeployment();
  const arenaAddress = await arena.getAddress();
  console.log(`✅ SelfPlayArena deployed at ${arenaAddress}`);

  const outputPath = env.CULTURE_DEPLOY_OUTPUT ?? path.resolve('demo/CULTURE-v0/config/deployments.local.json');
  await writeDeployments(outputPath, {
    network: network.name,
    chainId: await wallet.provider.getChainId(),
    cultureRegistry: cultureAddress,
    selfPlayArena: arenaAddress,
    identityRegistry
  });
  console.log(`📝 Deployment manifest written to ${outputPath}`);

  if (env.CULTURE_ENV_FILE) {
    await updateEnvFile(env.CULTURE_ENV_FILE, {
      CULTURE_REGISTRY_ADDRESS: cultureAddress,
      SELF_PLAY_ARENA_ADDRESS: arenaAddress
    });
    console.log(`🔧 Updated env file ${env.CULTURE_ENV_FILE}`);
  }
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exitCode = 1;
});
