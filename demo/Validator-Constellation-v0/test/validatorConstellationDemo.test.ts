import { expect } from 'chai';
import type { Signer } from 'ethers';
import { loadFixture, mine, time } from '@nomicfoundation/hardhat-network-helpers';
import { buildTree, computeLeaf, getProof, getRoot } from '../src/merkle';
import { ethers } from '../src/runtime';

const domainPrimary = ethers.keccak256(ethers.toUtf8Bytes('demo.domain.primary'));
const domainBatch = ethers.keccak256(ethers.toUtf8Bytes('demo.domain.batch'));
const specHash = ethers.keccak256(ethers.toUtf8Bytes('job-spec-v1'));

const encodeEntropyCommitment = (secret: bigint) => ethers.solidityPackedKeccak256(['uint256'], [secret]);
const encodeVoteCommitment = (jobId: bigint, validator: string, approval: boolean, salt: bigint) =>
  ethers.solidityPackedKeccak256(['uint256', 'address', 'bool', 'uint256'], [jobId, validator, approval, salt]);

async function deployFixture() {
  const [deployer, validatorA, validatorB, validatorC, validatorD, validatorE, sentinel, agent] =
    await ethers.getSigners();

  const StakeManager = await ethers.getContractFactory('ConstellationStakeManager');
  const stakeManager = await StakeManager.deploy(ethers.parseEther('1'), await deployer.getAddress());

  const Oracle = await ethers.getContractFactory('ENSIdentityOracle');
  const identityOracle = await Oracle.deploy();

  const ZkVerifier = await ethers.getContractFactory('DemoZkBatchVerifier');
  const verifyingKey = ethers.keccak256(ethers.toUtf8Bytes('validator-constellation-demo-key'));
  const zkVerifier = await ZkVerifier.deploy(verifyingKey);

  const Demo = await ethers.getContractFactory('ValidatorConstellationDemo');
  const demo = await Demo.deploy(await stakeManager.getAddress(), await identityOracle.getAddress(), await zkVerifier.getAddress());

  await stakeManager.setController(await demo.getAddress(), true);
  await demo.configureSentinel(await sentinel.getAddress(), true);

  const validatorSigners = [
    { signer: validatorA, name: 'atlas.club.agi.eth' },
    { signer: validatorB, name: 'beluga.club.agi.eth' },
    { signer: validatorC, name: 'celeste.club.agi.eth' },
    { signer: validatorD, name: 'draco.club.agi.eth' },
    { signer: validatorE, name: 'elysian.club.agi.eth' },
  ];
  const validators = await Promise.all(
    validatorSigners.map(async ({ signer, name }) => ({
      signer,
      name,
      address: await signer.getAddress(),
    })),
  );
  const validatorLeaves = validators.map((entry) => computeLeaf(entry.address, entry.name));
  const validatorTree = buildTree(validatorLeaves);

  const agents = [
    {
      signer: agent,
      name: 'astra.agent.agi.eth',
      address: await agent.getAddress(),
    },
  ];
  const agentLeaves = agents.map((entry) => computeLeaf(entry.address, entry.name));
  const agentTree = buildTree(agentLeaves);

  await identityOracle.updateMerkleRoots(getRoot(validatorTree), getRoot(agentTree), ethers.ZeroHash);

  for (let i = 0; i < validators.length; i += 1) {
    const entry = validators[i];
    await stakeManager.connect(entry.signer).depositStake(entry.address, { value: ethers.parseEther('5') });
    await demo.connect(entry.signer).registerValidator(entry.name, getProof(validatorTree, i));
  }

  await demo.connect(agent).registerAgent(agents[0].name, getProof(agentTree, 0));

  const validatorMap = new Map<string, Signer>();
  validators.forEach((entry) => validatorMap.set(entry.address.toLowerCase(), entry.signer));

  return {
    demo,
    stakeManager,
    identityOracle,
    zkVerifier,
    verifyingKey,
    validators,
    validatorMap,
    sentinel,
    agentSigner: agent,
  };
}

const advanceSeconds = async (seconds: bigint) => {
  await time.increase(seconds);
  await mine();
};

