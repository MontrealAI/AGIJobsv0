import { ethers, run } from 'hardhat';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';

// Mainnet ENS and NameWrapper configuration
// ENS registry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
// NameWrapper: 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
// agent.agi.eth node: 0x2c9c6189b2e92da4d0407e9deb38ff6870729ad063af7e8576cb7b7898c88e2d
// club.agi.eth node: 0x39eb848f88bdfb0a6371096249dd451f56859dfe2cd3ddeab1e26d5bb68ede16
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ROOT_NODE = ethers.namehash('agent.agi.eth');
const CLUB_ROOT_NODE = ethers.namehash('club.agi.eth');

// rudimentary CLI flag parser
function parseArgs() {
  const argv = process.argv.slice(2);
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

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
  const [deployer] = await ethers.getSigners();
  const args = parseArgs();

  const governance =
    typeof args.governance === 'string' ? args.governance : deployer.address;
  const governanceSigner = await ethers.getSigner(governance);

  const token = await ethers.getContractAt(
    ['function decimals() view returns (uint8)'],
    AGIALPHA
  );
  const decimals = Number(await token.decimals());
  if (decimals !== 18) {
    throw new Error(`AGIALPHA token must have 18 decimals, got ${decimals}`);
  }

  // -------------------------------------------------------------------------
  // staking token: fixed to canonical AGIALPHA address
  // -------------------------------------------------------------------------

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const treasury =
    typeof args.treasury === 'string' ? args.treasury : ethers.ZeroAddress;
  const stake = await Stake.deploy(
    0,
    0,
    0,
    treasury,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance
  );
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    governance
  );
  await registry.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const tax = await TaxPolicy.deploy(
    'ipfs://policy',
    'All taxes on participants; contract and owner exempt'
  );
  await tax.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    60,
    60,
    1,
    3,
    []
  );
  await validation.waitForDeployment();

  // Single ReputationEngine implementation deployed from contracts/v2/ReputationEngine.sol
  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy();
  await reputation.waitForDeployment();

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const identity = await Identity.deploy(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await identity.waitForDeployment();
  await identity.configureMainnet();

  const Attestation = await ethers.getContractFactory(
    'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
  );
  const attestation = await Attestation.deploy(ENS_REGISTRY, NAME_WRAPPER);
  await attestation.waitForDeployment();
  await identity.setAttestationRegistry(await attestation.getAddress());
  await registry
    .connect(governanceSigner)
    .setIdentityRegistry(await identity.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());

  const NFT = await ethers.getContractFactory(
    'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');
  await nft.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const appealFee = ethers.parseUnits(
    typeof args.appealFee === 'string' ? args.appealFee : '0',
    AGIALPHA_DECIMALS
  );
  const disputeWindow =
    typeof args.disputeWindow === 'string' ? Number(args.disputeWindow) : 0;
  const moderator =
    typeof args.moderator === 'string' ? args.moderator : ethers.ZeroAddress;
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    appealFee,
    disputeWindow,
    ethers.ZeroAddress
  );
  await dispute.waitForDeployment();
  const Committee = await ethers.getContractFactory(
    'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee'
  );
  const committee = await Committee.deploy(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await committee.waitForDeployment();
  await dispute.setCommittee(await committee.getAddress());

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const burnPct = typeof args.burnPct === 'string' ? parseInt(args.burnPct) : 0;
    const feePool = await FeePool.deploy(
      await stake.getAddress(),
      burnPct,
      treasury,
      await tax.getAddress()
    );
    await feePool.waitForDeployment();

    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermostat = await Thermostat.deploy(
      ethers.parseUnits('1', 18),
      1n,
      ethers.parseUnits('2', 18)
    );
    await thermostat.waitForDeployment();

    const EnergyOracle = await ethers.getContractFactory(
      'contracts/v2/EnergyOracle.sol:EnergyOracle'
    );
    const energyOracle = await EnergyOracle.deploy();
    await energyOracle.waitForDeployment();

    const RewardEngine = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    const rewardEngine = await RewardEngine.deploy(
      await thermostat.getAddress(),
      await feePool.getAddress(),
      await reputation.getAddress(),
      await energyOracle.getAddress()
    );
    await rewardEngine.waitForDeployment();

    await thermostat.transferOwnership(governance);
    await rewardEngine.transferOwnership(governance);

    const PlatformRegistry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
  const minPlatformStake = ethers.parseUnits(
    typeof args.minPlatformStake === 'string' ? args.minPlatformStake : '1000',
    AGIALPHA_DECIMALS
  );
  const platformRegistry = await PlatformRegistry.deploy(
    await stake.getAddress(),
    await reputation.getAddress(),
    minPlatformStake
  );
  await platformRegistry.waitForDeployment();

  const JobRouter = await ethers.getContractFactory(
    'contracts/v2/modules/JobRouter.sol:JobRouter'
  );
  const jobRouter = await JobRouter.deploy(await platformRegistry.getAddress());
  await jobRouter.waitForDeployment();

  const PlatformIncentives = await ethers.getContractFactory(
    'contracts/v2/PlatformIncentives.sol:PlatformIncentives'
  );
  const incentives = await PlatformIncentives.deploy(
    await stake.getAddress(),
    await platformRegistry.getAddress(),
    await jobRouter.getAddress()
  );
  await incentives.waitForDeployment();

  const Installer = await ethers.getContractFactory(
    'contracts/v2/ModuleInstaller.sol:ModuleInstaller'
  );
  const installer = await Installer.deploy();
  await installer.waitForDeployment();

  await registry.setGovernance(await installer.getAddress());
  await stake.setGovernance(await installer.getAddress());
  await validation.transferOwnership(await installer.getAddress());
  await reputation.transferOwnership(await installer.getAddress());
  await dispute.transferOwnership(await installer.getAddress());
  await nft.transferOwnership(await installer.getAddress());
  await incentives.transferOwnership(await installer.getAddress());
  await platformRegistry.transferOwnership(await installer.getAddress());
  await jobRouter.transferOwnership(await installer.getAddress());
  await feePool.transferOwnership(await installer.getAddress());
  await tax.transferOwnership(await installer.getAddress());
  await identity.transferOwnership(await installer.getAddress());

  await installer
    .connect(governanceSigner)
    .initialize(
      await registry.getAddress(),
      await stake.getAddress(),
      await validation.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await incentives.getAddress(),
      await platformRegistry.getAddress(),
      await jobRouter.getAddress(),
      await feePool.getAddress(),
      await tax.getAddress(),
      await identity.getAddress(),
      CLUB_ROOT_NODE,
      AGENT_ROOT_NODE,
      ethers.ZeroHash,
      ethers.ZeroHash,
      []
    );

  const feePct = typeof args.feePct === 'string' ? Number(args.feePct) : 5;
  await registry.connect(governanceSigner).setFeePct(feePct);

  const burnPct = typeof args.burnPct === 'string' ? Number(args.burnPct) : 0;
  await feePool.connect(governanceSigner).setBurnPct(burnPct);

  const minStake = ethers.parseUnits(
    typeof args.minStake === 'string' ? args.minStake : '0',
    AGIALPHA_DECIMALS
  );
  await stake.connect(governanceSigner).setMinStake(minStake);

  const ensureContract = async (addr: string, name: string) => {
    if ((await ethers.provider.getCode(addr)) === '0x') {
      throw new Error(`${name} must be a deployed contract`);
    }
  };

  await Promise.all([
    ensureContract(await registry.getAddress(), 'JobRegistry'),
    ensureContract(await stake.getAddress(), 'StakeManager'),
    ensureContract(await validation.getAddress(), 'ValidationModule'),
    ensureContract(await dispute.getAddress(), 'DisputeModule'),
    ensureContract(await platformRegistry.getAddress(), 'PlatformRegistry'),
    ensureContract(await feePool.getAddress(), 'FeePool'),
    ensureContract(await reputation.getAddress(), 'ReputationEngine'),
    ensureContract(await attestation.getAddress(), 'AttestationRegistry'),
  ]);

  const SystemPause = await ethers.getContractFactory(
    'contracts/v2/SystemPause.sol:SystemPause'
  );
  const pause = await SystemPause.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    await validation.getAddress(),
    await dispute.getAddress(),
    await platformRegistry.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress(),
    await committee.getAddress(),
    governance
  );
  await pause.waitForDeployment();
  await pause
    .connect(governanceSigner)
    .setModules(
      await registry.getAddress(),
      await stake.getAddress(),
      await validation.getAddress(),
      await dispute.getAddress(),
      await platformRegistry.getAddress(),
      await feePool.getAddress(),
      await reputation.getAddress(),
      await committee.getAddress()
    );
  await stake.connect(governanceSigner).setGovernance(await pause.getAddress());
  await registry
    .connect(governanceSigner)
    .setGovernance(await pause.getAddress());
  await validation
    .connect(governanceSigner)
    .transferOwnership(await pause.getAddress());
  await dispute
    .connect(governanceSigner)
    .transferOwnership(await pause.getAddress());
  await platformRegistry
    .connect(governanceSigner)
    .transferOwnership(await pause.getAddress());
  await feePool
    .connect(governanceSigner)
    .transferOwnership(await pause.getAddress());
  await reputation
    .connect(governanceSigner)
    .transferOwnership(await pause.getAddress());
  await committee.transferOwnership(await pause.getAddress());
  await attestation.transferOwnership(await pause.getAddress());

  console.log('JobRegistry deployed to:', await registry.getAddress());
  console.log('ValidationModule:', await validation.getAddress());
  console.log('StakeManager:', await stake.getAddress());
  console.log('ReputationEngine:', await reputation.getAddress());
  console.log('AttestationRegistry:', await attestation.getAddress());
  console.log('IdentityRegistry:', await identity.getAddress());
  console.log('SystemPause:', await pause.getAddress());
  let activeDispute = await dispute.getAddress();
  if (typeof args.arbitrator === 'string') {
    const Kleros = await ethers.getContractFactory(
      'contracts/v2/modules/KlerosDisputeModule.sol:KlerosDisputeModule'
    );
    const kleros = await Kleros.deploy(
      await registry.getAddress(),
      args.arbitrator,
      governance
    );
    await kleros.waitForDeployment();
    await registry
      .connect(governanceSigner)
      .setDisputeModule(await kleros.getAddress());
    activeDispute = await kleros.getAddress();
    console.log('KlerosDisputeModule:', activeDispute);
  } else {
    console.log('DisputeModule:', activeDispute);
  }
  console.log('CertificateNFT:', await nft.getAddress());
    console.log('TaxPolicy:', await tax.getAddress());
    console.log('FeePool:', await feePool.getAddress());
    console.log('PlatformRegistry:', await platformRegistry.getAddress());
    console.log('JobRouter:', await jobRouter.getAddress());
    console.log('PlatformIncentives:', await incentives.getAddress());
    console.log('EnergyOracle:', await energyOracle.getAddress());
    console.log('Thermostat:', await thermostat.getAddress());
    console.log('RewardEngineMB:', await rewardEngine.getAddress());

    const addresses = {
    token: AGIALPHA,
    stakeManager: await stake.getAddress(),
    jobRegistry: await registry.getAddress(),
    validationModule: await validation.getAddress(),
    reputationEngine: await reputation.getAddress(),
    disputeModule: activeDispute,
    certificateNFT: await nft.getAddress(),
    taxPolicy: await tax.getAddress(),
    feePool: await feePool.getAddress(),
      platformRegistry: await platformRegistry.getAddress(),
      jobRouter: await jobRouter.getAddress(),
      platformIncentives: await incentives.getAddress(),
      energyOracle: await energyOracle.getAddress(),
      thermostat: await thermostat.getAddress(),
      rewardEngineMB: await rewardEngine.getAddress(),
      identityRegistry: await identity.getAddress(),
      attestationRegistry: await attestation.getAddress(),
      systemPause: await pause.getAddress(),
    };

  writeFileSync(
    join(__dirname, '..', '..', 'docs', 'deployment-addresses.json'),
    JSON.stringify(addresses, null, 2)
  );

  await verify(await stake.getAddress(), [
    0,
    0,
    0,
    treasury,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    governance,
  ]);
  await verify(await registry.getAddress(), [
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    governance,
  ]);
  await verify(await validation.getAddress(), [
    await registry.getAddress(),
    await stake.getAddress(),
    governance,
  ]);
  await verify(await reputation.getAddress(), [governance]);
  await verify(await dispute.getAddress(), [
    await registry.getAddress(),
    appealFee,
    disputeWindow,
    moderator,
    governance,
  ]);
  await verify(await attestation.getAddress(), [ENS_REGISTRY, NAME_WRAPPER]);
  await verify(await identity.getAddress(), [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash,
  ]);
  if (typeof args.arbitrator === 'string') {
    await verify(activeDispute, [
      await registry.getAddress(),
      args.arbitrator,
      governance,
    ]);
  }
  await verify(await nft.getAddress(), ['Cert', 'CERT', governance]);
  await verify(await tax.getAddress(), [
    'ipfs://policy',
    'All taxes on participants; contract and owner exempt',
  ]);
  await verify(await feePool.getAddress(), [
    await stake.getAddress(),
    burnPct,
    treasury,
  ]);
  await verify(await platformRegistry.getAddress(), [
    await stake.getAddress(),
    await reputation.getAddress(),
    minPlatformStake,
    governance,
  ]);
  await verify(await jobRouter.getAddress(), [
    await platformRegistry.getAddress(),
    governance,
  ]);
    await verify(await incentives.getAddress(), [
      await stake.getAddress(),
      await platformRegistry.getAddress(),
      await jobRouter.getAddress(),
      governance,
    ]);
    await verify(await energyOracle.getAddress(), []);
    await verify(await thermostat.getAddress(), [
      ethers.parseUnits('1', 18),
      1n,
      ethers.parseUnits('2', 18),
    ]);
    await verify(await rewardEngine.getAddress(), [
      await thermostat.getAddress(),
      await feePool.getAddress(),
      await reputation.getAddress(),
      await energyOracle.getAddress(),
    ]);
    await verify(await pause.getAddress(), [
      await registry.getAddress(),
      await stake.getAddress(),
      await validation.getAddress(),
    await dispute.getAddress(),
    await platformRegistry.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress(),
    governance,
  ]);
  await verify(await installer.getAddress(), []);

  await incentives.connect(governanceSigner).stakeAndActivate(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
