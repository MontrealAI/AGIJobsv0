const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');
const { enrichJob } = require('../utils/jobMetadata');

async function deploySystem() {
  const [owner, employer, agent] = await ethers.getSigners();
  const artifact = await readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
  await token.mint(
    employer.address,
    ethers.parseUnits('1000', AGIALPHA_DECIMALS)
  );
  await token.mint(agent.address, ethers.parseUnits('1000', AGIALPHA_DECIMALS));
  await token.mint(owner.address, ethers.parseUnits('1000', AGIALPHA_DECIMALS));

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );

  await stake.setMinStake(1);

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
  );
  const identity = await Identity.deploy();
  await identity.setReputationEngine(await reputation.getAddress());

  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

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
    owner.address
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    owner.address,
    owner.address
  );

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

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
  await reputation.setCaller(await registry.getAddress(), true);
  await stake.setFeePool(await feePool.getAddress());

  return {
    owner,
    employer,
    agent,
    token,
    stake,
    reputation,
    validation,
    nft,
    registry,
    dispute,
    feePool,
  };
}

describe('Mid-job module replacement fuzz', function () {
  it('preserves job state across random upgrades', async function () {
    for (let i = 0; i < 5; i++) {
      const env = await deploySystem();
      const {
        owner,
        employer,
        agent,
        token,
        stake,
        reputation,
        validation,
        nft,
        registry,
        dispute,
        feePool,
      } = env;

      const reward = ethers.parseUnits(
        String(10 + Math.floor(Math.random() * 90)),
        AGIALPHA_DECIMALS
      );
      const result = Math.random() > 0.5;
      const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
      await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
      await stake.connect(agent).depositStake(0, stakeAmount);
      await token
        .connect(employer)
        .approve(await stake.getAddress(), reward + (reward * 5n) / 100n);
      const deadline = BigInt((await time.latest()) + 3600);
      const specHash = ethers.id('spec');
      await registry
        .connect(employer)
        .createJob(reward, deadline, specHash, 'ipfs://job');
      await registry.connect(agent).applyForJob(1, 'agent', []);
      const hash = ethers.id('ipfs://result');
      await registry
        .connect(agent)
        .submit(1, hash, 'ipfs://result', 'agent', []);

      const Validation = await ethers.getContractFactory(
        'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
      );
      const newValidation = await Validation.deploy();
      await newValidation.setJobRegistry(await registry.getAddress());
      await registry
        .connect(owner)
        .setModules(
          await newValidation.getAddress(),
          await stake.getAddress(),
          await reputation.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress(),
          await feePool.getAddress(),
          []
        );
      await newValidation.setResult(result);
      await newValidation.finalize(1);
      if (result) {
        const burnTxHash = ethers.ZeroHash;
        const burnAmt = (reward * 5n) / 100n;
        await registry
          .connect(employer)
          .submitBurnReceipt(1, burnTxHash, burnAmt, 0);
        await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
        await registry.connect(employer).finalize(1);
      }
      const job = enrichJob(await registry.jobs(1));
      expect(job.state).to.equal(result ? 6 : 5);
      expect(job.success).to.equal(result);
    }
  });
});
