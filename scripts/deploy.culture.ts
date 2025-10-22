import { BigNumberish, ContractFactory, ethers, run } from 'hardhat';
import {
  confirmBytecode,
  ensureAddress,
  loadCultureConfig,
  saveCultureConfig,
  resolveSigner,
} from './culture/utils';

interface VerificationArgs {
  address: string;
  constructorArguments: unknown[];
  contract: string;
}

async function verifyContract(label: string, args: VerificationArgs): Promise<void> {
  try {
    await run('verify:verify', args);
    console.log(`✅ Verified ${label} on block explorer`);
  } catch (error: any) {
    const message: string = error?.message ?? String(error);
    if (message.includes('Already Verified')) {
      console.log(`ℹ️ ${label} already verified`);
      return;
    }
    console.warn(`⚠️ Verification for ${label} failed: ${message}`);
  }
}

async function deployCultureRegistry(
  factory: ContractFactory,
  owner: string,
  identityRegistry: string,
  kinds: string[],
  maxCitations: BigNumberish
): Promise<string> {
  const contract = await factory.deploy(owner, identityRegistry, kinds, maxCitations);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error('CultureRegistry deployment transaction failed');
  }
  console.log(`🚀 CultureRegistry deployed at ${address}`);
  await confirmBytecode('CultureRegistry', address);
  await verifyContract('CultureRegistry', {
    address,
    constructorArguments: [owner, identityRegistry, kinds, maxCitations],
    contract: 'contracts/v2/CultureRegistry.sol:CultureRegistry',
  });
  return address;
}

async function deploySelfPlayArena(
  factory: ContractFactory,
  owner: string,
  identityRegistry: string,
  jobRegistry: string,
  stakeManager: string,
  teacherReward: BigNumberish,
  studentReward: BigNumberish,
  validatorReward: BigNumberish,
  committeeSize: BigNumberish,
  validatorStake: BigNumberish,
  targetSuccessRateBps: BigNumberish
): Promise<string> {
  const contract = await factory.deploy(
    owner,
    identityRegistry,
    jobRegistry,
    stakeManager,
    teacherReward,
    studentReward,
    validatorReward,
    committeeSize,
    validatorStake,
    targetSuccessRateBps
  );
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error('SelfPlayArena deployment transaction failed');
  }
  console.log(`🚀 SelfPlayArena deployed at ${address}`);
  await confirmBytecode('SelfPlayArena', address);
  await verifyContract('SelfPlayArena', {
    address,
    constructorArguments: [
      owner,
      identityRegistry,
      jobRegistry,
      stakeManager,
      teacherReward,
      studentReward,
      validatorReward,
      committeeSize,
      validatorStake,
      targetSuccessRateBps,
    ],
    contract: 'contracts/v2/SelfPlayArena.sol:SelfPlayArena',
  });
  return address;
}

async function main(): Promise<void> {
  const config = await loadCultureConfig();
  const provider = ethers.provider;

  const deployer = await resolveSigner(provider, {
    envVar: 'CULTURE_DEPLOYER_KEY',
    vaultVar: 'CULTURE_DEPLOYER_VAULT_PATH',
    fallbackIndex: 0,
    label: 'Culture deployment',
  });

  const ownerAddress = ensureAddress('owner.address', config.owner.address);
  const identityRegistry = ensureAddress('dependencies.identityRegistry', config.dependencies.identityRegistry);
  const jobRegistry = ensureAddress('dependencies.jobRegistry', config.dependencies.jobRegistry);
  const stakeManager = ensureAddress('dependencies.stakeManager', config.dependencies.stakeManager);
  const feePool = ensureAddress('dependencies.feePool', config.dependencies.feePool);

  await confirmBytecode('IdentityRegistry', identityRegistry);
  await confirmBytecode('JobRegistry', jobRegistry);
  await confirmBytecode('StakeManager', stakeManager);
  await confirmBytecode('FeePool', feePool);

  const kinds = config.culture.kinds ?? [];
  if (!Array.isArray(kinds) || kinds.length === 0) {
    throw new Error('culture.kinds must contain at least one entry');
  }
  const maxCitations = BigInt(config.culture.maxCitations);
  if (maxCitations <= 0n) {
    throw new Error('culture.maxCitations must be greater than zero');
  }

  const cultureFactory = await ethers.getContractFactory(
    'contracts/v2/CultureRegistry.sol:CultureRegistry',
    deployer
  );
  const cultureAddress = await deployCultureRegistry(
    cultureFactory,
    ownerAddress,
    identityRegistry,
    kinds,
    maxCitations
  );

  const teacherReward = BigInt(config.arena.teacherReward);
  const studentReward = BigInt(config.arena.studentReward);
  const validatorReward = BigInt(config.arena.validatorReward);
  const committeeSize = BigInt(config.arena.committeeSize);
  const validatorStake = BigInt(config.arena.validatorStake);
  const targetSuccessRateBps = BigInt(config.arena.targetSuccessRateBps);

  const arenaFactory = await ethers.getContractFactory(
    'contracts/v2/SelfPlayArena.sol:SelfPlayArena',
    deployer
  );
  const arenaAddress = await deploySelfPlayArena(
    arenaFactory,
    ownerAddress,
    identityRegistry,
    jobRegistry,
    stakeManager,
    teacherReward,
    studentReward,
    validatorReward,
    committeeSize,
    validatorStake,
    targetSuccessRateBps
  );

  const arena = arenaFactory.attach(arenaAddress).connect(deployer);
  const feePoolTx = await arena.setFeePool(feePool);
  const feePoolReceipt = await feePoolTx.wait(1);
  if (!feePoolReceipt || feePoolReceipt.status !== 1) {
    throw new Error('Failed to configure FeePool on SelfPlayArena');
  }
  const feePoolEvent = feePoolReceipt.logs
    .map((log) => {
      try {
        return arena.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .filter((parsed) => parsed && parsed.name === 'FeePoolUpdated');
  if (feePoolEvent.length === 0) {
    console.warn('⚠️ No FeePoolUpdated event detected; confirm configuration manually.');
  } else {
    console.log('✅ FeePoolUpdated event emitted');
  }

  const feePoolContract = await ethers.getContractAt(
    'contracts/v2/FeePool.sol:FeePool',
    feePool,
    deployer
  );
  try {
    const rewarderTx = await feePoolContract.setRewarder(arenaAddress, true);
    const rewarderReceipt = await rewarderTx.wait(1);
    if (rewarderReceipt?.status === 1) {
      console.log('✅ FeePool rewarder permissions granted to SelfPlayArena');
    }
  } catch (error: any) {
    const message: string = error?.error?.message ?? error?.message ?? String(error);
    console.warn(
      `⚠️ Unable to authorise SelfPlayArena as FeePool rewarder automatically: ${message}. ` +
        'Ensure the FeePool owner grants reward permissions manually.'
    );
  }

  config.contracts = {
    ...config.contracts,
    cultureRegistry: cultureAddress,
    selfPlayArena: arenaAddress,
  };
  config.dependencies.identityRegistry = identityRegistry;
  config.dependencies.jobRegistry = jobRegistry;
  config.dependencies.stakeManager = stakeManager;
  config.dependencies.feePool = feePool;
  (config.dependencies as any).cultureRegistry = cultureAddress;
  (config.dependencies as any).selfPlayArena = arenaAddress;

  await saveCultureConfig(config);
  console.log('📝 Updated config/culture.json with deployed addresses');
}

main().catch((error) => {
  console.error('Culture deployment failed:', error);
  process.exitCode = 1;
});
