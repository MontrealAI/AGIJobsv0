'use strict';
// Disposable EVM only: fixture tokens, permissive identity and validation mocks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ethers, artifacts, network } = require('hardhat');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { address: AGIALPHA } = require('../../config/agialpha.json');
async function main() {
  const rpc = new URL(network.config.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname))
    throw new Error('Loopback RPC only');
  if (
    network.name !== 'localhost' ||
    (await ethers.provider.getNetwork()).chainId !== 31337n
  )
    throw new Error('Disposable localhost chain 31337 only');
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    policy,
    identity,
    feePool,
    audit;
  let owner, employer, agent, treasury, auditor;
  const reward = 100,
    stake = 200;
  const disputeFee = 1_000_000_000_000_000_000n;

  [owner, employer, agent, treasury, auditor] = await ethers.getSigners();
  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  token = await ethers.getContractAt(
    'contracts/test/MockERC20.sol:MockERC20',
    AGIALPHA
  );
  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  stakeManager = await StakeManager.deploy(
    0,
    100,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address,
    await deployImplementations('StakeManager', StakeManager.runner)
  );
  await stakeManager.connect(owner).setMinStake(1);
  await stakeManager.connect(owner).setSlashingPercentages(100, 0);
  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  validation = await Validation.deploy();
  const Rep = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  rep = await Rep.deploy(await stakeManager.getAddress());
  const NFT = await ethers.getContractFactory(
    'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
  );
  nft = await NFT.deploy('Cert', 'CERT');
  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  feePool = await FeePool.deploy(
    await stakeManager.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  registry = await Registry.deploy(
    ethers.ZeroAddress,
    await stakeManager.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address,
    await deployImplementations('JobRegistry', Registry.runner)
  );
  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress,
    owner.address
  );
  await dispute.connect(owner).setDisputeFee(disputeFee);
  const Policy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  policy = await Policy.deploy('ipfs://policy', 'ack');

  await registry
    .connect(owner)
    .setModules(
      await validation.getAddress(),
      await stakeManager.getAddress(),
      await rep.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
  await validation.setJobRegistry(await registry.getAddress());
  // The 200-unit deposit is admission collateral; this fixture uses 10% per-job locks.
  await registry.connect(owner).setJobStakeBps(1000);
  await registry.connect(owner).setMaxJobReward(1000000);
  await registry.connect(owner).setJobDurationLimit(86400);
  await registry.connect(owner).setFeePct(0);
  await registry.connect(owner).setValidatorRewardPct(0);
  await nft.connect(owner).setJobRegistry(await registry.getAddress());
  await rep
    .connect(owner)
    .setAuthorizedCaller(await registry.getAddress(), true);
  await rep.connect(owner).setThreshold(0);
  await stakeManager.connect(owner).setJobRegistry(await registry.getAddress());
  await stakeManager
    .connect(owner)
    .setValidationModule(await validation.getAddress());
  await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
  await nft.connect(owner).transferOwnership(await registry.getAddress());
  await registry.connect(owner).setTaxPolicy(await policy.getAddress());
  await policy
    .connect(owner)
    .setAcknowledger(await registry.getAddress(), true);
  await policy.connect(owner).acknowledge();
  await policy.connect(employer).acknowledge();
  await policy.connect(agent).acknowledge();

  await token.mint(employer.address, 100000);
  await token.mint(agent.address, disputeFee + 1000n);

  await token
    .connect(agent)
    .approve(await stakeManager.getAddress(), BigInt(stake) + disputeFee);
  await stakeManager.connect(agent).depositStake(0, stake);
  await stakeManager
    .connect(owner)
    .setDisputeModule(await dispute.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
  );
  identity = await Identity.deploy();
  await registry
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  const workSpec = fs.readFileSync(
    process.env.ALPHA_WORK_SPEC ||
      path.join(__dirname, 'fixtures/work-spec.json')
  );
  const specHash =
    '0x' + crypto.createHash('sha256').update(workSpec).digest('hex');
  await token.connect(employer).approve(await stakeManager.getAddress(), 1000);
  const block = await ethers.provider.getBlock('latest');
  const created = await registry
    .connect(employer)
    .createJob(
      reward,
      block.timestamp + 86400,
      specHash,
      'fixture://alpha/work-spec'
    );
  await created.wait();
  const assigned = await registry.connect(agent).applyForJob(1, 'agent', []);
  const receipt = await assigned.wait();
  const implementations = await registry.implementationModules();
  const addresses = {
    registry: await registry.getAddress(),
    token: AGIALPHA,
    stakeManager: await stakeManager.getAddress(),
    validationModule: await validation.getAddress(),
    identityRegistry: await identity.getAddress(),
    configuration: implementations[0],
    lifecycle: implementations[1],
    settlement: implementations[2],
  };
  const codePins = {};
  for (const [name, address] of Object.entries(addresses))
    codePins[name] = ethers.keccak256(await ethers.provider.getCode(address));
  const result = {
    schema: 'agijobsv0/local-alpha-fixture/1',
    mode: 'local-fixture',
    rpcUrl: network.config.url,
    chainId: 31337,
    backend: 'agijobsv0-jobregistry-v2',
    addresses,
    codePins,
    jobId: '1',
    worker: agent.address,
    employer: employer.address,
    assignmentTransactionHash: assigned.hash,
    assignmentBlockNumber: receipt.blockNumber,
    specHash,
    productionApproved: false,
    limitations: [
      'Mock token installed at configured AGIALPHA address',
      'Permissive identity mock',
      'Operator-controlled validation stub',
      'Not mainnet or economic assurance',
    ],
  };
  fs.writeFileSync(
    process.env.ALPHA_FIXTURE_OUTPUT || '/tmp/agijobsv0-alpha-fixture.json',
    JSON.stringify(result, null, 2) + '\n'
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
