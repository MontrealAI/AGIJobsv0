import 'dotenv/config';
import { ethers } from 'hardhat';
import { z } from 'zod';
import { loadCultureConfig, parseAddressesBlob } from './utils';
import { loadContractArtifact, type ArtifactDescriptor } from './hardhat-utils';

const ARENA_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/SelfPlayArena.sol:SelfPlayArena',
  fallback: 'SelfPlayArena'
};

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  SELF_PLAY_ARENA_ADDRESS: z.string().min(1),
  DEPLOYER_PRIVATE_KEY: z.string().optional(),
  OWNER_ADMIN_PRIVATE_KEY: z.string().optional(),
  AGI_JOBS_CORE_ADDRESSES: z.string().optional()
});

const ROLE_HASHES = {
  author: ethers.id('AUTHOR_ROLE'),
  teacher: ethers.id('TEACHER_ROLE'),
  student: ethers.id('STUDENT_ROLE'),
  validator: ethers.id('VALIDATOR_ROLE')
};

const IDENTITY_ABI = [
  'function setRole(bytes32 role, address account, bool allowed) external',
  'function hasRole(bytes32 role, address account) view returns (bool)'
];

async function configureIdentity(identityAddress: string, wallet: ethers.Wallet, config: Awaited<ReturnType<typeof loadCultureConfig>>) {
  if (!identityAddress || identityAddress === ethers.ZeroAddress) {
    console.warn('⚠️  No identity registry configured; skipping role provisioning.');
    return;
  }
  const identity = new ethers.Contract(identityAddress, IDENTITY_ABI, wallet);
  const roleUpdates: Array<{ label: keyof typeof ROLE_HASHES; account: string }> = [];
  for (const address of config.roles.authors) {
    roleUpdates.push({ label: 'author', account: address });
  }
  for (const address of config.roles.teachers) {
    roleUpdates.push({ label: 'teacher', account: address });
  }
  for (const address of config.roles.students) {
    roleUpdates.push({ label: 'student', account: address });
  }
  for (const address of config.roles.validators) {
    roleUpdates.push({ label: 'validator', account: address });
  }
  for (const update of roleUpdates) {
    try {
      const already = await identity.hasRole(ROLE_HASHES[update.label], update.account);
      if (already) {
        console.log(`ℹ️  ${update.label} ${update.account} already authorised.`);
        continue;
      }
      const tx = await identity.setRole(ROLE_HASHES[update.label], update.account, true);
      await tx.wait();
      console.log(`✅ Granted ${update.label} role to ${update.account}`);
    } catch (error) {
      console.warn(`⚠️  Failed to set ${update.label} role for ${update.account}: ${(error as Error).message}`);
    }
  }
}

async function configureOrchestrators(arenaAddress: string, wallet: ethers.Wallet, orchestrators: readonly string[]) {
  if (!orchestrators.length) {
    return;
  }
  const artifact = await loadContractArtifact(ARENA_ARTIFACT);
  const arena = new ethers.Contract(arenaAddress, artifact.abi, wallet);
  for (const orchestrator of orchestrators) {
    const already = await arena.orchestrators(orchestrator);
    if (already) {
      console.log(`ℹ️  Orchestrator ${orchestrator} already authorised.`);
      continue;
    }
    const tx = await arena.setOrchestrator(orchestrator, true);
    await tx.wait();
    console.log(`✅ Added orchestrator ${orchestrator}`);
  }
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const config = await loadCultureConfig();
  const addresses = parseAddressesBlob(env.AGI_JOBS_CORE_ADDRESSES);
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const privateKey = env.OWNER_ADMIN_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('OWNER_ADMIN_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY must be set to execute owner actions.');
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔐 Executing owner role configuration with ${wallet.address}`);

  await configureIdentity(addresses.identityRegistry ?? ethers.ZeroAddress, wallet, config);
  await configureOrchestrators(env.SELF_PLAY_ARENA_ADDRESS, wallet, config.roles.orchestrators);
}

main().catch((error) => {
  console.error('Owner role configuration failed:', error);
  process.exitCode = 1;
});
