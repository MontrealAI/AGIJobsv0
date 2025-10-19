import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { artifacts, ethers, network } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

import scenarioJson from '../data/scenario.json';
import {
  AGIALPHA,
  AGIALPHA_DECIMALS,
  PROTOCOL_FEE_PCT_BASIS_POINTS,
  PROTOCOL_FEE_PCT_PERCENT,
} from '../../../scripts/constants';
import {
  computeEnergyMetrics,
  computeValidatorEntropy,
  toPrecision,
  type GovernanceScenario,
} from '../../../apps/enterprise-portal/src/lib/agiGovernanceAnalytics';
import {
  createOwnerAction,
  createTimelineEvent,
  type GovernanceEnergyMetrics,
  type GovernanceJobRecord,
  type GovernanceOwnerAction,
  type GovernanceTimelineEvent,
  type GovernanceTranscript,
  type GovernanceValidatorRecord,
} from '../lib/transcript';

const STAKE_ROLE_AGENT = 0;
const STAKE_ROLE_VALIDATOR = 1;
const SUBDOMAIN_AGENT = 'policy-author';
const SUBDOMAIN_VALIDATOR_A = 'validator-a';
const SUBDOMAIN_VALIDATOR_B = 'validator-b';
const SUBDOMAIN_VALIDATOR_C = 'validator-c';

const scenario = scenarioJson as GovernanceScenario;
const validatorPoolSize = scenario.validators.length;
const minValidatorsRequired = Math.max(
  3,
  scenario.owner.initialApprovals + 1,
  validatorPoolSize
);
const maxValidatorsAllowed = Math.max(minValidatorsRequired, validatorPoolSize);
const feePctBasisPoints = BigInt(PROTOCOL_FEE_PCT_BASIS_POINTS ?? 0);
const feePctPercent = Number(PROTOCOL_FEE_PCT_PERCENT ?? 0);

function buildCommit(
  jobId: bigint,
  nonce: bigint,
  approve: boolean,
  burnHash: string,
  salt: Uint8Array,
  specHash: string
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [jobId, nonce, approve, burnHash, salt, specHash]
    )
  );
}

