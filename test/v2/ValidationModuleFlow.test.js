const { expect } = require('chai');
const { ethers } = require('hardhat');

const abi = ethers.AbiCoder.defaultAbiCoder();

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
  const outcomeHash = ethers.keccak256(
    abi.encode(['uint256', 'bytes32', 'bool', 'bytes32'], [nonce, specHash, approve, burnTxHash])
  );
  return ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domain]
    )
  );
}

async function setup() {
  const [owner, employer, v1, v2, v3] = await ethers.getSigners();

  const StakeMock = await ethers.getContractFactory('MockStakeManager');
  const stakeManager = await StakeMock.deploy();
  await stakeManager.waitForDeployment();

  const JobMock = await ethers.getContractFactory('MockJobRegistry');
  const jobRegistry = await JobMock.deploy();
  await jobRegistry.waitForDeployment();

  const RepMock = await ethers.getContractFactory('MockReputationEngine');
  const reputation = await RepMock.deploy();
  await reputation.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    await jobRegistry.getAddress(),
    await stakeManager.getAddress(),
    60,
    60,
    3,
    3,
    []
  );
  await validation.waitForDeployment();
  await validation
    .connect(owner)
    .setReputationEngine(await reputation.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
  );
  const identity = await Identity.deploy();
  await identity.waitForDeployment();
  await validation
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  await identity.setClubRootNode(ethers.ZeroHash);
  await identity.setAgentRootNode(ethers.ZeroHash);
  await identity.addAdditionalValidator(v1.address);
  await identity.addAdditionalValidator(v2.address);
  await identity.addAdditionalValidator(v3.address);

  await stakeManager.setStake(v1.address, 1, ethers.parseEther('100'));
  await stakeManager.setStake(v2.address, 1, ethers.parseEther('50'));
  await stakeManager.setStake(v3.address, 1, ethers.parseEther('25'));
  await validation
    .connect(owner)
    .setValidatorPool([v1.address, v2.address, v3.address]);

  const jobStruct = {
    employer: employer.address,
    agent: ethers.ZeroAddress,
    reward: 0,
    stake: 0,
    success: false,
    status: 3,
    uriHash: ethers.ZeroHash,
    resultHash: ethers.ZeroHash,
  };
  await jobRegistry.setJob(1, jobStruct);
  const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
  await jobRegistry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);
  async function select(jobId, entropy = 0) {
    await validation.selectValidators(jobId, entropy);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(v1).selectValidators(jobId, 0);
  }

  return {
    owner,
    employer,
    v1,
    v2,
    v3,
    validation,
    stakeManager,
    jobRegistry,
    identity,
    reputation,
    select,
    burnTxHash,
  };
}

async function advance(seconds) {
  await ethers.provider.send('evm_increaseTime', [seconds]);
  await ethers.provider.send('evm_mine', []);
}

