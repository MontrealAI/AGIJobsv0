import { ethers, run, network } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';
import { loadEnsConfig } from '../config';

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

  const { config: ensConfig } = loadEnsConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const roots = ensConfig.roots || {};
  const agentRootNode = roots.agent?.node;
  const clubRootNode = roots.club?.node;
  if (!agentRootNode || !clubRootNode) {
    throw new Error('ENS configuration is missing agent or club root nodes');
  }
  const ids = {
    ens: ensConfig.registry,
    nameWrapper: ensConfig.nameWrapper || ethers.ZeroAddress,
    clubRootNode,
    agentRootNode,
    validatorMerkleRoot: roots.club?.merkleRoot || ethers.ZeroHash,
    agentMerkleRoot: roots.agent?.merkleRoot || ethers.ZeroHash,
  };
  if (!ids.ens) {
    throw new Error('ENS registry address missing from configuration');
  }

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
