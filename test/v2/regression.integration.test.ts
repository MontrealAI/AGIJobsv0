import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';
import { decodeJobMetadata } from '../utils/jobMetadata';
import { readArtifact } from '../utils/artifacts';

enum Role {
  Agent,
  Validator,
  Platform,
}

async function deploySystem() {
  const [owner, employer, agent, v1, moderator] = await ethers.getSigners();

  const artifact = await readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await ethers.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  const ownerSlotValue = ethers.zeroPadValue(owner.address, 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await ethers.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerSlotValue,
  ]);
  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
  const mint = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  for (const s of [employer, agent, v1]) {
    await token.mint(s.address, mint);
  }

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

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
  );
  const identity = await Identity.deploy();
  await identity.setResult(true);

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    1,
    1,
    1,
    5,
    []
  );

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
    moderator.address,
    owner.address
  );
  await dispute.waitForDeployment();
  await dispute.setStakeManager(await stake.getAddress());

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await validation.setJobRegistry(await registry.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await reputation.setCaller(await registry.getAddress(), true);

  return {
    owner,
    employer,
    agent,
    v1,
    moderator,
    token,
    stake,
    validation,
    registry,
    dispute,
    reputation,
    nft,
  };
}

describe('regression scenarios', function () {
  it('reverts when no validators are available', async () => {
    const env = await deploySystem();
    const { employer, agent, token, stake, validation, registry } = env;

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);
    // no validators set
    await validation.setValidatorsPerJob(1);

    const reward = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');
    await registry.connect(agent).applyForJob(1, 'agent', []);

    await validation.selectValidators(1, 1);
    await ethers.provider.send('evm_mine', []);
    await expect(
      validation.connect(employer).selectValidators(1, 0)
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');
  });

  it('prevents validation after stake exhaustion', async () => {
    const env = await deploySystem();
    const { employer, agent, v1, token, stake, validation, registry } = env;

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    for (const s of [agent, v1]) {
      await token.connect(s).approve(await stake.getAddress(), stakeAmount);
      const role = s === agent ? Role.Agent : Role.Validator;
      await stake.connect(s).depositStake(role, stakeAmount);
    }
    await validation.setValidatorPool([v1.address]);
    await validation.setValidatorsPerJob(1);
    await validation.setValidatorSlashingPct(100);

    const reward = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline1 = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline1, specHash, 'ipfs://job1');
    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://good'), 'ipfs://good', 'agent', []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);
    const nonce = await validation.jobNonce(1);
    const salt = ethers.randomBytes(32);
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, false, burnTxHash, salt, specHash]
      )
    );
    await validation.connect(v1).commitValidation(1, commit, 'validator', []);
    await time.increase(2);
    await validation
      .connect(v1)
      .revealValidation(1, false, burnTxHash, salt, 'validator', []);
    await time.increase(2);
    await validation.finalize(1);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    const deadline2 = BigInt((await time.latest()) + 3600);
    await registry
      .connect(employer)
      .createJob(reward, deadline2, specHash, 'ipfs://job2');
    await registry.connect(agent).applyForJob(2, 'agent', []);
    await validation.selectValidators(2, 1);
    await ethers.provider.send('evm_mine', []);
    await expect(
      validation.connect(employer).selectValidators(2, 0)
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');
  });

  it('supports validation module replacement', async () => {
    const env = await deploySystem();
    const {
      owner,
      employer,
      agent,
      token,
      stake,
      validation,
      registry,
      dispute,
      reputation,
      nft,
    } = env;

    const Stub = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const stub = await Stub.deploy();
    await stub.setJobRegistry(await registry.getAddress());

    await registry
      .connect(owner)
      .setModules(
        await stub.getAddress(),
        await stake.getAddress(),
        await reputation.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress(),
        ethers.ZeroAddress,
        []
      );

    expect(await registry.validationModule()).to.equal(await stub.getAddress());

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    for (const s of [agent]) {
      await token.connect(s).approve(await stake.getAddress(), stakeAmount);
      await stake.connect(s).depositStake(Role.Agent, stakeAmount);
    }

    const reward = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');
    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://res'), 'ipfs://res', 'agent', []);
    await stub.setResult(true);
    await stub.finalize(1);

    {
      const job = await registry.jobs(1);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6);
    }
  });
});
