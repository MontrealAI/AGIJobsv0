const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ValidationModule V2', function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, reputation, identity;
  let burnTxHash;

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();
    burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();
    await jobRegistry.setStakeManager(await stakeManager.getAddress());

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

    // validator stakes and pool
    await stakeManager.setStake(v1.address, 1, ethers.parseEther('100'));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther('50'));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('10'));

    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    // setup job
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
    await jobRegistry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);
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

  async function start(jobId, entropy = 0) {
    const addr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      addr,
      '0x1000000000000000000',
    ]);
    await ethers.provider.send('hardhat_impersonateAccount', [addr]);
    const registry = await ethers.getSigner(addr);
    await validation.connect(registry).start(jobId, entropy);
    await ethers.provider.send('hardhat_stopImpersonatingAccount', [addr]);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(v1).selectValidators(jobId, 0);
  }

  it('selects validators', async () => {
    const tx = await select(1, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    );
    const selected = event.args[1];
    expect(selected.length).to.equal(3);
  });

  it('starts validation', async () => {
    const tx = await start(1, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    );
    expect(event.args[1].length).to.equal(3);
  });

  it('skips non-reveal penalties when burn evidence missing', async () => {
    await stakeManager.setBurnPct(5);
    await jobRegistry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await start(1, 0);
    await jobRegistry.setBurnConfirmed(1, false);
    const before = await stakeManager.stakeOf(v1.address, 1);
    await advance(4000);
    await validation.forceFinalize(1);
    expect(await stakeManager.stakeOf(v1.address, 1)).to.equal(before);
    expect(await validation.validatorBanUntil(v1.address)).to.equal(0);
    expect(await reputation.reputation(v1.address)).to.equal(0);
  });

  it('reverts when called by non-registry', async () => {
    await expect(validation.start(1, 0)).to.be.revertedWithCustomError(
      validation,
      'OnlyJobRegistry'
    );
  });

  it('reverts if job not submitted', async () => {
    const jobStruct = {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 2,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(2, jobStruct);
    await expect(start(2, 0)).to.be.revertedWithCustomError(
      validation,
      'JobNotSubmitted'
    );
  });

  it('reverts when selecting without stake manager configured', async () => {
    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const unconfigured = await Validation.deploy(
      await jobRegistry.getAddress(),
      ethers.ZeroAddress,
      60,
      60,
      3,
      3,
      []
    );
    await unconfigured.waitForDeployment();
    await unconfigured
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await unconfigured
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    await unconfigured.selectValidators(1, 0);
    await ethers.provider.send('evm_mine', []);
    await expect(
      unconfigured.connect(v1).selectValidators(1, 0)
    ).to.be.revertedWithCustomError(unconfigured, 'StakeManagerNotSet');
  });

  it('requires multiple entropy contributors before finalization', async () => {
    const jobId = 1;
    await validation.connect(v1).selectValidators(jobId, 123);
    await ethers.provider.send('evm_mine', []);

    await expect(validation.connect(v1).selectValidators(jobId, 0)).to.emit(
      validation,
      'SelectionReset'
    );

    let selected = await validation.validators(jobId);
    expect(selected.length).to.equal(0);

    await validation.connect(v2).selectValidators(jobId, 456);
    await ethers.provider.send('evm_mine', []);
    const tx = await validation.connect(v1).selectValidators(jobId, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    );
    expect(event.args[1].length).to.equal(3);
  });

  it('rejects zero stake manager address', async () => {
    await expect(
      validation.connect(owner).setStakeManager(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(validation, 'InvalidStakeManager');
  });

  it('rejects validators less than three via setParameters', async () => {
    await expect(
      validation.connect(owner).setParameters(2, 60, 60)
    ).to.be.revertedWithCustomError(validation, 'InvalidValidatorBounds');
  });

  it('rejects validator bounds below three', async () => {
    await expect(
      validation.connect(owner).setValidatorBounds(2, 3)
    ).to.be.revertedWithCustomError(validation, 'InvalidValidatorBounds');
  });

  it('selects stake-weighted validators', async () => {
    const tx = await select(1);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    );
    const selected = event.args[1];

    expect(selected.length).to.equal(3);
    const set = new Set(selected.map((a) => a.toLowerCase()));
    expect(set.size).to.equal(3);
    for (const addr of selected) {
      expect([v1.address, v2.address, v3.address]).to.include(addr);
    }
  });

  it('does not slash honest validators', async () => {
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('salt1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('salt2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('salt3'));
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
    await (
      await validation.connect(v1).commitValidation(1, commit1, '', [])
    ).wait();
    await (
      await validation.connect(v2).commitValidation(1, commit2, '', [])
    ).wait();
    await (
      await validation.connect(v3).commitValidation(1, commit3, '', [])
    ).wait();
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, '', []);
    await validation
      .connect(v2)
      .revealValidation(1, true, burnTxHash, salt2, '', []);
    await validation
      .connect(v3)
      .revealValidation(1, true, burnTxHash, salt3, '', []);
    await advance(61);
    expect(await validation.finalize.staticCall(1)).to.equal(true);
    await validation.finalize(1);
    const selected = [v1.address, v2.address, v3.address];
    for (const addr of selected) {
      const stake = await stakeManager.stakeOf(addr, 1);
      const expectedStake =
        addr.toLowerCase() === v1.address.toLowerCase()
          ? ethers.parseEther('100')
          : addr.toLowerCase() === v2.address.toLowerCase()
          ? ethers.parseEther('50')
          : ethers.parseEther('10');
      expect(stake).to.equal(expectedStake);
      expect(await reputation.reputation(addr)).to.equal(1n);
    }
  });

  it('slashes validator voting against majority', async () => {
    await select(1);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes('salt1'));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes('salt2'));
    const salt3 = ethers.keccak256(ethers.toUtf8Bytes('salt3'));
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
      [1n, nonce, false, burnTxHash, salt3, ethers.ZeroHash]
    );
    await (
      await validation.connect(v1).commitValidation(1, commit1, '', [])
    ).wait();
    await (
      await validation.connect(v2).commitValidation(1, commit2, '', [])
    ).wait();
    await (
      await validation.connect(v3).commitValidation(1, commit3, '', [])
    ).wait();
    await advance(61);
    const stakeBefore = await stakeManager.stakeOf(v3.address, 1);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, '', []);
    await validation
      .connect(v2)
      .revealValidation(1, true, burnTxHash, salt2, '', []);
    await validation
      .connect(v3)
      .revealValidation(1, false, burnTxHash, salt3, '', []);
    await advance(61);
    await validation.finalize(1);
    expect(await stakeManager.stakeOf(v3.address, 1)).to.equal(
      stakeBefore / 2n
    );
    expect(await reputation.reputation(v1.address)).to.equal(1n);
    expect(await reputation.reputation(v2.address)).to.equal(1n);
    expect(await reputation.reputation(v3.address)).to.equal(0n);
  });

  it('rejects reveal with incorrect nonce', async () => {
    await select(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const wrongNonce = (await validation.jobNonce(1)) + 1n;
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, wrongNonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await (
      await validation.connect(v1).commitValidation(1, commit, '', [])
    ).wait();
    await advance(61);
    await expect(
      validation.connect(v1).revealValidation(1, true, burnTxHash, salt, '', [])
    ).to.be.revertedWithCustomError(validation, 'InvalidReveal');
  });

  it('clears commitments after finalization', async () => {
    await validation.connect(owner).setValidatorBounds(3, 3);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    await select(1);
    const nonce = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await (
      await validation.connect(v1).commitValidation(1, commit, '', [])
    ).wait();
    expect(await validation.commitments(1, v1.address, nonce)).to.equal(commit);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt, '', []);
    await advance(61);
    await validation.finalize(1);
    expect(await validation.commitments(1, v1.address, nonce)).to.equal(
      ethers.ZeroHash
    );
  });

  it('clears commitments when job nonce is reset', async () => {
    await validation.connect(owner).setValidatorBounds(3, 3);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    await select(1);
    const nonce1 = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const commit1 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce1, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await (
      await validation.connect(v1).commitValidation(1, commit1, '', [])
    ).wait();

    await expect(
      validation.connect(v1).commitValidation(1, commit1, '', [])
    ).to.be.revertedWithCustomError(validation, 'AlreadyCommitted');

    await validation.connect(owner).resetJobNonce(1);
    expect(await validation.jobNonce(1)).to.equal(0n);

    const tx = await select(1);
    await tx.wait();
    const nonce2 = await validation.jobNonce(1);
    expect(nonce2).to.equal(1n);
    const commit2 = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce2, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await expect(validation.connect(v1).commitValidation(1, commit2, '', [])).to
      .not.be.reverted;
  });

  it('removes validators from lookup on nonce reset', async () => {
    await validation.connect(owner).setValidatorBounds(3, 3);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);
    await select(1);
    await validation.connect(owner).resetJobNonce(1);
    await identity.addAdditionalValidator(owner.address);
    await stakeManager.setStake(owner.address, 1, ethers.parseEther('10'));
    await validation
      .connect(owner)
      .setValidatorPool([v2.address, v3.address, owner.address]);
    await select(1);
    const nonce = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await expect(
      validation.connect(v1).commitValidation(1, commit, '', [])
    ).to.be.revertedWithCustomError(validation, 'NotValidator');
  });

  it('allows owner to reassign registry and stake manager', async () => {
    // select validators to create state for job 1
    await select(1);

    const StakeMock2 = await ethers.getContractFactory('MockStakeManager');
    const newStake = await StakeMock2.deploy();
    await newStake.waitForDeployment();
    await newStake.setStake(v1.address, 1, ethers.parseEther('100'));
    await newStake.setStake(v2.address, 1, ethers.parseEther('50'));
    await newStake.setStake(v3.address, 1, ethers.parseEther('10'));

    const JobMock2 = await ethers.getContractFactory('MockJobRegistry');
    const newJob = await JobMock2.deploy();
    await newJob.waitForDeployment();

    await expect(
      validation.connect(employer).setStakeManager(await newStake.getAddress())
    ).to.be.revertedWithCustomError(validation, 'OwnableUnauthorizedAccount');

    await expect(
      validation.connect(owner).setStakeManager(await newStake.getAddress())
    )
      .to.emit(validation, 'StakeManagerUpdated')
      .withArgs(await newStake.getAddress());

    await expect(
      validation.connect(owner).setJobRegistry(await newJob.getAddress())
    )
      .to.emit(validation, 'JobRegistryUpdated')
      .withArgs(await newJob.getAddress());

    await expect(
      validation.selectValidators(1, 0)
    ).to.be.revertedWithCustomError(validation, 'ValidatorsAlreadySelected');

    await validation.connect(owner).resetJobNonce(1);
    await expect(select(1)).to.not.be.reverted;
  });

  it('enforces tax acknowledgement for commit and reveal', async () => {
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.setTaxPolicy(await policy.getAddress());
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
    const val = signerMap[selected[0].toLowerCase()];
    const salt = ethers.keccak256(ethers.toUtf8Bytes('salt'));
    const nonce = await validation.jobNonce(1);
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );

    await expect(validation.connect(val).commitValidation(1, commit, '', []))
      .to.be.revertedWithCustomError(validation, 'TaxPolicyNotAcknowledged')
      .withArgs(val.address);

    await policy.connect(val).acknowledge();
    await expect(validation.connect(val).commitValidation(1, commit, '', []))
      .to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(val.address, ethers.ZeroHash, '', false, false)
      .and.to.emit(validation, 'ValidationCommitted')
      .withArgs(1, val.address, commit, '');

    await advance(61);
    await policy.bumpPolicyVersion();
    await expect(
      validation
        .connect(val)
        .revealValidation(1, true, burnTxHash, salt, '', [])
    )
      .to.be.revertedWithCustomError(validation, 'TaxPolicyNotAcknowledged')
      .withArgs(val.address);

    await policy.connect(val).acknowledge();
    await expect(
      validation
        .connect(val)
        .revealValidation(1, true, burnTxHash, salt, '', [])
    )
      .to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(val.address, ethers.ZeroHash, '', false, false)
      .and.to.emit(validation, 'ValidationRevealed')
      .withArgs(1, val.address, true, burnTxHash, '');
  });

  it('updates additional validators individually', async () => {
    const [, , , , , extra] = await ethers.getSigners();
    await expect(identity.addAdditionalValidator(extra.address))
      .to.emit(identity, 'AdditionalValidatorUpdated')
      .withArgs(extra.address, true);
    expect(await identity.additionalValidators(extra.address)).to.equal(true);

    await expect(identity.removeAdditionalValidator(extra.address))
      .to.emit(identity, 'AdditionalValidatorUpdated')
      .withArgs(extra.address, false);
    expect(await identity.additionalValidators(extra.address)).to.equal(false);
  });
});
