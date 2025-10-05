const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

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
    await validation.connect(v1).selectValidators(jobId, entropy);
    const selectionTarget = await validation.selectionBlock(jobId);
    await validation.connect(v2).selectValidators(jobId, entropy + 1);

    while (BigInt(await ethers.provider.getBlockNumber()) <= selectionTarget) {
      await ethers.provider.send('evm_mine', []);
    }

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
    const selectionTarget = await validation.selectionBlock(jobId);
    await validation.connect(v1).selectValidators(jobId, entropy + 1);
    await ethers.provider.send('hardhat_stopImpersonatingAccount', [addr]);

    while (BigInt(await ethers.provider.getBlockNumber()) <= selectionTarget) {
      await ethers.provider.send('evm_mine', []);
    }

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

    await unconfigured.connect(v1).selectValidators(1, 0);
    const selectionTarget = await unconfigured.selectionBlock(1);
    await unconfigured.connect(v2).selectValidators(1, 1);

    while (BigInt(await ethers.provider.getBlockNumber()) <= selectionTarget) {
      await ethers.provider.send('evm_mine', []);
    }

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

  it('ignores entropy submitted after the selection block is mined', async () => {
    const jobId = 1;
    await validation.connect(v1).selectValidators(jobId, 123);
    const selectionTarget = await validation.selectionBlock(jobId);

    await validation.connect(v2).selectValidators(jobId, 456);

    while (BigInt(await ethers.provider.getBlockNumber()) <= selectionTarget) {
      await ethers.provider.send('evm_mine', []);
    }

    const beforeCount = await validation.entropyContributorCount(jobId);
    const expected = await validation
      .connect(v3)
      .selectValidators.staticCall(jobId, 111);
    const alt = await validation
      .connect(v3)
      .selectValidators.staticCall(jobId, 999);
    expect(alt).to.deep.equal(expected);

    const tx = await validation.connect(v3).selectValidators(jobId, 789);
    const receipt = await tx.wait();
    expect(await validation.entropyContributorCount(jobId)).to.equal(
      beforeCount
    );

    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'ValidatorsSelected'
    );
    expect(event.args[1].length).to.equal(expected.length);
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
      await validation.connect(v1).commitValidation(1, commit1, 'validator', [])
    ).wait();
    await (
      await validation.connect(v2).commitValidation(1, commit2, 'validator', [])
    ).wait();
    await (
      await validation.connect(v3).commitValidation(1, commit3, 'validator', [])
    ).wait();
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, 'validator', []);
    await validation
      .connect(v2)
      .revealValidation(1, true, burnTxHash, salt2, 'validator', []);
    await validation
      .connect(v3)
      .revealValidation(1, true, burnTxHash, salt3, 'validator', []);
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
      await validation.connect(v1).commitValidation(1, commit1, 'validator', [])
    ).wait();
    await (
      await validation.connect(v2).commitValidation(1, commit2, 'validator', [])
    ).wait();
    await (
      await validation.connect(v3).commitValidation(1, commit3, 'validator', [])
    ).wait();
    await advance(61);
    const stakeBefore = await stakeManager.stakeOf(v3.address, 1);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, 'validator', []);
    await validation
      .connect(v2)
      .revealValidation(1, true, burnTxHash, salt2, 'validator', []);
    await validation
      .connect(v3)
      .revealValidation(1, false, burnTxHash, salt3, 'validator', []);
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
      await validation.connect(v1).commitValidation(1, commit, 'validator', [])
    ).wait();
    await advance(61);
    await expect(
      validation.connect(v1).revealValidation(1, true, burnTxHash, salt, 'validator', [])
    ).to.be.revertedWithCustomError(validation, 'InvalidReveal');
  });

  it('rejects reveal when commit data does not match', async () => {
    await select(1);
    const nonce = await validation.jobNonce(1);
    const salt = ethers.keccak256(ethers.toUtf8Bytes('flip'));
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, ethers.ZeroHash]
    );
    await (
      await validation.connect(v1).commitValidation(1, commit, 'validator', [])
    ).wait();
    await advance(61);
    await expect(
      validation
        .connect(v1)
        .revealValidation(1, false, burnTxHash, salt, 'validator', [])
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
      await validation.connect(v1).commitValidation(1, commit, 'validator', [])
    ).wait();
    expect(await validation.commitments(1, v1.address, nonce)).to.equal(commit);
    await advance(61);
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt, 'validator', []);
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
      await validation.connect(v1).commitValidation(1, commit1, 'validator', [])
    ).wait();

    await expect(
      validation.connect(v1).commitValidation(1, commit1, 'validator', [])
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
    await expect(validation.connect(v1).commitValidation(1, commit2, 'validator', [])).to
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
      validation.connect(v1).commitValidation(1, commit, 'validator', [])
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

    await expect(validation.connect(val).commitValidation(1, commit, 'validator', []))
      .to.be.revertedWithCustomError(validation, 'TaxPolicyNotAcknowledged')
      .withArgs(val.address);

    await policy.connect(val).acknowledge();
    await expect(validation.connect(val).commitValidation(1, commit, 'validator', []))
      .to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(val.address, ethers.ZeroHash, 'validator', false, false)
      .and.to.emit(validation, 'ValidationCommitted')
      .withArgs(1, val.address, commit, 'validator');

    await advance(61);
    await policy.bumpPolicyVersion();
    await expect(
      validation
        .connect(val)
        .revealValidation(1, true, burnTxHash, salt, 'validator', [])
    )
      .to.be.revertedWithCustomError(validation, 'TaxPolicyNotAcknowledged')
      .withArgs(val.address);

    await policy.connect(val).acknowledge();
    await expect(
      validation
        .connect(val)
        .revealValidation(1, true, burnTxHash, salt, 'validator', [])
    )
      .to.emit(validation, 'ValidatorIdentityVerified')
      .withArgs(val.address, ethers.ZeroHash, 'validator', false, false)
      .and.to.emit(validation, 'ValidationRevealed')
      .withArgs(1, val.address, true, burnTxHash, 'validator');
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

  describe('with real StakeManager', function () {
    let tokenReal,
      stakeManagerReal,
      jobRegistryReal,
      validationReal,
      identityReal;
    let admin,
      employerAccount,
      validatorA,
      validatorB,
      validatorC;
    let burnHashReal;

    beforeEach(async () => {
      [admin, employerAccount, validatorA, validatorB, validatorC] =
        await ethers.getSigners();
      burnHashReal = ethers.keccak256(
        ethers.toUtf8Bytes('real-stake-burn')
      );

      const erc20Artifact = await readArtifact(
        'contracts/test/MockERC20.sol:MockERC20'
      );
      await network.provider.send('hardhat_setCode', [
        AGIALPHA,
        erc20Artifact.deployedBytecode,
      ]);
      tokenReal = await ethers.getContractAt(
        'contracts/test/MockERC20.sol:MockERC20',
        AGIALPHA
      );

      const mintAmount = ethers.parseEther('1000');
      for (const signer of [
        admin,
        employerAccount,
        validatorA,
        validatorB,
        validatorC,
      ]) {
        await tokenReal.mint(signer.address, mintAmount);
      }

      const Stake = await ethers.getContractFactory(
        'contracts/v2/StakeManager.sol:StakeManager'
      );
      stakeManagerReal = await Stake.deploy(
        0,
        10_000,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        admin.address
      );
      await stakeManagerReal.waitForDeployment();

      const JobMock = await ethers.getContractFactory(
        'contracts/legacy/MockV2.sol:MockJobRegistry'
      );
      jobRegistryReal = await JobMock.deploy();
      await jobRegistryReal.waitForDeployment();

      const Validation = await ethers.getContractFactory(
        'contracts/v2/ValidationModule.sol:ValidationModule'
      );
      validationReal = await Validation.deploy(
        await jobRegistryReal.getAddress(),
        await stakeManagerReal.getAddress(),
        60,
        60,
        3,
        3,
        []
      );
      await validationReal.waitForDeployment();

      await jobRegistryReal.setStakeManager(
        await stakeManagerReal.getAddress()
      );
      await jobRegistryReal.setValidationModule(
        await validationReal.getAddress()
      );
      await stakeManagerReal
        .connect(admin)
        .setJobRegistry(await jobRegistryReal.getAddress());
      await stakeManagerReal
        .connect(admin)
        .setValidationModule(await validationReal.getAddress());

      const Identity = await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
      );
      identityReal = await Identity.deploy();
      await identityReal.waitForDeployment();
      await validationReal
        .connect(admin)
        .setIdentityRegistry(await identityReal.getAddress());
      await identityReal.setClubRootNode(ethers.ZeroHash);
      await identityReal.setAgentRootNode(ethers.ZeroHash);
      await identityReal.addAdditionalValidator(validatorA.address);
      await identityReal.addAdditionalValidator(validatorB.address);
      await identityReal.addAdditionalValidator(validatorC.address);

      await validationReal
        .connect(admin)
        .setValidatorPool([
          validatorA.address,
          validatorB.address,
          validatorC.address,
        ]);

      const stakes = [
        ethers.parseEther('100'),
        ethers.parseEther('50'),
        ethers.parseEther('10'),
      ];
      const validators = [validatorA, validatorB, validatorC];
      for (let i = 0; i < validators.length; i++) {
        await tokenReal
          .connect(validators[i])
          .approve(
            await stakeManagerReal.getAddress(),
            stakes[i]
          );
        await stakeManagerReal
          .connect(validators[i])
          .depositStake(1, stakes[i]);
      }

      const jobStruct = {
        employer: employerAccount.address,
        agent: ethers.ZeroAddress,
        reward: 0,
        stake: 0,
        success: false,
        status: 3,
        uriHash: ethers.ZeroHash,
        resultHash: ethers.ZeroHash,
      };
      await jobRegistryReal.setJob(1, jobStruct);
      await jobRegistryReal
        .connect(employerAccount)
        .submitBurnReceipt(1, burnHashReal, 0, 0);
    });

    async function selectReal(jobId, entropy = 0) {
      await validationReal
        .connect(validatorA)
        .selectValidators(jobId, entropy);
      const selectionTarget = await validationReal.selectionBlock(jobId);
      await validationReal
        .connect(validatorB)
        .selectValidators(jobId, entropy + 1);

      while (BigInt(await ethers.provider.getBlockNumber()) <= selectionTarget) {
        await ethers.provider.send('evm_mine', []);
      }

      return validationReal
        .connect(validatorA)
        .selectValidators(jobId, 0);
    }

    it('slashes validators through real StakeManager access control', async () => {
      await selectReal(1);
      const salt1 = ethers.keccak256(ethers.toUtf8Bytes('salt1'));
      const salt2 = ethers.keccak256(ethers.toUtf8Bytes('salt2'));
      const salt3 = ethers.keccak256(ethers.toUtf8Bytes('salt3'));
      const nonce = await validationReal.jobNonce(1);
      const commit1 = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, true, burnHashReal, salt1, ethers.ZeroHash]
      );
      const commit2 = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, true, burnHashReal, salt2, ethers.ZeroHash]
      );
      const commit3 = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, false, burnHashReal, salt3, ethers.ZeroHash]
      );

      await (
        await validationReal
          .connect(validatorA)
          .commitValidation(1, commit1, 'validator', [])
      ).wait();
      await (
        await validationReal
          .connect(validatorB)
          .commitValidation(1, commit2, 'validator', [])
      ).wait();
      await (
        await validationReal
          .connect(validatorC)
          .commitValidation(1, commit3, 'validator', [])
      ).wait();

      await advance(61);
      const before = await stakeManagerReal.stakeOf(
        validatorC.address,
        1
      );

      await validationReal
        .connect(validatorA)
        .revealValidation(1, true, burnHashReal, salt1, 'validator', []);
      await validationReal
        .connect(validatorB)
        .revealValidation(1, true, burnHashReal, salt2, 'validator', []);
      await validationReal
        .connect(validatorC)
        .revealValidation(1, false, burnHashReal, salt3, 'validator', []);

      await advance(61);
      await validationReal.finalize(1);

      const after = await stakeManagerReal.stakeOf(validatorC.address, 1);
      expect(after).to.equal(before / 2n);
    });
  });
});