describe('ValidationModule finalize flows', function () {
  it('records majority approval as success', async () => {
    const {
      v1,
      v2,
      v3,
      validation,
      jobRegistry,
      select,
      employer,
      burnTxHash,
    } = await setup();
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const domain = await validation.DOMAIN_SEPARATOR();
    const { chainId } = await ethers.provider.getNetwork();
    const specHash = await jobRegistry.getSpecHash(1);
    const nonce = await validation.jobNonce(1);
    const commit1 = typedCommit(
      1,
      nonce,
      v1.address,
      true,
      burnTxHash,
      salt1,
      specHash,
      domain,
      chainId
    );
    const commit2 = typedCommit(
      1,
      nonce,
      v2.address,
      false,
      burnTxHash,
      salt2,
      specHash,
      domain,
      chainId
    );
    const commit3 = typedCommit(
      1,
      nonce,
      v3.address,
      false,
      burnTxHash,
      salt3,
      specHash,
      domain,
      chainId
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    expect(await validation.validatorStakes(1, v1.address)).to.equal(
      ethers.parseEther('100')
    );
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, '', []);
    await validation
      .connect(v2)
      .revealValidation(1, false, burnTxHash, salt2, '', []);
    await validation
      .connect(v3)
      .revealValidation(1, false, burnTxHash, salt3, '', []);
    await advance(61);
    await validation.finalize(1);
    await jobRegistry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await jobRegistry.connect(employer).finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(6); // Finalized
    expect(job.success).to.equal(true);
  });

  it('reverts finalize before any reveals', async () => {
    const { v1, v2, v3, validation, jobRegistry, select, burnTxHash } = await setup();
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const domain = await validation.DOMAIN_SEPARATOR();
    const { chainId } = await ethers.provider.getNetwork();
    const specHash = await jobRegistry.getSpecHash(1);
    const nonce = await validation.jobNonce(1);
    const commit1 = typedCommit(
      1,
      nonce,
      v1.address,
      true,
      burnTxHash,
      salt1,
      specHash,
      domain,
      chainId
    );
    const commit2 = typedCommit(
      1,
      nonce,
      v2.address,
      true,
      burnTxHash,
      salt2,
      specHash,
      domain,
      chainId
    );
    const commit3 = typedCommit(
      1,
      nonce,
      v3.address,
      true,
      burnTxHash,
      salt3,
      specHash,
      domain,
      chainId
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    await expect(validation.finalize(1)).to.be.revertedWithCustomError(
      validation,
      'RevealPending'
    );
  });

  it('reverts commit after the commit deadline', async () => {
    const { v1, validation, select, burnTxHash } = await setup();
    await select(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('late'));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await advance(61);
    await expect(
      validation.connect(v1).commitValidation(1, commit, '', [])
    ).to.be.revertedWithCustomError(validation, 'CommitPhaseClosed');
  });

  it('records majority rejection as dispute', async () => {
    const { v1, v2, v3, validation, jobRegistry, select, burnTxHash } =
      await setup();
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, false, burnTxHash, salt1, ethers.ZeroHash]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, false, burnTxHash, salt2, ethers.ZeroHash]
    );
    const commit3 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt3, ethers.ZeroHash]
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, false, burnTxHash, salt1, '', []);
    await validation
      .connect(v2)
      .revealValidation(1, false, burnTxHash, salt2, '', []);
    await validation
      .connect(v3)
      .revealValidation(1, true, burnTxHash, salt3, '', []);
    await advance(61);
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it('disputes when validators fail to reveal', async () => {
    const { validation, jobRegistry, select } = await setup();
    await select(1);
    await advance(61); // end commit
    await advance(61); // end reveal
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it('reverts reveal after the reveal deadline', async () => {
    const { v1, validation, select, burnTxHash } = await setup();
    await select(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('late'));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await validation.connect(v1).commitValidation(1, commit, '', []);
    await advance(61); // end commit
    await advance(61); // end reveal
    await expect(
      validation.connect(v1).revealValidation(1, true, burnTxHash, salt, '', [])
    ).to.be.revertedWithCustomError(validation, 'RevealPhaseClosed');
  });

  it('slashes validators that do not all reveal', async () => {
    const {
      v1,
      v2,
      v3,
      validation,
      stakeManager,
      jobRegistry,
      select,
      employer,
      burnTxHash,
    } = await setup();
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt1, ethers.ZeroHash]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt2, ethers.ZeroHash]
    );
    const commit3 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt3, ethers.ZeroHash]
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, '', []);
    await advance(61);
    await validation.finalize(1);
    expect(await stakeManager.stakeOf(v1.address, 1)).to.equal(
      ethers.parseEther('50')
    );
    expect(await stakeManager.stakeOf(v2.address, 1)).to.equal(
      ethers.parseEther('49.75')
    );
    expect(await stakeManager.stakeOf(v3.address, 1)).to.equal(
      ethers.parseEther('24.875')
    );
    const banV2 = await validation.validatorBanUntil(v2.address);
    const banV3 = await validation.validatorBanUntil(v3.address);
    expect(banV2).to.be.greaterThan(0n);
    expect(banV3).to.be.greaterThan(0n);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });

  it('allows force finalize after deadline and slashes no-shows', async () => {
    const {
      v1,
      v2,
      v3,
      validation,
      stakeManager,
      jobRegistry,
      select,
      employer,
      burnTxHash,
    } = await setup();
    await select(1);
    const domain = await validation.DOMAIN_SEPARATOR();
    const { chainId } = await ethers.provider.getNetwork();
    const specHash = await jobRegistry.getSpecHash(1);
    const nonce = await validation.jobNonce(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const commit1 = typedCommit(
      1,
      nonce,
      v1.address,
      true,
      burnTxHash,
      salt1,
      specHash,
      domain,
      chainId
    );
    const commit2 = typedCommit(
      1,
      nonce,
      v2.address,
      true,
      burnTxHash,
      salt2,
      specHash,
      domain,
      chainId
    );
    const commit3 = typedCommit(
      1,
      nonce,
      v3.address,
      true,
      burnTxHash,
      salt3,
      specHash,
      domain,
      chainId
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    await advance(61); // end commit
    await advance(61 + 3600 + 1); // end reveal + grace
    await validation.forceFinalize(1);
    await jobRegistry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await jobRegistry.connect(employer).finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(6); // Finalized
    expect(await stakeManager.stakeOf(v1.address, 1)).to.equal(
      ethers.parseEther('99.5')
    );
    expect(await stakeManager.stakeOf(v2.address, 1)).to.equal(
      ethers.parseEther('49.75')
    );
    expect(await stakeManager.stakeOf(v3.address, 1)).to.equal(
      ethers.parseEther('24.875')
    );
  });

  it('force finalize only slashes selected validators', async () => {
    const {
      owner,
      employer,
      v1,
      v2,
      v3,
      validation,
      stakeManager,
      jobRegistry,
      identity,
      select,
      burnTxHash,
    } = await setup();
    const signers = await ethers.getSigners();
    const v4 = signers[5];
    await identity.addAdditionalValidator(v4.address);
    await stakeManager.setStake(v4.address, 1, ethers.parseEther('10'));
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address, v4.address]);
    await select(1);
    const chosen = await validation.validators(1);
    const beforeV4 = await stakeManager.stakeOf(v4.address, 1);
    await advance(61); // end commit
    await advance(61 + 3600 + 1); // end reveal + grace
    await validation.forceFinalize(1);
    await jobRegistry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await jobRegistry.connect(employer).finalize(1);
    const isV4Selected = chosen.includes(v4.address);
    const afterV4 = await stakeManager.stakeOf(v4.address, 1);
    if (isV4Selected) {
      const penalty = (beforeV4 * 50n) / 10000n;
      expect(afterV4).to.equal(beforeV4 - penalty);
    } else {
      expect(afterV4).to.equal(beforeV4);
    }
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(6); // Finalized
  });

  it('disputes when approvals fall below threshold', async () => {
    const {
      v1,
      v2,
      v3,
      validation,
      jobRegistry,
      stakeManager,
      select,
      burnTxHash,
    } = await setup();
    await stakeManager.setStake(v1.address, 1, ethers.parseEther('50'));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther('100'));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('10'));
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const nonce = await validation.jobNonce(1);
    const commit1 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt1, ethers.ZeroHash]
    );
    const commit2 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, false, burnTxHash, salt2, ethers.ZeroHash]
    );
    const commit3 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, false, burnTxHash, salt3, ethers.ZeroHash]
    );
    await validation.connect(v1).commitValidation(1, commit1, '', []);
    await validation.connect(v2).commitValidation(1, commit2, '', []);
    await validation.connect(v3).commitValidation(1, commit3, '', []);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, '', []);
    await validation
      .connect(v2)
      .revealValidation(1, false, burnTxHash, salt2, '', []);
    await validation
      .connect(v3)
      .revealValidation(1, false, burnTxHash, salt3, '', []);
    await advance(61);
    await validation.finalize(1);
    const job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed
  });
});
