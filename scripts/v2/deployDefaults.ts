import { ethers, run } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';

// Helper to verify a contract on Etherscan (skips if API key not provided)
async function verify(address: string, args: any[] = []) {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.warn(
      `Skipping Etherscan verification for ${address} (no API key set).`
    );
    return;
  }
  try {
    await run('verify:verify', {
      address,
      constructorArguments: args,
    });
    console.log(`✓ Verified contract at ${address}`);
  } catch (err) {
    console.error(`Verification failed for ${address}:`, err);
  }
}

async function main() {
  const [owner] = await ethers.getSigners();
  const withTax = !process.argv.includes('--no-tax');
  const governanceArgIndex = process.argv.indexOf('--governance');
  const governance =
    governanceArgIndex !== -1
      ? process.argv[governanceArgIndex + 1]
      : owner.address;

  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log('Deployer deployed at', deployerAddress);

  const ids = {
    ens: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
    clubRootNode: ethers.namehash('club.agi.eth'),
    agentRootNode: ethers.namehash('agent.agi.eth'),
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };

  const tx = withTax
    ? await deployer.deployDefaults(ids, governance)
    : await deployer.deployDefaultsWithoutTaxPolicy(ids, governance);
  const receipt = await tx.wait();
  const log = receipt.logs.find((l) => l.address === deployerAddress);
  const decoded = deployer.interface.decodeEventLog(
    'Deployed',
    log!.data,
    log!.topics
  );

  const [
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry,
    systemPause,
  ] = decoded as string[];

  // Retrieve the ArbitratorCommittee address for verification
  const disputeContract = await ethers.getContractAt(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule',
    disputeModule
  );
  const committee = await disputeContract.committee();

  await verify(deployerAddress);
  await verify(stakeManager, [
    ethers.parseUnits('1', AGIALPHA_DECIMALS),
    0,
    100,
    governance,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance,
  ]);
  await verify(jobRegistry, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    5,
    0,
    [stakeManager],
  ]);
  await verify(validationModule, [
    jobRegistry,
    stakeManager,
    86400,
    86400,
    0,
    0,
    [],
  ]);
  await verify(reputationEngine, [stakeManager]);
  await verify(disputeModule, [jobRegistry, 0, 0, ethers.ZeroAddress]);
  await verify(committee, [jobRegistry, disputeModule]);
  await verify(certificateNFT, ['Cert', 'CERT']);
  await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
  await verify(jobRouter, [platformRegistry]);
  await verify(platformIncentives, [stakeManager, platformRegistry, jobRouter]);
  await verify(feePool, [
    stakeManager,
    2,
    governance,
    taxPolicy !== ethers.ZeroAddress ? taxPolicy : ethers.ZeroAddress,
  ]);
  await verify(identityRegistry, [
    ids.ens,
    ids.nameWrapper,
    reputationEngine,
    ethers.ZeroHash,
    ethers.ZeroHash,
  ]);
  await verify(systemPause, [
    jobRegistry,
    stakeManager,
    validationModule,
    disputeModule,
    platformRegistry,
    feePool,
    reputationEngine,
    committee,
    governance,
  ]);
  if (withTax) {
    await verify(taxPolicy, [
      'ipfs://policy',
      'All taxes on participants; contract and owner exempt',
    ]);
  }

  console.log('Deployment complete.');
  console.log('Addresses:');
  console.log('  StakeManager:', stakeManager);
  console.log('  ReputationEngine:', reputationEngine);
  console.log('  IdentityRegistry:', identityRegistry);
  console.log('  AttestationRegistry:', identityRegistry);
  console.log('  JobRegistry:', jobRegistry);
  console.log('  ValidationModule:', validationModule);
  console.log('  DisputeModule:', disputeModule);
  console.log('  ArbitratorCommittee:', committee);
  console.log('  CertificateNFT:', certificateNFT);
  console.log('  PlatformRegistry:', platformRegistry);
  console.log('  JobRouter:', jobRouter);
  console.log('  PlatformIncentives:', platformIncentives);
  console.log('  FeePool:', feePool);
  console.log('  TaxPolicy:', taxPolicy);
  console.log('  SystemPause (governance controller):', systemPause);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
