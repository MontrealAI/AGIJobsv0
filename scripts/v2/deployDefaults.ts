import { ethers, run } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';

async function verify(address: string, args: any[] = []) {
  try {
    await run('verify:verify', {
      address,
      constructorArguments: args,
    });
  } catch (err) {
    console.error(`verification failed for ${address}`, err);
  }
}

async function main() {
  const [owner] = await ethers.getSigners();
  const args = process.argv.slice(2);
  const withTax = !args.includes('--no-tax');
  const governanceArgIndex = args.indexOf('--governance');
  const governance =
    governanceArgIndex !== -1 ? args[governanceArgIndex + 1] : owner.address;

  const feeArgIndex = args.indexOf('--fee');
  const burnArgIndex = args.indexOf('--burn');
  const feePct = feeArgIndex !== -1 ? Number(args[feeArgIndex + 1]) : 5;
  const burnPct = burnArgIndex !== -1 ? Number(args[burnArgIndex + 1]) : 5;
  const customEcon = feeArgIndex !== -1 || burnArgIndex !== -1;

  const econ = {
    feePct: feeArgIndex !== -1 ? feePct : 0,
    burnPct: burnArgIndex !== -1 ? burnPct : 0,
    employerSlashPct: 0,
    treasurySlashPct: 0,
    commitWindow: 0,
    revealWindow: 0,
    minStake: 0,
    jobStake: 0,
  };

  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log('Deployer', deployerAddress);

  const ids = {
    ens: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
    clubRootNode: ethers.namehash('club.agi.eth'),
    agentRootNode: ethers.namehash('agent.agi.eth'),
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };

  const tx = withTax
    ? customEcon
      ? await deployer.deploy(econ, ids, governance)
      : await deployer.deployDefaults(ids, governance)
    : customEcon
    ? await deployer.deployWithoutTaxPolicy(econ, ids, governance)
    : await deployer.deployDefaultsWithoutTaxPolicy(ids, governance);
  const receipt = await tx.wait();
  const log = receipt.logs.find((l) => l.address === deployerAddress)!;
  const decoded = deployer.interface.decodeEventLog(
    'Deployed',
    log.data,
    log.topics
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
    feePct,
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
  await verify(reputationEngine);
  await verify(disputeModule, [jobRegistry, 0, 0, governance]);
  await verify(certificateNFT, ['Cert', 'CERT']);
  await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
  await verify(jobRouter, [platformRegistry]);
  await verify(platformIncentives, [stakeManager, platformRegistry, jobRouter]);
  await verify(feePool, [
    stakeManager,
    burnPct,
    ethers.ZeroAddress,
    withTax ? taxPolicy : ethers.ZeroAddress,
  ]);
  await verify(identityRegistry, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
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
    governance,
  ]);
  if (withTax) {
    await verify(taxPolicy, [
      'ipfs://policy',
      'All taxes on participants; contract and owner exempt',
    ]);
  }

  console.log('Deployment complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
