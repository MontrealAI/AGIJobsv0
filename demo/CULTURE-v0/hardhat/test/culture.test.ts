import { expect } from 'chai';
import { ethers } from 'hardhat';

const AUTHOR_ROLE = ethers.id('AUTHOR_ROLE');
const TEACHER_ROLE = ethers.id('TEACHER_ROLE');
const STUDENT_ROLE = ethers.id('STUDENT_ROLE');
const VALIDATOR_ROLE = ethers.id('VALIDATOR_ROLE');

describe('CultureRegistry (hardhat)', function () {
  it('mints artifacts and enforces budgets', async function () {
    const [owner, author] = await ethers.getSigners();
    const identityFactory = await ethers.getContractFactory('MockIdentityRegistry');
    const identity = await identityFactory.deploy();
    await identity.waitForDeployment();

    await identity.setRole(AUTHOR_ROLE, author.address, true);

    const registryFactory = await ethers.getContractFactory('CultureRegistry');
    const registry = await registryFactory.deploy(owner.address, await identity.getAddress(), ['book', 'prompt'], 8);
    await registry.waitForDeployment();

    await expect(
      registry.connect(author).mintArtifact('book', 'cid://artifact', 0, [])
    ).to.emit(registry, 'ArtifactMinted');

    const view = await registry.getArtifact(1);
    expect(view.author).to.equal(author.address);
    expect(view.kind).to.equal('book');
    expect(view.cites.length).to.equal(0);
  }).timeout(45000);
});

describe('SelfPlayArena (hardhat)', function () {
  async function deployArena() {
    const [owner, relayer, teacher, student, validator, employer] = await ethers.getSigners();

    const identityFactory = await ethers.getContractFactory('MockIdentityRegistry');
    const identity = await identityFactory.deploy();
    await identity.waitForDeployment();

    await identity.setRole(TEACHER_ROLE, teacher.address, true);
    await identity.setRole(STUDENT_ROLE, student.address, true);
    await identity.setRole(VALIDATOR_ROLE, validator.address, true);

    const jobRegistryFactory = await ethers.getContractFactory('MockJobRegistry');
    const jobRegistry = await jobRegistryFactory.deploy();
    await jobRegistry.waitForDeployment();
    await jobRegistry.setJob(1, employer.address, teacher.address);
    await jobRegistry.setJob(10, employer.address, student.address);
    await jobRegistry.setJob(20, employer.address, validator.address);

    const stakeManagerFactory = await ethers.getContractFactory('MockStakeManager');
    const stakeManager = await stakeManagerFactory.deploy();
    await stakeManager.waitForDeployment();

    const validationFactory = await ethers.getContractFactory('MockValidationModule');
    const validation = await validationFactory.deploy();
    await validation.waitForDeployment();

    const arenaFactory = await ethers.getContractFactory('SelfPlayArena');
    const arena = await arenaFactory.deploy(
      owner.address,
      relayer.address,
      await identity.getAddress(),
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      await validation.getAddress(),
      3,
      ethers.parseEther('2'),
      { teacher: ethers.parseEther('1'), student: ethers.parseEther('0.5'), validator: ethers.parseEther('0.25') },
      7_500,
      5
    );
    await arena.waitForDeployment();

    return {
      owner,
      relayer,
      teacher,
      student,
      validator,
      employer,
      identity,
      jobRegistry,
      stakeManager,
      validation,
      arena
    };
  }

  it('finalizes rounds with validation module integration', async function () {
    const { arena, relayer, owner, teacher, student, validator, stakeManager } = await deployArena();

    await arena.connect(relayer).startRound(1, teacher.address, 4);
    await arena.connect(relayer).registerParticipant(1, 0, 10, student.address);
    await arena.connect(relayer).registerParticipant(1, 1, 20, validator.address);

    await arena.connect(owner).closeRound(1);

    const tx = await arena
      .connect(relayer)
      .finalizeRound(1, 1, 7_800, 99, false, [validator.address]);
    await expect(tx)
      .to.emit(arena, 'RewardsDistributed')
      .withArgs(1, ethers.parseEther('1'), ethers.parseEther('0.5'), ethers.parseEther('0.25'));

    const view = await arena.getRound(1);
    expect(view.teacher).to.equal(teacher.address);
    expect(view.winningValidators).to.deep.equal([validator.address]);
    expect(view.rewardsDistributed).to.equal(ethers.parseEther('1.75'));

    const slashCalls = await stakeManager.callsLength();
    expect(slashCalls).to.equal(0n);
  }).timeout(60000);

  it('reverts when validation module reports failure', async function () {
    const { arena, relayer, owner, teacher, student, validator, validation } = await deployArena();

    await arena.connect(relayer).startRound(1, teacher.address, 4);
    await arena.connect(relayer).registerParticipant(1, 0, 10, student.address);
    await arena.connect(relayer).registerParticipant(1, 1, 20, validator.address);
    await arena.connect(owner).closeRound(1);

    await validation.setFinalizeSuccess(false);

    await expect(
      arena.connect(relayer).finalizeRound(1, 0, 7_500, 11, false, [])
    ).to.be.revertedWithCustomError(arena, 'ValidationFailed');
  }).timeout(60000);
});
