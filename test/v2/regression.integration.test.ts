import { deployImplementations } from '../../scripts/deploy/implementations.cjs';
import { expect } from 'chai';
import { artifacts, ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';
import { decodeJobMetadata } from '../utils/jobMetadata';

enum Role {
  Agent,
  Validator,
  Platform,
}

async function deploySystem() {
  const [owner, employer, agent, v1, moderator, v2, v3, v4] =
    await ethers.getSigners();

  const artifact = await artifacts.readArtifact(
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
  for (const s of [employer, agent, v1, v2, v3, v4]) {
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
    owner.address,
    await deployImplementations('StakeManager', Stake.runner)
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
    30,
    30,
    3,
    5,
    [],
    await deployImplementations('ValidationModule', Validation.runner)
  );

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

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
    owner.address,
    await deployImplementations('JobRegistry', Registry.runner)
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress,
    owner.address
  );
  await dispute.setModerator(moderator.address, 1);
  await dispute.setDisputeWindow(0);
  await dispute.setStakeManager(await stake.getAddress());
  await dispute.waitForDeployment();

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await validation.setJobRegistry(await registry.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await validation.setValidatorSubdomains(
    [v1, v2, v3, v4].map((v) => v.address),
    ['validator', 'validator', 'validator', 'validator']
  );
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    await feePool.getAddress(),
    []
  );
  await reputation.setCaller(await registry.getAddress(), true);

  await registry.setFeePct(0);
  await registry.setValidatorRewardPct(0);
  expect(await registry.jobStakeBps()).to.equal(1000);
  await stake.setBurnPct(0);
  await stake.setSlashingPercentages(100, 0);
  await stake.setValidationModule(await validation.getAddress());
  await registry.setIdentityRegistry(await identity.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  // setCode skips constructors, and escrow/marketplace contracts must accept token terms.
  for (const module of [stake, feePool, nft]) {
    await token.mint(await module.getAddress(), 0);
  }

  return {
    feePool,
    validators: [v1, v2, v3, v4],
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

async function validateRound(
  env: any,
  approvals: boolean[],
  reveal = approvals.map(() => true)
) {
  const { validation, registry, employer, validators } = env;
  // Submission seeds the round; finalize selection after the future block is mined.
  await ethers.provider.send('evm_mine', []);
  await validation.connect(employer).selectValidators(1, 0);
  expect(Array.from(await validation.validators(1))).to.have.members(
    validators.map((v: any) => v.address)
  );
  const nonce = await validation.jobNonce(1);
  const specHash = await registry.getSpecHash(1);
  const burnTxHash = ethers.id('burn');
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = await validation.DOMAIN_SEPARATOR();
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const salts = validators.map((v: any) => ethers.id(`salt:${v.address}`));
  for (let i = 0; i < validators.length; ++i) {
    const outcome = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bool', 'bytes32'],
        [nonce, specHash, approvals[i], burnTxHash]
      )
    );
    const commitment = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
        [1, outcome, salts[i], validators[i].address, chainId, domain]
      )
    );
    await validation
      .connect(validators[i])
      .commitValidation(1, commitment, 'validator', []);
  }
  const round = await validation.rounds(1);
  await time.increaseTo(round.commitDeadline + 1n);
  for (let i = 0; i < validators.length; ++i) {
    if (reveal[i]) {
      await validation
        .connect(validators[i])
        .revealValidation(
          1,
          approvals[i],
          burnTxHash,
          salts[i],
          'validator',
          []
        );
    }
  }
  await time.increaseTo(round.revealDeadline + 1n);
  await validation.finalize(1);
}

describe('regression scenarios', function () {
  it('reverts when no validators are available', async () => {
    const env = await deploySystem();
    const { employer, agent, token, stake, validation, registry } = env;

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);
    // no validators set
    await validation.setValidatorsPerJob(3);

    const reward = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');
    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
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
    for (const s of [agent, ...env.validators]) {
      await token.connect(s).approve(await stake.getAddress(), stakeAmount);
      const role = s === agent ? Role.Agent : Role.Validator;
      await stake.connect(s).depositStake(role, stakeAmount);
    }
    await validation.setValidatorPool(env.validators.map((v) => v.address));
    await validation.setValidatorsPerJob(4);
    await validation.setValidatorSlashingPct(100);

    const reward = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline1 = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline1, specHash, 'ipfs://job1');
    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://good'), 'ipfs://good', 'agent', []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);
    // Three approvals meet quorum; the dissenting validator loses its full stake.
    await validateRound(env, [false, true, true, true]);
    expect(await stake.stakeOf(v1.address, Role.Validator)).to.equal(0);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline2 = BigInt((await time.latest()) + 3600);
    await registry
      .connect(employer)
      .createJob(reward, deadline2, specHash, 'ipfs://job2');
    expect((await registry.jobs(2)).stake).to.equal(reward / 10n);
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
      feePool,
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
        await feePool.getAddress(),
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
    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://res'), 'ipfs://res', 'agent', []);
    await stub.setResult(true);
    await stub.finalize(1);
    await registry.connect(employer).finalize(1);

    {
      const job = await registry.jobs(1);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6);
    }
  });
});
