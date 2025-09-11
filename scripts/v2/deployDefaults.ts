import { ethers, run } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';

// Helper to verify a contract on Etherscan (skips if API key not provided)
async function verify(address: string, args: any[] = []) {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.warn(`Skipping Etherscan verification for ${address} (no API key set).`);
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
    governanceArgIndex !== -1 ? process.argv[governanceArgIndex + 1] : owner.address;

  // Deploy the Deployer contract which orchestrates module deployment
  const Deployer = await ethers.getContractFactory('contracts/v2/Deployer.sol:Deployer');
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log('Deployer deployed at', deployerAddress);

  // Prepare ENS/Identity parameters (using mainnet ENS by default)
  const ids = {
    ens: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', // ENS registry (mainnet)
    nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401', // ENS NameWrapper (mainnet)
    clubRootNode: ethers.namehash('club.agi.eth'),
    agentRootNode: ethers.namehash('agent.agi.eth'),
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };

  // Deploy all modules using the Deployer contract (single transaction)
  const tx = withTax
    ? await deployer.deployDefaults(ids, governance)
    : await deployer.deployDefaultsWithoutTaxPolicy(ids, governance);
  const receipt = await tx.wait();
  // Find the `Deployed` event log emitted by Deployer to get deployed addresses
  const log = receipt.logs.find((l) => l.address === deployerAddress);
  const decoded = deployer.interface.decodeEventLog('Deployed', log!.data, log!.topics);
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

  // Retrieve the ArbitratorCommittee address from the DisputeModule (for verification)
  const disputeContract = await ethers.getContractAt(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule',
    disputeModule,
  );
  const committee = await disputeContract.committee();

  // Verify each deployed contract on Etherscan (if API key is available)
  await verify(deployerAddress); // Deployer has no constructor params
  await verify(stakeManager, [
    ethers.parseUnits('1', AGIALPHA_DECIMALS), // _minStake (default 1 token)
    0, // _employerSlashPct
    100, // _treasurySlashPct
    governance, // _treasury (governance address or burn if zero)
    ethers.ZeroAddress, // _jobRegistry (none at deploy time)
    ethers.ZeroAddress, // _disputeModule (none at deploy time)
    governance, // _timelock (owner/governance address)
  ]);
  await verify(jobRegistry, [
    ethers.ZeroAddress, // _validationModule (none set initially)
    ethers.ZeroAddress, // _stakeManager (none set initially)
    ethers.ZeroAddress, // _reputationEngine (none set initially)
    ethers.ZeroAddress, // _disputeModule (none set initially)
    ethers.ZeroAddress, // _certificateNFT (none set initially)
    ethers.ZeroAddress, // _feePool (none set initially)
    ethers.ZeroAddress, // _taxPolicy (none set initially)
    5, // _feePct (default 5%)
    0, // _jobStake (default 0)
    [stakeManager], // _acknowledgedModules (StakeManager address pre-approved)
  ]);
  await verify(validationModule, [
    jobRegistry,
    stakeManager,
    86400, // _commitWindow (default 1 day)
    86400, // _revealWindow (default 1 day)
    0,
    0,
    [], // _trustedValidators (none)
  ]);
  await verify(reputationEngine, [stakeManager]);
  await verify(disputeModule, [
    jobRegistry,
    0, // _disputeFee (default 1 token if 0)
    0, // _disputeWindow (default 1 day if 0)
    ethers.ZeroAddress, // _committee (none at construction, set later)
  ]);
  await verify(committee, [jobRegistry, disputeModule]);
  await verify(certificateNFT, ['Cert', 'CERT']);
  await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
  await verify(jobRouter, [platformRegistry]);
  await verify(platformIncentives, [stakeManager, platformRegistry, jobRouter]);
  await verify(feePool, [
    stakeManager,
    2, // _burnPct (if 0 provided, defaults internally to 5; using 2% here for example)
    governance, // _treasury (initial treasury address, or zero/burn)
    taxPolicy !== ethers.ZeroAddress ? taxPolicy : ethers.ZeroAddress, // _taxPolicy (address or zero)
  ]);
  await verify(identityRegistry, [
    ids.ens,
    ids.nameWrapper,
    reputationEngine,
    ethers.ZeroHash, // _agentMerkleRoot (none provided)
    ethers.ZeroHash, // _validatorMerkleRoot (none provided)
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
  process.exitCode = 1;
});

