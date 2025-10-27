const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ShardRegistry', function () {
  const shardEarth = ethers.encodeBytes32String('EARTH');
  const shardLuna = ethers.encodeBytes32String('LUNA');
  const specHashA = ethers.keccak256(ethers.toUtf8Bytes('job-a'));
  const specHashB = ethers.keccak256(ethers.toUtf8Bytes('job-b'));

  let owner;
  let employer;
  let agent;
  let observer;
  let registry;
  let queueEarth;
  let queueLuna;

  beforeEach(async function () {
    [owner, employer, agent, observer] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/modules/ShardRegistry.sol:ShardRegistry'
    );
    registry = await Registry.deploy(owner.address);
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();

    const Queue = await ethers.getContractFactory(
      'contracts/v2/modules/ShardJobQueue.sol:ShardJobQueue'
    );
    queueEarth = await Queue.deploy(shardEarth, owner.address);
    queueLuna = await Queue.deploy(shardLuna, owner.address);
    await queueEarth.waitForDeployment();
    await queueLuna.waitForDeployment();

    await queueEarth.connect(owner).setController(registryAddress);
    await queueLuna.connect(owner).setController(registryAddress);

    await registry
      .connect(owner)
      .registerShard(shardEarth, await queueEarth.getAddress());
    await registry
      .connect(owner)
      .registerShard(shardLuna, await queueLuna.getAddress());
  });

  it('creates jobs and progresses lifecycle across shards', async function () {
    const jobRef = await registry
      .connect(employer)
      .createJob.staticCall(shardEarth, specHashA, 'ipfs://job-a');
    await registry
      .connect(employer)
      .createJob(shardEarth, specHashA, 'ipfs://job-a');

    let job = await registry.getJob([jobRef.shardId, jobRef.jobId]);
    expect(job.employer).to.equal(employer.address);
    expect(job.status).to.equal(1n); // Created

    await registry
      .connect(employer)
      .assignAgent([jobRef.shardId, jobRef.jobId], agent.address);

    job = await registry.getJob([jobRef.shardId, jobRef.jobId]);
    expect(job.agent).to.equal(agent.address);
    expect(job.status).to.equal(2n); // Assigned

    await registry.connect(agent).startJob([jobRef.shardId, jobRef.jobId]);
    job = await registry.getJob([jobRef.shardId, jobRef.jobId]);
    expect(job.status).to.equal(3n); // InProgress

    const resultHash = ethers.keccak256(ethers.toUtf8Bytes('result'));
    await registry
      .connect(agent)
      .submitResult([jobRef.shardId, jobRef.jobId], resultHash);
    job = await registry.getJob([jobRef.shardId, jobRef.jobId]);
    expect(job.status).to.equal(4n); // Submitted
    expect(job.resultHash).to.equal(resultHash);

    await registry
      .connect(employer)
      .finalizeJob([jobRef.shardId, jobRef.jobId], true);
    job = await registry.getJob([jobRef.shardId, jobRef.jobId]);
    expect(job.status).to.equal(5n); // Finalized
    expect(job.success).to.equal(true);
  });

  it('supports cross-shard linking and lookups', async function () {
    const jobEarth = await registry
      .connect(employer)
      .createJob.staticCall(shardEarth, specHashA, 'ipfs://job-earth');
    await registry
      .connect(employer)
      .createJob(shardEarth, specHashA, 'ipfs://job-earth');

    const jobLuna = await registry
      .connect(employer)
      .createJob.staticCall(shardLuna, specHashB, 'ipfs://job-luna');
    await registry
      .connect(employer)
      .createJob(shardLuna, specHashB, 'ipfs://job-luna');

    await registry
      .connect(employer)
      .linkJobs(
        [jobEarth.shardId, jobEarth.jobId],
        [jobLuna.shardId, jobLuna.jobId]
      );

    const linked = await registry.getLinkedJobs([
      jobEarth.shardId,
      jobEarth.jobId,
    ]);
    expect(linked).to.have.lengthOf(1);
    expect(linked[0].shardId).to.equal(jobLuna.shardId);
    expect(linked[0].jobId).to.equal(jobLuna.jobId);
  });

  it('enforces owner controls for pause and parameter updates', async function () {
    await registry.connect(owner).pauseShard(shardEarth);

    await expect(
      registry
        .connect(employer)
        .createJob(shardEarth, specHashA, 'ipfs://paused')
    )
      .to.be.revertedWithCustomError(registry, 'ShardPausedError')
      .withArgs(shardEarth);

    await registry.connect(owner).unpauseShard(shardEarth);

    await registry
      .connect(owner)
      .setShardParameters(shardEarth, [1_000n, 3600, 5, 2]);

    const params = await queueEarth.getJobParameters();
    expect(params.maxReward).to.equal(1_000n);
    expect(params.maxDuration).to.equal(3600);
    expect(params.maxOpenJobs).to.equal(5);
    expect(params.maxActiveJobs).to.equal(2);

    const usage = await registry.getShardUsage(shardEarth);
    expect(usage[0]).to.equal(0);
    expect(usage[1]).to.equal(0);

    await registry.connect(owner).pause();
    await expect(
      registry
        .connect(employer)
        .createJob(shardEarth, specHashA, 'ipfs://globally-paused')
    ).to.be.revertedWithCustomError(registry, 'EnforcedPause');

    await registry.connect(owner).unpause();
  });

  it('enforces shard job and concurrency quotas', async function () {
    await registry
      .connect(owner)
      .setShardParameters(shardEarth, [1_000n, 3600, 1, 0]);

    const limitedRef = await registry
      .connect(employer)
      .createJob.staticCall(shardEarth, specHashA, 'ipfs://open-limit');
    await registry
      .connect(employer)
      .createJob(shardEarth, specHashA, 'ipfs://open-limit');

    await expect(
      registry
        .connect(employer)
        .createJob(shardEarth, specHashB, 'ipfs://open-limit-two')
    )
      .to.be.revertedWithCustomError(queueEarth, 'OpenJobsQuotaExceeded')
      .withArgs(1);

    await registry
      .connect(employer)
      .cancelJob([limitedRef.shardId, limitedRef.jobId]);

    await registry
      .connect(owner)
      .setShardParameters(shardEarth, [1_000n, 3600, 2, 1]);

    const firstRef = await registry
      .connect(employer)
      .createJob.staticCall(shardEarth, specHashA, 'ipfs://job-one');
    await registry
      .connect(employer)
      .createJob(shardEarth, specHashA, 'ipfs://job-one');
    const secondRef = await registry
      .connect(employer)
      .createJob.staticCall(shardEarth, specHashB, 'ipfs://job-two');
    await registry
      .connect(employer)
      .createJob(shardEarth, specHashB, 'ipfs://job-two');

    await registry
      .connect(employer)
      .assignAgent([firstRef.shardId, firstRef.jobId], agent.address);

    await expect(
      registry
        .connect(employer)
        .assignAgent([secondRef.shardId, secondRef.jobId], agent.address)
    )
      .to.be.revertedWithCustomError(queueEarth, 'ActiveJobsQuotaExceeded')
      .withArgs(1);

    await registry
      .connect(agent)
      .startJob([firstRef.shardId, firstRef.jobId]);
    await registry
      .connect(agent)
      .submitResult([
        firstRef.shardId,
        firstRef.jobId,
      ], ethers.keccak256(ethers.toUtf8Bytes('done')));
    await registry
      .connect(employer)
      .finalizeJob([firstRef.shardId, firstRef.jobId], true);

    const usage = await registry.getShardUsage(shardEarth);
    expect(usage[0]).to.equal(1);
    expect(usage[1]).to.equal(0);
  });

  it('blocks unauthorized governance calls', async function () {
    await expect(
      registry
        .connect(employer)
        .setShardParameters(shardEarth, [0n, 0, 0, 0])
    ).to.be.revertedWithCustomError(registry, 'NotGovernance');

    await expect(
      registry.connect(employer).pauseShard(shardEarth)
    ).to.be.revertedWithCustomError(registry, 'NotGovernance');
  });
});
