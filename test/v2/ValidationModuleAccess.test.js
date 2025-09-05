const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ValidationModule access controls', function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, reputation, identity;

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const RepMock = await ethers.getContractFactory('MockReputationEngine');
    reputation = await RepMock.deploy();
    await reputation.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
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
    identity = await Identity.deploy();
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
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('10'));

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
  });

  async function advance(seconds) {
    await ethers.provider.send('evm_increaseTime', [seconds]);
    await ethers.provider.send('evm_mine', []);
  }

  async function select(jobId, entropy = 0) {
    await validation.selectValidators(jobId, entropy);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(v1).selectValidators(jobId, 0);
  }

  it('reverts when validator pool contains zero address', async () => {
    await expect(
      validation
        .connect(owner)
        .setValidatorPool([v1.address, ethers.ZeroAddress, v3.address])
    ).to.be.revertedWithCustomError(validation, 'ZeroValidatorAddress');
  });

  it('rejects unauthorized validators', async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    ).args[1];
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    const val = selected[0];
    const signer = signerMap[val.toLowerCase()];

    const Toggle = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const toggle = await Toggle.deploy();
    await toggle.waitForDeployment();
    await validation
      .connect(owner)
      .setIdentityRegistry(await toggle.getAddress());
    await toggle.setResult(false);
    await identity.removeAdditionalValidator(val);

    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce, true, salt, ethers.ZeroHash]
    );
    await expect(
      validation.connect(signer).commitValidation(1, commit, '', [])
    ).to.be.revertedWithCustomError(validation, 'UnauthorizedValidator');

    // allow commit then block reveal
    await identity.addAdditionalValidator(val);
    await toggle.setResult(true);
    await (
      await validation.connect(signer).commitValidation(1, commit, '', [])
    ).wait();
    await advance(61);
    await identity.removeAdditionalValidator(val);
    await toggle.setResult(false);
    await expect(
      validation.connect(signer).revealValidation(1, true, salt, '', [])
    ).to.be.revertedWithCustomError(validation, 'UnauthorizedValidator');
  });

  it('rejects blacklisted validators', async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    ).args[1];
    const val = selected[0];
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    const signer = signerMap[val.toLowerCase()];

    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce, true, salt, ethers.ZeroHash]
    );
    await reputation.setBlacklist(val, true);
    await expect(
      validation.connect(signer).commitValidation(1, commit, '', [])
    ).to.be.revertedWithCustomError(validation, 'BlacklistedValidator');

    await reputation.setBlacklist(val, false);
    await (
      await validation.connect(signer).commitValidation(1, commit, '', [])
    ).wait();
    await advance(61);
    await reputation.setBlacklist(val, true);
    await expect(
      validation.connect(signer).revealValidation(1, true, salt, '', [])
    ).to.be.revertedWithCustomError(validation, 'BlacklistedValidator');
  });

  it('finalize updates job registry based on tally', async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const selected = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    ).args[1];
    const vA = selected[0];
    const vB = selected[1];
    const vC = selected[2];

    const saltA = ethers.keccak256(ethers.toUtf8Bytes('a'));
    const saltB = ethers.keccak256(ethers.toUtf8Bytes('b'));
    const saltC = ethers.keccak256(ethers.toUtf8Bytes('c'));
    const nonce = await validation.jobNonce(1);
    const commitA = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce, false, saltA, ethers.ZeroHash]
    );
    const commitB = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce, false, saltB, ethers.ZeroHash]
    );
    const commitC = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce, false, saltC, ethers.ZeroHash]
    );
    const signerMap = {
      [v1.address.toLowerCase()]: v1,
      [v2.address.toLowerCase()]: v2,
      [v3.address.toLowerCase()]: v3,
    };
    await (
      await validation
        .connect(signerMap[vA.toLowerCase()])
        .commitValidation(1, commitA, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vB.toLowerCase()])
        .commitValidation(1, commitB, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vC.toLowerCase()])
        .commitValidation(1, commitC, '', [])
    ).wait();
    await advance(61);
    await (
      await validation
        .connect(signerMap[vA.toLowerCase()])
        .revealValidation(1, false, saltA, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vB.toLowerCase()])
        .revealValidation(1, false, saltB, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vC.toLowerCase()])
        .revealValidation(1, false, saltC, '', [])
    ).wait();
    await advance(61);
    await validation.finalize(1);
    let job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(5); // Disputed

    await validation.connect(owner).resetJobNonce(1);
    // reset job status to Submitted
    await jobRegistry.setJob(1, {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });
    await select(1);
    const nonce2 = await validation.jobNonce(1);
    const s1 = ethers.keccak256(ethers.toUtf8Bytes('s1'));
    const s2 = ethers.keccak256(ethers.toUtf8Bytes('s2'));
    const s3 = ethers.keccak256(ethers.toUtf8Bytes('s3'));
    const c1 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce2, true, s1, ethers.ZeroHash]
    );
    const c2 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce2, true, s2, ethers.ZeroHash]
    );
    const c3 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
      [1n, nonce2, true, s3, ethers.ZeroHash]
    );
    await (
      await validation
        .connect(signerMap[vA.toLowerCase()])
        .commitValidation(1, c1, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vB.toLowerCase()])
        .commitValidation(1, c2, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vC.toLowerCase()])
        .commitValidation(1, c3, '', [])
    ).wait();
    await advance(61);
    await (
      await validation
        .connect(signerMap[vA.toLowerCase()])
        .revealValidation(1, true, s1, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vB.toLowerCase()])
        .revealValidation(1, true, s2, '', [])
    ).wait();
    await (
      await validation
        .connect(signerMap[vC.toLowerCase()])
        .revealValidation(1, true, s3, '', [])
    ).wait();
    await advance(61);
    await validation.finalize(1);
    job = await jobRegistry.jobs(1);
    expect(job.status).to.equal(6); // Finalized
    expect(job.success).to.equal(true);
  });
});
