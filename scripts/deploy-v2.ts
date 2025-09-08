import { ethers } from 'hardhat';

// Mainnet ENS registry and NameWrapper addresses
// ENS registry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
// NameWrapper: 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';

async function main() {
  const [deployer] = await ethers.getSigners();

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    0,
    0,
    deployer.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    deployer.address
  );
  await stake.waitForDeployment();

  // Deploy the sole ReputationEngine implementation
  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    deployer.address
  );
  await registry.waitForDeployment();

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

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
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
  await dispute.setStakeManager(await stake.getAddress());

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    deployer.address
  );
  await feePool.waitForDeployment();

  const PlatformRegistry = await ethers.getContractFactory(
    'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
  );
  const platformRegistry = await PlatformRegistry.deploy(
    await stake.getAddress(),
    await reputation.getAddress(),
    0
  );
  await platformRegistry.waitForDeployment();

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

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
    deployer.address
  );
  await pause.waitForDeployment();
  await pause.setModules(
    await registry.getAddress(),
    await stake.getAddress(),
    await validation.getAddress(),
    await dispute.getAddress(),
    await platformRegistry.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress(),
    await committee.getAddress()
  );
  await stake.setGovernance(await pause.getAddress());
  await registry.setGovernance(await pause.getAddress());
  await validation.transferOwnership(await pause.getAddress());
  await dispute.transferOwnership(await pause.getAddress());
  await platformRegistry.transferOwnership(await pause.getAddress());
  await feePool.transferOwnership(await pause.getAddress());
  await reputation.transferOwnership(await pause.getAddress());
  await committee.transferOwnership(await pause.getAddress());
  await nft.transferOwnership(await pause.getAddress());
  await identity.transferOwnership(await pause.getAddress());
  await attestation.transferOwnership(await pause.getAddress());

  console.log('StakeManager:', await stake.getAddress());
  console.log('ReputationEngine:', await reputation.getAddress());
  console.log('IdentityRegistry:', await identity.getAddress());
  console.log('AttestationRegistry:', await attestation.getAddress());
  console.log('JobRegistry:', await registry.getAddress());
  console.log('DisputeModule:', await dispute.getAddress());
  console.log('CertificateNFT:', await nft.getAddress());
  console.log('SystemPause:', await pause.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
