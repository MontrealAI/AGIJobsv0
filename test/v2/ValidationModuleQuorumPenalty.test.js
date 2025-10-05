const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

const { AGIALPHA } = require('../../scripts/constants');

const Role = {
  Agent: 0,
  Validator: 1,
  Platform: 2,
};

function typedCommit(
  jobId,
  nonce,
  validator,
  approve,
  burnTxHash,
  salt,
  specHash,
  domain,
  chainId
) {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const outcomeHash = ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );
  return ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domain]
    )
  );
}

async function advance(seconds) {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
}

describe('ValidationModule quorum penalties', function () {
  const COMMIT_WINDOW = 60;
  const REVEAL_WINDOW = 60;
  const STAKE_AMOUNT = ethers.parseEther('1000');

  let owner;
  let employer;
  let agent;
  let validators;
  let token;
  let stakeManager;
  let validation;
  let jobRegistry;
  let identity;

  beforeEach(async function () {
    [owner, employer, agent, ...validators] = await ethers.getSigners();
    validators = validators.slice(0, 3);

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const totalSupply = STAKE_AMOUNT * BigInt(validators.length);
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(totalSupply, 32),
    ]);

    for (const signer of [...validators, employer]) {
      const balanceSlot = ethers.keccak256(
        abi.encode(['address', 'uint256'], [signer.address, 0])
      );
      const ackSlot = ethers.keccak256(
        abi.encode(['address', 'uint256'], [signer.address, 6])
      );
      const balance = validators.includes(signer) ? STAKE_AMOUNT : 0n;
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balanceSlot,
        ethers.toBeHex(balance, 32),
      ]);
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const JobRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    jobRegistry = await JobRegistry.deploy();
    await jobRegistry.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      ethers.parseEther('1'),
      100,
      0,
      ethers.ZeroAddress,
      await jobRegistry.getAddress(),
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.waitForDeployment();

    const stakeAckSlot = ethers.keccak256(
      abi.encode(['address', 'uint256'], [await stakeManager.getAddress(), 6])
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    await jobRegistry.setStakeManager(await stakeManager.getAddress());

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      COMMIT_WINDOW,
      REVEAL_WINDOW,
      3,
      3,
      []
    );
    await validation.waitForDeployment();

    await jobRegistry.setValidationModule(await validation.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());

    for (const val of validators) {
      await identity.addAdditionalValidator(val.address);
    }

    await validation
      .connect(owner)
      .setValidatorPool(validators.map((v) => v.address));
    await validation.connect(owner).setNonRevealPenalty(100, 10);
    await validation.connect(owner).setRevealQuorum(100, 3);

    for (const signer of validators) {
      await token.connect(signer).approve(await stakeManager.getAddress(), STAKE_AMOUNT);
      await stakeManager
        .connect(signer)
        .depositStake(Role.Validator, STAKE_AMOUNT);
    }

    const Status = {
      Submitted: 3,
    };

    await jobRegistry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: Status.Submitted,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });
  });

  it('slashes and redistributes when quorum fails', async function () {
    const jobId = 1;
    const [v1, v2, v3] = validators;
    const burnTxHash = ethers.ZeroHash;
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));

    await validation.selectValidators(jobId, 1);
    await validation.connect(v1).selectValidators(jobId, 2);
    await network.provider.send('evm_mine');
    await validation.connect(v1).selectValidators(jobId, 0);

    const domain = await validation.DOMAIN_SEPARATOR();
    const { chainId } = await ethers.provider.getNetwork();
    const specHash = await jobRegistry.getSpecHash(jobId);
    const nonce = await validation.jobNonce(jobId);

    const commitHash = typedCommit(
      jobId,
      nonce,
      v1.address,
      true,
      burnTxHash,
      salt,
      specHash,
      domain,
      chainId
    );

    await validation.connect(v1).commitValidation(jobId, commitHash, 'validator', []);

    await advance(COMMIT_WINDOW + 1);

    await validation
      .connect(v1)
      .revealValidation(jobId, true, burnTxHash, salt, 'validator', []);

    await advance(REVEAL_WINDOW + 1);
    const grace = await validation.forceFinalizeGrace();
    await advance(Number(grace) + 1);

    const penalty = (STAKE_AMOUNT * 100n) / 10_000n;
    await expect(validation.forceFinalize(jobId))
      .to.emit(validation, 'ValidationQuorumFailed')
      .withArgs(jobId, 1, 3);

    const v1Stake = await stakeManager.stakes(v1.address, Role.Validator);
    const v2Stake = await stakeManager.stakes(v2.address, Role.Validator);
    const v3Stake = await stakeManager.stakes(v3.address, Role.Validator);
    expect(v1Stake).to.equal(STAKE_AMOUNT);
    expect(v2Stake).to.equal(STAKE_AMOUNT - penalty);
    expect(v3Stake).to.equal(STAKE_AMOUNT - penalty);

    const employerBalance = await token.balanceOf(employer.address);
    expect(employerBalance).to.equal(penalty * 2n);

    const ban2 = await validation.validatorBanUntil(v2.address);
    const ban3 = await validation.validatorBanUntil(v3.address);
    const currentBlock = await ethers.provider.getBlockNumber();
    expect(ban2).to.be.gt(currentBlock);
    expect(ban3).to.be.gt(currentBlock);

    const job = await jobRegistry.jobs(jobId);
    const metadata = await jobRegistry.decodeJobMetadata(job.packedMetadata);
    expect(metadata.status).to.equal(4);
    expect(metadata.success).to.equal(false);
  });
});
