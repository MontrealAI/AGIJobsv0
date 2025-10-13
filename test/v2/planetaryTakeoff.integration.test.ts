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

type JobExecution = {
  jobId: number;
  fee: bigint;
  netReward: bigint;
};

describe('Planetary-scale ASI take-off demo', function () {
  const initialMint = ethers.parseUnits('100000', AGIALPHA_DECIMALS);
  const stakeRequirement = ethers.parseUnits('500', AGIALPHA_DECIMALS);
  const initialFeePct = 5n;
  const escalatedFeePct = 8n;

  let owner: any;
  let asia: any;
  let europe: any;
  let planner: any;
  let validatorA: any;
  let validatorB: any;
  let treasury: any;
  let africa: any;

  let token: any;
  let stakeManager: any;
  let validation: any;
  let reputation: any;
  let nft: any;
  let registry: any;
  let dispute: any;
  let feePool: any;
  let policy: any;
  let identity: any;

  const validatorSet = () => [validatorA.address, validatorB.address];

  const calculateFee = (reward: bigint, pct: bigint) => (reward * pct) / 100n;

  beforeEach(async function () {
    [
      owner,
      asia,
      europe,
      planner,
      validatorA,
      validatorB,
      treasury,
      africa,
    ] = await ethers.getSigners();

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

    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    for (const participant of [
      owner,
      asia,
      europe,
      planner,
      validatorA,
      validatorB,
      treasury,
      africa,
    ]) {
      await token.mint(participant.address, initialMint);
    }

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await Stake.deploy(
      0,
      10_000,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.waitForDeployment();
    await stakeManager.connect(owner).setMinStake(1);
    await token.mint(await stakeManager.getAddress(), 0);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await Validation.deploy();
    await validation.waitForDeployment();

    const Reputation = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    reputation = await Reputation.deploy(await stakeManager.getAddress());
    await reputation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setReputationEngine(await reputation.getAddress());
    await identity.addAdditionalAgent(asia.address);
    await identity.addAdditionalAgent(europe.address);
    await identity.addAdditionalAgent(africa.address);
    await identity.addAdditionalAgent(planner.address);
    await identity.addAdditionalValidator(validatorA.address);
    await identity.addAdditionalValidator(validatorB.address);

    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('ASI Certificate', 'ASICERT');
    await nft.waitForDeployment();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    await registry.waitForDeployment();

    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress,
      owner.address
    );
    await dispute.waitForDeployment();
    await dispute
      .connect(owner)
      .setStakeManager(await stakeManager.getAddress());

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.waitForDeployment();
    await feePool.setBurnPct(0);

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy(
      'ipfs://planetary-tax-policy',
      'All participating agents bear their own jurisdictional taxes.'
    );
    await policy.waitForDeployment();

    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await reputation.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress(),
        await feePool.getAddress(),
        []
      );
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await registry
      .connect(owner)
      .setJobParameters(0, stakeRequirement);
    await registry.connect(owner).setFeePct(Number(initialFeePct));
    await registry.connect(owner).setValidatorRewardPct(0);
    await reputation
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);

    await policy
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);

    await validation.setJobRegistry(await registry.getAddress());
    await validation.setValidators(validatorSet());

    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());
    await stakeManager
      .connect(owner)
      .setDisputeModule(await dispute.getAddress());
    await stakeManager
      .connect(owner)
      .setFeePool(await feePool.getAddress());
    await stakeManager
      .connect(owner)
      .setFeePct(Number(initialFeePct));
    await stakeManager
      .connect(owner)
      .setSlashingPercentages(100, 0);
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);
    await stakeManager.connect(owner).setTreasury(treasury.address);

    await nft
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await nft
      .connect(owner)
      .setStakeManager(await stakeManager.getAddress());
    await nft
      .connect(owner)
      .transferOwnership(await registry.getAddress());

    for (const agent of [asia, europe, africa, planner]) {
      await registry.connect(agent).acknowledgeTaxPolicy();
      await token
        .connect(agent)
        .approve(await stakeManager.getAddress(), stakeRequirement);
      await stakeManager
        .connect(agent)
        .depositStake(Role.Agent, stakeRequirement);
    }
  });

  async function createAndFinalizeJob(params: {
    agent: any;
    reward: bigint;
    subdomain: string;
    resultLabel: string;
    feePct: bigint;
  }): Promise<JobExecution> {
    const { agent, reward, subdomain, resultLabel, feePct } = params;
    const fee = calculateFee(reward, feePct);
    const netReward = reward;
    const deadline = BigInt((await time.latest()) + 7 * 24 * 60 * 60);
    const specHash = ethers.id(`spec:${resultLabel}`);
    const resultHash = ethers.id(`result:${resultLabel}`);
    const uri = `ipfs://${resultLabel}`;

    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), reward + fee);
    const tx = await registry
      .connect(owner)
      .createJob(reward, deadline, specHash, uri);
    const receipt = await tx.wait();
    const parsedLog = receipt.logs
      .map((log: any) => {
        try {
          return registry.interface.parseLog(log);
        } catch (err) {
          return undefined;
        }
      })
      .find((log: any) => log && log.name === 'JobCreated');
    if (!parsedLog) {
      throw new Error('JobCreated event not found');
    }
    const jobId = Number(parsedLog.args.jobId);

    await registry.connect(agent).applyForJob(jobId, subdomain, []);
    await registry
      .connect(agent)
      .submit(jobId, resultHash, uri, subdomain, []);
    await validation.setResult(true);
    await validation.finalize(jobId);
    await registry.connect(owner).finalize(jobId);

    return { jobId, fee, netReward };
  }

  it('balances planetary energy supply with on-chain governance', async function () {
    await registry.connect(owner).pause();
    await registry.connect(owner).unpause();

    const rewardAsia = ethers.parseUnits('1100', AGIALPHA_DECIMALS);
    const rewardEurope = ethers.parseUnits('900', AGIALPHA_DECIMALS);
    const rewardAfrica = ethers.parseUnits('950', AGIALPHA_DECIMALS);
    const rewardPlan = ethers.parseUnits('1500', AGIALPHA_DECIMALS);
    const rewardExecute = ethers.parseUnits('1200', AGIALPHA_DECIMALS);

    const asiaAssessment = await createAndFinalizeJob({
      agent: asia,
      reward: rewardAsia,
      subdomain: 'asia.grid.agent',
      resultLabel: 'surplus-asia-report',
      feePct: initialFeePct,
    });

    const europeAssessment = await createAndFinalizeJob({
      agent: europe,
      reward: rewardEurope,
      subdomain: 'europe.grid.agent',
      resultLabel: 'deficit-europe-report',
      feePct: initialFeePct,
    });

    const africaDeployment = await createAndFinalizeJob({
      agent: africa,
      reward: rewardAfrica,
      subdomain: 'africa.grid.agent',
      resultLabel: 'surge-africa-rollout',
      feePct: initialFeePct,
    });

    await registry.connect(owner).setFeePct(Number(escalatedFeePct));

    const planetaryLedger = await createAndFinalizeJob({
      agent: planner,
      reward: rewardPlan,
      subdomain: 'planetary.planner.agent',
      resultLabel: 'planetary-ledger-plan',
      feePct: escalatedFeePct,
    });

    const liquidityExecution = await createAndFinalizeJob({
      agent: asia,
      reward: rewardExecute,
      subdomain: 'asia.grid.agent',
      resultLabel: 'execute-liquidity-cycle',
      feePct: escalatedFeePct,
    });

    const asiaBalance = await token.balanceOf(asia.address);
    const europeBalance = await token.balanceOf(europe.address);
    const africaBalance = await token.balanceOf(africa.address);
    const plannerBalance = await token.balanceOf(planner.address);

    const asiaExpected =
      initialMint - stakeRequirement + asiaAssessment.netReward + liquidityExecution.netReward;
    expect(asiaBalance).to.equal(asiaExpected);

    const europeExpected = initialMint - stakeRequirement + europeAssessment.netReward;
    expect(europeBalance).to.equal(europeExpected);

    const africaExpected = initialMint - stakeRequirement + africaDeployment.netReward;
    expect(africaBalance).to.equal(africaExpected);

    const plannerExpected = initialMint - stakeRequirement + planetaryLedger.netReward;
    expect(plannerBalance).to.equal(plannerExpected);

    const totalFees =
      asiaAssessment.fee +
      europeAssessment.fee +
      africaDeployment.fee +
      planetaryLedger.fee +
      liquidityExecution.fee;
    expect(await feePool.pendingFees()).to.equal(totalFees);

    const jobSummaries = [
      { summary: asiaAssessment, expectedFee: initialFeePct },
      { summary: europeAssessment, expectedFee: initialFeePct },
      { summary: africaDeployment, expectedFee: initialFeePct },
      { summary: planetaryLedger, expectedFee: escalatedFeePct },
      { summary: liquidityExecution, expectedFee: escalatedFeePct },
    ];

    for (const { summary, expectedFee } of jobSummaries) {
      const job = await registry.jobs(summary.jobId);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6);
      expect(metadata.success).to.equal(true);
      expect(metadata.feePct).to.equal(expectedFee);
    }

    expect(await stakeManager.stakes(asia.address, Role.Agent)).to.equal(stakeRequirement);
    expect(await stakeManager.stakes(europe.address, Role.Agent)).to.equal(stakeRequirement);
    expect(await stakeManager.stakes(africa.address, Role.Agent)).to.equal(stakeRequirement);
    expect(await stakeManager.stakes(planner.address, Role.Agent)).to.equal(stakeRequirement);

    expect(await stakeManager.treasury()).to.equal(treasury.address);
    expect(await registry.feePct()).to.equal(escalatedFeePct);
    expect(await reputation.reputation(asia.address)).to.be.gt(0);
    expect(await reputation.reputation(planner.address)).to.be.gt(0);
  });
});