describe('ValidatorConstellationDemo', () => {
  it('enforces ENS identities for agents and validators', async () => {
    const { demo, identityOracle, validators } = await loadFixture(deployFixture);
    const outsider = validators[0].signer;
    await expect(demo.connect(outsider).registerValidator('invalid.validator.eth', [])).to.be.revertedWithCustomError(
      identityOracle,
      'InvalidENSName',
    );
  });

  it('runs a full commit–reveal round with slashing for misbehaviour', async () => {
    const { demo, stakeManager, validatorMap, agentSigner } = await loadFixture(deployFixture);

    await demo.configureCommitteeSize(3);
    await demo.configureThresholds(6700, 6600);

    const jobTx = await demo
      .connect(agentSigner)
      .createJob(domainPrimary, specHash, ethers.parseEther('100'), true);
    await jobTx.wait();
    const jobId = (await demo.nextJobId()) - 1n;

    const validatorList = [...validatorMap.values()];
    if (validatorList.length < 2) throw new Error('insufficient validators');
    const entropyContributors = [
      { actor: agentSigner, secret: 101n },
      { actor: validatorList[0], secret: 202n },
      { actor: validatorList[1], secret: 303n },
    ];

    for (const contribution of entropyContributors) {
      await demo.connect(contribution.actor).commitEntropy(jobId, encodeEntropyCommitment(contribution.secret));
    }

    const entropyCommitWindow = BigInt(await demo.entropyCommitWindow());
    await advanceSeconds(entropyCommitWindow + 1n);

    for (const contribution of entropyContributors) {
      await demo.connect(contribution.actor).revealEntropy(jobId, contribution.secret);
    }

    const entropyRevealWindow = BigInt(await demo.entropyRevealWindow());
    await advanceSeconds(entropyRevealWindow + 1n);

    await demo.connect(agentSigner).launchValidation(jobId);
    const committee = await demo.getCommittee(jobId);

    const voteBook: Record<string, { salt: bigint; approval: boolean }> = {};
    committee.forEach((address, index) => {
      voteBook[address.toLowerCase()] = { salt: BigInt(1000 + index), approval: index !== committee.length - 1 };
    });

    for (const address of committee) {
      const entry = voteBook[address.toLowerCase()];
      const signer = validatorMap.get(address.toLowerCase());
      if (!signer) throw new Error('missing signer');
      await demo.connect(signer).commitVote(jobId, encodeVoteCommitment(jobId, address, entry.approval, entry.salt));
    }

    const commitWindow = BigInt(await demo.commitWindow());
    await advanceSeconds(commitWindow + 1n);

    for (const address of committee) {
      const entry = voteBook[address.toLowerCase()];
      const signer = validatorMap.get(address.toLowerCase());
      if (!signer) throw new Error('missing signer');
      if (address.toLowerCase() === committee[committee.length - 1].toLowerCase()) {
        continue; // skip reveal for final validator to trigger slashing
      }
      await demo.connect(signer).revealVote(jobId, entry.approval, entry.salt);
    }

    const revealWindow = BigInt(await demo.revealWindow());
    await advanceSeconds(revealWindow + 1n);

    const stakeBeforeQuorumFailure = await stakeManager.stakeOf(committee[committee.length - 1]);

    await expect(demo.finalizeJob(jobId)).to.not.be.reverted;

    const domainState = await demo.domains(domainPrimary);
    expect(domainState.paused).to.be.true;
    const sentinelJob = await demo.jobs(jobId);
    expect(sentinelJob.sentinelTripped).to.be.true;
    expect(sentinelJob.finalized).to.be.false;

    const stakeAfterQuorumFailure = await stakeManager.stakeOf(committee[committee.length - 1]);
    expect(stakeAfterQuorumFailure).to.be.lt(stakeBeforeQuorumFailure);

    await demo.resumeDomain(domainPrimary);
    const committeeSize = committee.length + 1; // add one more validator to meet quorum
    await demo.configureCommitteeSize(committeeSize);

    const newJobTx = await demo
      .connect(agentSigner)
      .createJob(domainPrimary, specHash, ethers.parseEther('100'), true);
    await newJobTx.wait();
    const secondJobId = (await demo.nextJobId()) - 1n;

    for (const contribution of entropyContributors) {
      await demo.connect(contribution.actor).commitEntropy(secondJobId, encodeEntropyCommitment(contribution.secret + 1n));
    }
    await advanceSeconds(entropyCommitWindow + 1n);
    for (const contribution of entropyContributors) {
      await demo.connect(contribution.actor).revealEntropy(secondJobId, contribution.secret + 1n);
    }
    await advanceSeconds(entropyRevealWindow + 1n);

    await demo.connect(agentSigner).launchValidation(secondJobId);
    const secondCommittee = await demo.getCommittee(secondJobId);

    const sentinelAddress = committee[committee.length - 1].toLowerCase();
    const nonSentinel = secondCommittee.filter((addr) => addr.toLowerCase() !== sentinelAddress);
    expect(nonSentinel.length).to.be.gte(2);

    const goodAddress = nonSentinel[0];
    const slashedAddress = nonSentinel[1];
    const goodVoter = validatorMap.get(goodAddress.toLowerCase());
    const slashedVoter = validatorMap.get(slashedAddress.toLowerCase());
    if (!goodVoter || !slashedVoter) throw new Error('missing validators');

    const goodSalt = 5001n;
    await demo
      .connect(goodVoter)
      .commitVote(secondJobId, encodeVoteCommitment(secondJobId, goodAddress, true, goodSalt));
    const badSalt = 5002n;
    await demo
      .connect(slashedVoter)
      .commitVote(secondJobId, encodeVoteCommitment(secondJobId, slashedAddress, false, badSalt));

    const remaining = secondCommittee.filter((addr) => {
      const lower = addr.toLowerCase();
      return lower !== goodAddress.toLowerCase() && lower !== slashedAddress.toLowerCase();
    });
    for (let i = 0; i < remaining.length; i += 1) {
      const addr = remaining[i];
      const signer = validatorMap.get(addr.toLowerCase());
      if (!signer) throw new Error('missing signer');
      const salt = BigInt(6000 + i);
      await demo.connect(signer).commitVote(secondJobId, encodeVoteCommitment(secondJobId, addr, true, salt));
    }

    await advanceSeconds(commitWindow + 1n);

    await demo.connect(goodVoter).revealVote(secondJobId, true, goodSalt);
    await demo.connect(slashedVoter).revealVote(secondJobId, false, badSalt);
    for (let i = 0; i < remaining.length; i += 1) {
      const addr = remaining[i];
      const signer = validatorMap.get(addr.toLowerCase());
      if (!signer) throw new Error('missing signer');
      const salt = BigInt(6000 + i);
      await demo.connect(signer).revealVote(secondJobId, true, salt);
    }

    await advanceSeconds(revealWindow + 1n);

    const stakeBeforeFalseVote = await stakeManager.stakeOf(slashedAddress);
    await demo.finalizeJob(secondJobId);
    const job = await demo.jobs(secondJobId);
    expect(job.finalized).to.be.true;
    expect(job.finalMatchesTruth).to.be.true;

    const stakeAfterFalseVote = await stakeManager.stakeOf(slashedAddress);
    expect(stakeAfterFalseVote).to.be.lt(stakeBeforeFalseVote);

    const stakePostSecondRound = await stakeManager.stakeOf(committee[committee.length - 1]);
    expect(stakePostSecondRound).to.equal(stakeAfterQuorumFailure);
  });

  it('triggers sentinel pause on budget overrun', async () => {
    const { demo, agentSigner } = await loadFixture(deployFixture);

    const jobTx = await demo
      .connect(agentSigner)
      .createJob(domainPrimary, specHash, ethers.parseEther('5'), true);
    await jobTx.wait();
    const jobId = (await demo.nextJobId()) - 1n;

    await demo.connect(agentSigner).recordExecution(jobId, ethers.parseEther('10'), 'overspend');

    const state = await demo.domains(domainPrimary);
    expect(state.paused).to.be.true;
    const job = await demo.jobs(jobId);
    expect(job.sentinelTripped).to.be.true;
  });

  it('finalises one thousand jobs through zk-batched attestation', async () => {
    const { demo, validatorMap, agentSigner, verifyingKey } = await loadFixture(deployFixture);

    await demo.configureCommitteeSize(1);
    await demo.configureThresholds(5000, 5000);
    await demo.configureWindows(3600, 3600, 3600, 3600);

    const entropyCommitWindow = BigInt(await demo.entropyCommitWindow());
    const entropyRevealWindow = BigInt(await demo.entropyRevealWindow());
    const commitWindow = BigInt(await demo.commitWindow());
    const revealWindow = BigInt(await demo.revealWindow());

    const jobIds: bigint[] = [];
    const entropyRecords: { jobId: bigint; secrets: [bigint, bigint] }[] = [];

    for (let i = 0; i < 1000; i += 1) {
      const tx = await demo
        .connect(agentSigner)
        .createJob(domainBatch, specHash, ethers.parseEther('1'), true);
      await tx.wait();
      const jobId = (await demo.nextJobId()) - 1n;
      jobIds.push(jobId);
      const secrets: [bigint, bigint] = [BigInt(1000 + i), BigInt(2000 + i)];
      entropyRecords.push({ jobId, secrets });
      await demo.connect(agentSigner).commitEntropy(jobId, encodeEntropyCommitment(secrets[0]));
      const validatorSigner = [...validatorMap.values()][0];
      await demo.connect(validatorSigner).commitEntropy(jobId, encodeEntropyCommitment(secrets[1]));
    }

    await advanceSeconds(entropyCommitWindow + 1n);

    const firstValidator = [...validatorMap.values()][0];
    for (const record of entropyRecords) {
      await demo.connect(agentSigner).revealEntropy(record.jobId, record.secrets[0]);
      await demo.connect(firstValidator).revealEntropy(record.jobId, record.secrets[1]);
    }

    await advanceSeconds(entropyRevealWindow + 1n);

    const voteSalts = new Map<bigint, bigint>();

    for (const jobId of jobIds) {
      await demo.connect(agentSigner).launchValidation(jobId);
      const committee = await demo.getCommittee(jobId);
      const validatorAddress = committee[0];
      const signer = validatorMap.get(validatorAddress.toLowerCase());
      if (!signer) throw new Error('missing signer');
      const salt = jobId + 9000n;
      voteSalts.set(jobId, salt);
      await demo
        .connect(signer)
        .commitVote(jobId, encodeVoteCommitment(jobId, validatorAddress, true, salt));
    }

    await advanceSeconds(commitWindow + 1n);

    for (const jobId of jobIds) {
      const committee = await demo.getCommittee(jobId);
      const validatorAddress = committee[0];
      const signer = validatorMap.get(validatorAddress.toLowerCase());
      if (!signer) throw new Error('missing signer');
      const salt = voteSalts.get(jobId)!;
      await demo.connect(signer).revealVote(jobId, true, salt);
    }

    await advanceSeconds(revealWindow + 1n);

    const leaves: string[] = [];
    for (const jobId of jobIds) {
      const job = await demo.jobs(jobId);
      leaves.push(
        ethers.solidityPackedKeccak256(
          ['uint256', 'bool', 'bool', 'uint32', 'uint32', 'uint32', 'uint32', 'bool'],
          [jobId, true, true, job.approvals, job.rejections, job.reveals, job.committeeSize, job.expectedResult],
        ),
      );
    }

    const tree = buildTree(leaves);
    const root = getRoot(tree);
    const witness = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'uint256', 'address', 'uint256'],
        [root, BigInt(jobIds.length), await demo.getAddress(), BigInt((await ethers.provider.getNetwork()).chainId)],
      ),
    );

    const proofBytes = ethers.hexlify(ethers.concat([verifyingKey, root, witness]));

    await demo.submitBatchProof({ jobIds, jobsRoot: root, proof: proofBytes });

    const sampleJob = await demo.jobs(jobIds[0]);
    expect(sampleJob.finalized).to.be.true;
    expect(sampleJob.finalMatchesTruth).to.be.true;
  });
});