async function main() {
  const runStartedAt = Date.now();
  await network.provider.request({ method: 'hardhat_reset', params: [] });

  const [
    owner,
    nationA,
    nationB,
    nationC,
    policyAuthor,
    validatorA,
    validatorB,
    validatorC,
    treasury,
  ] = await ethers.getSigners();

  const tokenArtifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    tokenArtifact.deployedBytecode,
  ]);
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(owner.address, 32);
  await network.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerValue,
  ]);

  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
  const initialMint = ethers.parseUnits('1000000', AGIALPHA_DECIMALS);
  for (const account of [
    owner,
    nationA,
    nationB,
    nationC,
    policyAuthor,
    validatorA,
    validatorB,
    validatorC,
  ]) {
    await token.mint(account.address, initialMint);
  }

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stakeManager = await StakeManager.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await stakeManager.waitForDeployment();
  await stakeManager.connect(owner).setMinStake(1);
  await token
    .connect(owner)
    .mint(await stakeManager.getAddress(), ethers.parseUnits('1', 0));

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stakeManager.getAddress());
  await reputation.waitForDeployment();

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
  );
  const identity = await Identity.deploy();
  await identity.waitForDeployment();
  await identity.connect(owner).setResult(false);

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stakeManager.getAddress(),
    scenario.owner.initialCommitWindowSeconds,
    scenario.owner.initialRevealWindowSeconds,
    minValidatorsRequired,
    maxValidatorsAllowed,
    []
  );
  await validation.waitForDeployment();
  const validationAddress = await validation.getAddress();

  const Certificate = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const certificates = await Certificate.deploy('AGI Certificate', 'AGICERT');
  await certificates.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await certificates.getAddress(),
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
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    treasury.address,
    owner.address
  );
  await dispute.waitForDeployment();

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stakeManager.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await feePool.waitForDeployment();
  await feePool.setBurnPct(0);

  const HamiltonianMonitor = await ethers.getContractFactory(
    'contracts/v2/HamiltonianMonitor.sol:HamiltonianMonitor'
  );
  const monitor = await HamiltonianMonitor.deploy(12, owner.address);
  await monitor.waitForDeployment();

  await stakeManager
    .connect(owner)
    .setModules(await registry.getAddress(), await dispute.getAddress());
  await stakeManager
    .connect(owner)
    .setValidationModule(await validation.getAddress());
  await stakeManager
    .connect(owner)
    .setDisputeModule(await dispute.getAddress());
  await stakeManager
    .connect(owner)
    .setSlashingPercentages(100, 0);
  await stakeManager
    .connect(owner)
    .setHamiltonianFeed(await monitor.getAddress());

  await validation.connect(owner).setJobRegistry(await registry.getAddress());
  await validation.connect(owner).setIdentityRegistry(await identity.getAddress());
  await validation.connect(owner).setStakeManager(await stakeManager.getAddress());
  await validation
    .connect(owner)
    .setReputationEngine(await reputation.getAddress());
  await validation
    .connect(owner)
    .setValidatorPool([
      validatorA.address,
      validatorB.address,
      validatorC.address,
    ]);
  await validation
    .connect(owner)
    .setValidatorsPerJob(validatorPoolSize);

  await registry.connect(owner).setModules(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificates.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
  await registry.connect(owner).setValidatorRewardPct(0);
  await registry.connect(owner).setFeePct(feePctPercent);
  await registry.connect(owner).setJobParameters(0, 0);

  await certificates
    .connect(owner)
    .setJobRegistry(await registry.getAddress());
  await certificates
    .connect(owner)
    .setStakeManager(await stakeManager.getAddress());

  await reputation.connect(owner).setCaller(await registry.getAddress(), true);
  await reputation
    .connect(owner)
    .setCaller(await validation.getAddress(), true);

  await identity.connect(owner).addAdditionalAgent(nationA.address);
  await identity.connect(owner).addAdditionalAgent(nationB.address);
  await identity.connect(owner).addAdditionalAgent(nationC.address);
  await identity.connect(owner).addAdditionalAgent(policyAuthor.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorA.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorB.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorC.address);
  await identity
    .connect(owner)
    .setAgentType(policyAuthor.address, 0);

  const timeline: GovernanceTimelineEvent[] = [];
  const ownerActions: GovernanceOwnerAction[] = [];
  const validatorStats = new Map<string, GovernanceValidatorRecord>();

  const validatorStakeAmount = ethers.parseUnits(
    scenario.owner.minStake.toString(),
    AGIALPHA_DECIMALS
  );
  const participants = [
    [policyAuthor, STAKE_ROLE_AGENT, SUBDOMAIN_AGENT],
    [validatorA, STAKE_ROLE_VALIDATOR, SUBDOMAIN_VALIDATOR_A],
    [validatorB, STAKE_ROLE_VALIDATOR, SUBDOMAIN_VALIDATOR_B],
    [validatorC, STAKE_ROLE_VALIDATOR, SUBDOMAIN_VALIDATOR_C],
  ] as const;

  for (const [actor, role] of participants) {
    await token
      .connect(actor)
      .approve(await stakeManager.getAddress(), validatorStakeAmount);
    const tx = await stakeManager
      .connect(actor)
      .depositStake(role, validatorStakeAmount);
    await tx.wait();
    timeline.push(
      createTimelineEvent({
        actor: actor.address,
        label: `Stake ${ethers.formatUnits(
          validatorStakeAmount,
          AGIALPHA_DECIMALS
        )} $AGIALPHA`,
        category: 'stake',
        notes: `role=${role === STAKE_ROLE_AGENT ? 'agent' : 'validator'}`,
      })
    );

    if (role === STAKE_ROLE_VALIDATOR) {
      validatorStats.set(actor.address, {
        id: actor.address,
        address: actor.address,
        stake: ethers.formatUnits(validatorStakeAmount, AGIALPHA_DECIMALS),
        approvals: 0,
        rejections: 0,
        commits: 0,
        reveals: 0,
        antifragility: 0,
      });
    }
  }

  const nations = [nationA, nationB, nationC];
  const nationScenarios = scenario.nations;
  const validatorSubdomains = [
    SUBDOMAIN_VALIDATOR_A,
    SUBDOMAIN_VALIDATOR_B,
    SUBDOMAIN_VALIDATOR_C,
  ];
  const validators = [validatorA, validatorB, validatorC];

    const jobs: GovernanceJobRecord[] = [];
  const totalStakeLocked =
    Number(ethers.formatUnits(validatorStakeAmount, AGIALPHA_DECIMALS)) *
    participants.length;

  let jobIndex = 0;
  const approvalHistory: number[] = [];

  for (const nationConfig of nationScenarios) {
    const employer = nations[jobIndex] ?? nationA;
    const jobId = jobIndex + 1;
    const reward = ethers.parseUnits(
      nationConfig.reward.toString(),
      AGIALPHA_DECIMALS
    );
    const feeAmount = (reward * feePctBasisPoints) / 10000n;
    const totalFunding = reward + feeAmount;
    const specPayload = {
      title: nationConfig.label,
      summary: nationConfig.summary,
      uri: nationConfig.uri,
    };
    const specHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(specPayload))
    );
    const resultUri = `${nationConfig.uri}/result`; // deterministic placeholder
    const resultHash = ethers.id(resultUri);
    const burnHash = ethers.keccak256(
      ethers.toUtf8Bytes(`${nationConfig.id}-burn-evidence`)
    );

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), totalFunding);
    const createTx = await registry
      .connect(employer)
      .createJob(
        reward,
        BigInt((await time.latest()) + Math.round(nationConfig.deadlineHours * 3600)),
        specHash,
        nationConfig.uri
      );
    await createTx.wait();

    timeline.push(
      createTimelineEvent({
        actor: employer.address,
        label: `Create policy mission ${nationConfig.label}`,
        category: 'policy',
        jobId,
        txHash: createTx.hash,
      })
    );

    const applyTx = await registry
      .connect(policyAuthor)
      .applyForJob(jobId, SUBDOMAIN_AGENT, []);
    await applyTx.wait();
    timeline.push(
      createTimelineEvent({
        actor: policyAuthor.address,
        label: `Apply as drafter for job ${jobId}`,
        category: 'policy',
        jobId,
        txHash: applyTx.hash,
      })
    );

    const submitTx = await registry
      .connect(policyAuthor)
      .submit(jobId, resultHash, resultUri, SUBDOMAIN_AGENT, []);
    await submitTx.wait();
    timeline.push(
      createTimelineEvent({
        actor: policyAuthor.address,
        label: `Submit policy deliverable for job ${jobId}`,
        category: 'policy',
        jobId,
        txHash: submitTx.hash,
      })
    );

    const burnTx = await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnHash, 0, 0);
    await burnTx.wait();
    timeline.push(
      createTimelineEvent({
        actor: employer.address,
        label: `Register burn receipt for job ${jobId}`,
        category: 'policy',
        jobId,
        txHash: burnTx.hash,
      })
    );

    await time.increase(1);
    const selectTx = await validation.selectValidators(jobId, 0);
    await selectTx.wait();
    timeline.push(
      createTimelineEvent({
        actor: validationAddress,
        label: `Select validators for job ${jobId}`,
        category: 'validation',
        jobId,
        txHash: selectTx.hash,
      })
    );

    const nonce = await validation.jobNonce(jobId);
    const approvals = [] as boolean[];
    const commitRecords: Array<{
      index: number;
      salt: Uint8Array;
      approve: boolean;
    }> = [];

    for (let i = 0; i < validators.length; i += 1) {
      const validator = validators[i];
      const approve = true; // positive outcome for baseline
      approvals.push(approve);
      const salt = ethers.randomBytes(32);
      const commit = buildCommit(
        BigInt(jobId),
        nonce,
        approve,
        burnHash,
        salt,
        specHash
      );
      const commitTx = await validation
        .connect(validator)
        .commitValidation(jobId, commit, validatorSubdomains[i], []);
      await commitTx.wait();
      timeline.push(
        createTimelineEvent({
          actor: validator.address,
          label: `Commit validation (${approve ? 'approve' : 'reject'})`,
          category: 'validation',
          jobId,
          txHash: commitTx.hash,
        })
      );
      const stats = validatorStats.get(validator.address);
      if (stats) {
        stats.commits += 1;
      }
      commitRecords.push({ index: i, salt, approve });
    }

    const roundAfterCommits = await validation.rounds(jobId);
    const commitDeadline = BigInt(roundAfterCommits.commitDeadline);
    const nowAfterCommits = BigInt(await time.latest());
    const waitUntilRevealStart = commitDeadline - nowAfterCommits + 1n;
    if (waitUntilRevealStart > 0n) {
      await time.increase(Number(waitUntilRevealStart));
    }

    for (const record of commitRecords) {
      const validator = validators[record.index];
      const revealTx = await validation
        .connect(validator)
        .revealValidation(
          jobId,
          record.approve,
          burnHash,
          record.salt,
          validatorSubdomains[record.index],
          []
        );
      await revealTx.wait();
      timeline.push(
        createTimelineEvent({
          actor: validator.address,
          label: `Reveal validation (${record.approve ? 'approve' : 'reject'})`,
          category: 'validation',
          jobId,
          txHash: revealTx.hash,
        })
      );
      const stats = validatorStats.get(validator.address);
      if (stats) {
        stats.reveals += 1;
        if (record.approve) {
          stats.approvals += 1;
        } else {
          stats.rejections += 1;
        }
      }
    }

    const round = await validation.rounds(jobId);
    const now = BigInt(await time.latest());
    const waitForFinalize = round.revealDeadline - now + 1n;
    if (waitForFinalize > 0n) {
      await time.increase(Number(waitForFinalize));
    }

    const finalizeTx = await validation.finalize(jobId);
    await finalizeTx.wait();
    timeline.push(
      createTimelineEvent({
        actor: validationAddress,
        label: `Finalize validation for job ${jobId}`,
        category: 'validation',
        jobId,
        txHash: finalizeTx.hash,
      })
    );

    const confirmTx = await registry
      .connect(employer)
      .confirmEmployerBurn(jobId, burnHash);
    await confirmTx.wait();
    const registryFinalize = await registry
      .connect(employer)
      .finalize(jobId);
    await registryFinalize.wait();
    timeline.push(
      createTimelineEvent({
        actor: employer.address,
        label: `Settle policy mission ${jobId}`,
        category: 'policy',
        jobId,
        txHash: registryFinalize.hash,
      })
    );

    approvalHistory.push(approvals.filter(Boolean).length);

    const job = await registry.jobs(jobId);
    const metadata = await registry.decodeJobMetadata(job.packedMetadata);

      jobs.push({
        id: jobId,
        nationId: nationConfig.id,
        nationLabel: nationConfig.label,
        employer: job.employer,
        agent: job.agent,
        reward: ethers.formatUnits(job.reward, AGIALPHA_DECIMALS),
        feePct: `${feePctPercent}%`,
        deadline: new Date(Number(metadata.deadline) * 1000).toISOString(),
        specHash: job.specHash,
        resultHash: job.resultHash,
        burnHash,
        approvals: approvals.filter(Boolean).length,
        validators: approvals.length,
      status: metadata.success ? 'FinalizedSuccess' : 'Finalized',
      entropy: nationConfig.entropy,
      dissipation: nationConfig.dissipation,
    });

    jobIndex += 1;

    if (jobIndex === 1) {
      const pauseTx = await registry.connect(owner).pause();
      await pauseTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Pause job registry',
          txHash: pauseTx.hash,
          before: { paused: 'false' },
          after: { paused: 'true' },
        })
      );
      timeline.push(
        createTimelineEvent({
          actor: owner.address,
          label: 'Owner pauses platform',
          category: 'owner',
          notes: 'Global pause engaged to audit validator performance.',
        })
      );

      const unpauseTx = await registry.connect(owner).unpause();
      await unpauseTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Resume job registry',
          txHash: unpauseTx.hash,
          before: { paused: 'true' },
          after: { paused: 'false' },
        })
      );
      timeline.push(
        createTimelineEvent({
          actor: owner.address,
          label: 'Owner resumes operations',
          category: 'owner',
          notes: 'Pause lifted after cross-checking validator quorum.',
        })
      );

      const prevApprovals = await validation.requiredValidatorApprovals();
      const quorumTx = await validation
        .connect(owner)
        .setRequiredValidatorApprovals(scenario.owner.upgradedApprovals);
      await quorumTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Tighten validator quorum',
          txHash: quorumTx.hash,
          before: { approvals: prevApprovals.toString() },
          after: { approvals: scenario.owner.upgradedApprovals.toString() },
        })
      );
      timeline.push(
        createTimelineEvent({
          actor: owner.address,
          label: 'Owner increases required validator approvals',
          category: 'owner',
          notes: `Quorum raised from ${prevApprovals} to ${scenario.owner.upgradedApprovals}.`,
        })
      );

      const prevCommit = await validation.commitWindow();
      const commitTx = await validation
        .connect(owner)
        .setCommitWindow(scenario.owner.postUpgradeCommitWindowSeconds);
      await commitTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Extend commit window',
          txHash: commitTx.hash,
          before: { seconds: prevCommit.toString() },
          after: {
            seconds: scenario.owner.postUpgradeCommitWindowSeconds.toString(),
          },
        })
      );
      timeline.push(
        createTimelineEvent({
          actor: owner.address,
          label: 'Owner extends commit window',
          category: 'owner',
          notes: 'Allows validators more time to absorb macro telemetry.',
        })
      );

      const prevReveal = await validation.revealWindow();
      const revealTx = await validation
        .connect(owner)
        .setRevealWindow(scenario.owner.postUpgradeRevealWindowSeconds);
      await revealTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Extend reveal window',
          txHash: revealTx.hash,
          before: { seconds: prevReveal.toString() },
          after: {
            seconds: scenario.owner.postUpgradeRevealWindowSeconds.toString(),
          },
        })
      );
      timeline.push(
        createTimelineEvent({
          actor: owner.address,
          label: 'Owner extends reveal window',
          category: 'owner',
          notes: 'Matches validators to the new Hamiltonian cadence.',
        })
      );

      const prevStake = await stakeManager.minStake();
      const minStakeTx = await stakeManager
        .connect(owner)
        .setMinStake(
          ethers.parseUnits(
            scenario.owner.minStake.toString(),
            AGIALPHA_DECIMALS
          )
        );
      await minStakeTx.wait();
      ownerActions.push(
        createOwnerAction({
          at: new Date().toISOString(),
          label: 'Reaffirm minimum stake',
          txHash: minStakeTx.hash,
          before: { minStake: ethers.formatUnits(prevStake, AGIALPHA_DECIMALS) },
          after: {
            minStake: scenario.owner.minStake.toString(),
          },
        })
      );
    }
  }

  const validatorEntropy = computeValidatorEntropy(scenario.validators);
  const totalRewardsTokens = nationScenarios.reduce(
    (acc, nation) => acc + nation.reward,
    0
  );
  const totalRewards = totalRewardsTokens;
  const totalFees = (totalRewards * feePctPercent) / 100;
  const validatorCooperation =
    approvalHistory.reduce((sum, approvals) => sum + approvals, 0) /
    (approvalHistory.length * validators.length);

  const energy: GovernanceEnergyMetrics = computeEnergyMetrics({
    temperatureKelvin: scenario.temperatureKelvin,
    lambda: scenario.lambda,
    landauerMultiplier: scenario.landauerMultiplier,
    discountFactor: scenario.discountFactor,
    totalRewards,
    treasuryInflows: totalFees,
    stakeLocked: totalStakeLocked,
    validatorEntropy,
    validatorCooperation,
    dissipationVector: nationScenarios.map((nation) => nation.dissipation),
  });

  const previousHamiltonian = await monitor.currentHamiltonian();
  const scaledD = BigInt(
    Math.max(0, Math.round(Math.abs(energy.dissipation) * 1e6))
  );
  const scaledU = BigInt(
    Math.max(0, Math.round(Math.abs(energy.energyBudget) * 1e6))
  );
  const recordTx = await monitor.connect(owner).record(scaledD, scaledU);
  await recordTx.wait();
  const updatedHamiltonian = await monitor.currentHamiltonian();
  ownerActions.push(
    createOwnerAction({
      at: new Date().toISOString(),
      label: 'Update Hamiltonian monitor',
      txHash: recordTx.hash,
      before: { hamiltonian: previousHamiltonian.toString() },
      after: { hamiltonian: updatedHamiltonian.toString() },
    })
  );
  timeline.push(
    createTimelineEvent({
      actor: owner.address,
      label: 'Owner records Hamiltonian telemetry',
      category: 'analytics',
      txHash: recordTx.hash,
      notes: `ΔH=${(updatedHamiltonian - previousHamiltonian).toString()}`,
    })
  );

  for (const stats of validatorStats.values()) {
    const activity = stats.commits === 0 ? 0 : stats.approvals / stats.commits;
    stats.antifragility = toPrecision(
      energy.antifragilityScore * 0.5 + activity * 0.5,
      4
    );
  }

  const transcript: GovernanceTranscript = {
    version: scenario.version,
    generatedAt: new Date().toISOString(),
    network: 'hardhat',
    scenario,
    platform: {
      token: AGIALPHA,
      stakingTokenSymbol: '$AGIALPHA',
      stakeManager: await stakeManager.getAddress(),
      jobRegistry: await registry.getAddress(),
      validationModule: await validation.getAddress(),
      reputationEngine: await reputation.getAddress(),
      disputeModule: await dispute.getAddress(),
      certificate: await certificates.getAddress(),
      feePool: await feePool.getAddress(),
      owner: owner.address,
      treasury: treasury.address,
      feePct: `${feePctPercent}%`,
      requiredApprovals: scenario.owner.upgradedApprovals.toString(),
      validatorsPerJob: validators.length.toString(),
      commitWindow: scenario.owner.postUpgradeCommitWindowSeconds.toString(),
      revealWindow: scenario.owner.postUpgradeRevealWindowSeconds.toString(),
      minStake: scenario.owner.minStake.toString(),
      hamiltonianThreshold: scenario.owner.hamiltonianThreshold.toString(),
      hamiltonianWeight: scenario.owner.hamiltonianWeight.toString(),
    },
    energy,
    jobs,
    validators: Array.from(validatorStats.values()),
    ownerActions,
    timeline,
    metrics: {
      cooperationIndex: toPrecision(validatorCooperation, 4),
      treasuryInflows: toPrecision(totalFees, 4),
      stakeLocked: toPrecision(totalStakeLocked, 4),
      rewardDisbursed: toPrecision(totalRewards, 4),
    },
    script: {
      runId: randomUUID(),
      durationMs: Date.now() - runStartedAt,
    },
  };

  const outputPath = path.join(__dirname, '..', 'export', 'latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(transcript, null, 2));

  console.log('α-governance rehearsal complete.');
  console.log(
    `  Jobs finalised: ${jobs.length} | Validators: ${validators.length} | Cooperation index: ${transcript.metrics.cooperationIndex}`
  );
  console.log(
    `  Gibbs free energy: ${toPrecision(energy.gibbsFreeEnergy, 4)} | Hamiltonian: ${toPrecision(energy.hamiltonian, 4)} | Landauer bound (scaled): ${toPrecision(energy.landauerBound, 6)}`
  );
  console.log(`  Transcript written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
