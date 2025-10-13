#!/usr/bin/env ts-node

interface EarlyCliParseResult {
  network?: string;
  rest: string[];
}

function consumeNetworkFlag(argv: string[]): EarlyCliParseResult {
  const rest: string[] = [];
  let networkName: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--network') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for --network flag');
      }
      networkName = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--network=')) {
      networkName = arg.slice('--network='.length);
      continue;
    }
    rest.push(arg);
  }
  return { network: networkName, rest };
}

const rawCliArgs = process.argv.slice(2);
const { network: selectedNetwork, rest: sanitizedCliArgs } =
  consumeNetworkFlag(rawCliArgs);
if (selectedNetwork && !process.env.HARDHAT_NETWORK) {
  process.env.HARDHAT_NETWORK = selectedNetwork;
}
const CLI_ARGS = sanitizedCliArgs;

import hre from 'hardhat';
import type { HardhatEthersHelpers } from '@nomicfoundation/hardhat-ethers/types';
import type { ContractTransactionResponse } from 'ethers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS, AGIALPHA_SYMBOL } from '../constants';

const { artifacts, network } = hre;
const ethers = (
  hre as typeof hre & {
    ethers: typeof import('ethers') & HardhatEthersHelpers;
  }
).ethers;

type StepStatus = 'pass' | 'fail';

interface StepReport {
  id: string;
  label: string;
  status: StepStatus;
  txHash?: string;
  gasUsed?: string;
  actor?: string;
  notes: string[];
  error?: string;
}

interface ScenarioReport {
  id: string;
  label: string;
  status: StepStatus;
  steps: StepReport[];
  summary: string[];
}

interface DryRunReport {
  network: string;
  timestamp: string;
  scenarios: ScenarioReport[];
  status: StepStatus;
}

interface CliOptions {
  json: boolean;
}

interface StepHandlerDetail {
  tx?: ContractTransactionResponse | null;
  notes?: string[];
  actor?: string;
}

let attemptedArtifactCompile = false;

async function ensureArtifact(name: string): Promise<void> {
  if (!(await artifacts.artifactExists(name))) {
    if (!attemptedArtifactCompile) {
      attemptedArtifactCompile = true;
      await hre.run('compile');
    }
  }
  if (!(await artifacts.artifactExists(name))) {
    throw new Error(
      `Artifact ${name} not found. Run "npx hardhat compile" before executing the dry-run harness.`
    );
  }
}

interface JobFixture {
  owner: any;
  employer: any;
  agent: any;
  validator: any;
  buyer: any;
  moderator: any;
  token: any;
  stake: any;
  reputation: any;
  wrapper: any;
  identity: any;
  validation: any;
  nft: any;
  registry: any;
  dispute: any;
  feePool: any;
  taxPolicy: any;
}

const ROLE_AGENT = 0;

const LOCAL_NETWORK_NAMES = new Set(['hardhat', 'localhost']);

function assertLocalHardhatNetwork(): void {
  if (!LOCAL_NETWORK_NAMES.has(network.name)) {
    throw new Error(
      `Job lifecycle rehearsal requires a local Hardhat network. ` +
        `Current network "${network.name}" does not support the ` +
        'fixture initialisation flow. Re-run without the --network flag ' +
        'or target a local Hardhat node (for example, via "npx hardhat node").'
    );
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
      case '--output-json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function formatError(error: unknown): string {
  if (!error) {
    return 'unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  const err = error as { message?: string; shortMessage?: string };
  if (err.shortMessage) {
    return err.shortMessage;
  }
  if (err.message) {
    return err.message;
  }
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

async function runStep(
  steps: StepReport[],
  id: string,
  label: string,
  handler: () => Promise<void | ContractTransactionResponse | StepHandlerDetail>
): Promise<StepReport> {
  const step: StepReport = { id, label, status: 'pass', notes: [] };
  try {
    const result = await handler();
    let detail: StepHandlerDetail | undefined;
    if (result) {
      if ('wait' in result) {
        detail = { tx: result as ContractTransactionResponse };
      } else {
        detail = result as StepHandlerDetail;
      }
    }
    if (detail?.notes?.length) {
      step.notes.push(...detail.notes);
    }
    if (detail?.actor) {
      step.actor = detail.actor;
    }
    if (detail?.tx) {
      const receipt = await detail.tx.wait();
      step.txHash = detail.tx.hash;
      step.gasUsed = receipt.gasUsed.toString();
    }
  } catch (error) {
    step.status = 'fail';
    step.error = formatError(error);
  }
  steps.push(step);
  return step;
}

async function deployJobFixture(): Promise<JobFixture> {
  assertLocalHardhatNetwork();
  const [owner, employer, agent, validator, buyer, moderator] =
    await ethers.getSigners();

  const tokenFqn = 'contracts/test/AGIALPHAToken.sol:AGIALPHAToken';
  await ensureArtifact(tokenFqn);
  const artifact = await artifacts.readArtifact(tokenFqn);
  try {
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
  } catch (error) {
    throw new Error(
      `Failed to initialise local AGIALPHA token fixture: ${formatError(error)}`
    );
  }

  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );

  const stakeAmount = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  const mint = token.connect(owner).getFunction('mint');
  await mint(employer.address, stakeAmount);
  await mint(agent.address, stakeAmount);
  await mint(buyer.address, stakeAmount);

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );

  await mint(await stake.getAddress(), 0);

  const TaxPolicy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const taxPolicy = await TaxPolicy.deploy(
    'ipfs://policy',
    'Employers, agents, and validators bear all tax obligations.'
  );

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    await taxPolicy.getAddress()
  );

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const ENS = await ethers.getContractFactory('MockENS');
  const ens = await ENS.deploy();
  const Wrapper = await ethers.getContractFactory('MockNameWrapper');
  const wrapper = await Wrapper.deploy();

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );

  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    moderator.address,
    owner.address
  );

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);
  await reputation.setPremiumThreshold(0);
  await identity.addAdditionalAgent(agent.address);
  await stake.setFeePool(await feePool.getAddress());
  await feePool.setTaxPolicy(await taxPolicy.getAddress());
  await dispute.setTaxPolicy(await taxPolicy.getAddress());
  await registry.setTaxPolicy(await taxPolicy.getAddress());

  return {
    owner,
    employer,
    agent,
    validator,
    buyer,
    moderator,
    token,
    stake,
    reputation,
    wrapper,
    identity,
    validation,
    nft,
    registry,
    dispute,
    feePool,
    taxPolicy,
  };
}

async function runJobLifecycleScenario(): Promise<ScenarioReport> {
  const steps: StepReport[] = [];
  const summary: string[] = [];
  let status: StepStatus = 'pass';

  let env: JobFixture | undefined;

  const deployStep = await runStep(
    steps,
    'job.deploy-fixture',
    'Deploy local job system fixture',
    async () => {
      env = await deployJobFixture();
      return {
        notes: [
          `StakeManager: ${await env.stake.getAddress()}`,
          `JobRegistry: ${await env.registry.getAddress()}`,
          `Validation stub: ${await env.validation.getAddress()}`,
        ],
      };
    }
  );
  if (deployStep.status === 'fail') {
    status = 'fail';
    if (
      deployStep.error &&
      deployStep.error.includes('requires a local Hardhat network')
    ) {
      summary.push(
        'Job lifecycle rehearsal is only available on a local Hardhat network.'
      );
    }
    return {
      id: 'job-lifecycle',
      label: 'Job lifecycle rehearsal (local harness)',
      status,
      steps,
      summary,
    };
  }

  const envFixture = env!;

  const subdomain = 'agent';
  const subnode = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'bytes32'],
      [ethers.ZeroHash, ethers.id(subdomain)]
    )
  );
  await envFixture.wrapper.setOwner(BigInt(subnode), envFixture.agent.address);

  await runStep(
    steps,
    'job.employer-ack',
    'Employer acknowledges tax policy',
    async () => ({
      tx: await envFixture.taxPolicy
        .connect(envFixture.employer)
        .acknowledge(),
      actor: envFixture.employer.address,
    })
  );

  await runStep(
    steps,
    'job.agent-ack',
    'Agent acknowledges tax policy',
    async () => ({
      tx: await envFixture.taxPolicy
        .connect(envFixture.agent)
        .acknowledge(),
      actor: envFixture.agent.address,
    })
  );

  const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
  await runStep(
    steps,
    'job.agent-approve',
    'Agent approves stake manager',
    async () => ({
      tx: await envFixture.token
        .connect(envFixture.agent)
        .approve(await envFixture.stake.getAddress(), stakeAmount),
      actor: envFixture.agent.address,
    })
  );

  await runStep(
    steps,
    'job.agent-stake',
    'Agent deposits initial stake',
    async () => ({
      tx: await envFixture.stake
        .connect(envFixture.agent)
        .depositStake(ROLE_AGENT, stakeAmount),
      actor: envFixture.agent.address,
    })
  );

  const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
  const feePct = await envFixture.registry.feePct();
  const feeAmount = (reward * BigInt(feePct)) / 100n;
  const totalEscrow = reward + feeAmount;
  await runStep(
    steps,
    'job.employer-approve',
    'Employer approves StakeManager for reward escrow',
    async () => ({
      tx: await envFixture.token
        .connect(envFixture.employer)
        .approve(await envFixture.stake.getAddress(), totalEscrow),
      actor: envFixture.employer.address,
      notes: [
        `Fee percentage snapshot: ${feePct}%`,
        `Employer approved ${ethers.formatUnits(
          totalEscrow,
          AGIALPHA_DECIMALS
        )} ${AGIALPHA_SYMBOL} (reward + protocol fee)`,
      ],
    })
  );

  const deadline = BigInt((await time.latest()) + 3600);
  const specHash = ethers.id('spec');
  await runStep(steps, 'job.create', 'Employer creates job', async () => ({
    tx: await envFixture.registry
      .connect(envFixture.employer)
      .createJob(reward, deadline, specHash, 'ipfs://job'),
    actor: envFixture.employer.address,
  }));

  await runStep(steps, 'job.apply', 'Agent applies for job', async () => ({
    tx: await envFixture.registry
      .connect(envFixture.agent)
      .applyForJob(1, subdomain, []),
    actor: envFixture.agent.address,
  }));

  const submissionHash = ethers.id('ipfs://result');
  await runStep(steps, 'job.submit', 'Agent submits deliverable', async () => ({
    tx: await envFixture.registry
      .connect(envFixture.agent)
      .submit(1, submissionHash, 'ipfs://result', subdomain, []),
    actor: envFixture.agent.address,
  }));

  await runStep(
    steps,
    'job.validation',
    'Validation module finalizes result',
    async () => {
      await envFixture.validation.setResult(true);
      return {
        tx: await envFixture.validation.finalize(1),
        actor: envFixture.validation.target,
      } as StepHandlerDetail;
    }
  );

  await runStep(steps, 'job.finalize', 'Employer finalizes job', async () => ({
    tx: await envFixture.registry.connect(envFixture.employer).finalize(1),
    actor: envFixture.employer.address,
  }));

  const expectedBalance = ethers.parseUnits('1099', AGIALPHA_DECIMALS);
  await runStep(
    steps,
    'job.verify-payout',
    'Verify agent reward distribution',
    async () => {
      const balance = await envFixture.token.balanceOf(
        envFixture.agent.address
      );
      if (balance !== expectedBalance) {
        throw new Error(
          `Agent balance ${ethers.formatUnits(
            balance,
            AGIALPHA_DECIMALS
          )} ${AGIALPHA_SYMBOL} did not match expected payout`
        );
      }
      summary.push(
        `Agent received ${ethers.formatUnits(
          balance,
          AGIALPHA_DECIMALS
        )} ${AGIALPHA_SYMBOL} after finalization`
      );
      return {
        notes: [
          `Agent balance confirmed at ${ethers.formatUnits(
            balance,
            AGIALPHA_DECIMALS
          )} ${AGIALPHA_SYMBOL}`,
        ],
      };
    }
  );

  if (steps.some((step) => step.status === 'fail')) {
    status = 'fail';
  }

  if (status === 'pass') {
    summary.push('Job lifecycle rehearsal succeeded without errors.');
  }

  return {
    id: 'job-lifecycle',
    label: 'Job lifecycle rehearsal (local harness)',
    status,
    steps,
    summary,
  };
}

async function runSystemPauseScenario(): Promise<ScenarioReport> {
  const steps: StepReport[] = [];
  const summary: string[] = [];
  let status: StepStatus = 'pass';

  const [governance] = await ethers.getSigners();
  let pauseAddress: string | undefined;
  let stake: any;
  let registry: any;
  let validation: any;
  let dispute: any;
  let platformRegistry: any;
  let feePool: any;
  let reputation: any;
  let committee: any;
  let pause: any;

  const deployStep = await runStep(
    steps,
    'pause.deploy-stack',
    'Deploy SystemPause stack via Deployer helper',
    async () => {
      const deployerFqn = 'contracts/v2/Deployer.sol:Deployer';
      await ensureArtifact(deployerFqn);
      const Deployer = await ethers.getContractFactory(deployerFqn);
      const deployer = await Deployer.deploy();

      const econ = {
        feePct: 0,
        burnPct: 0,
        employerSlashPct: 0,
        treasurySlashPct: 0,
        validatorSlashRewardPct: 0,
        commitWindow: 0,
        revealWindow: 0,
        minStake: 0,
        jobStake: 0,
      };
      const ids = {
        ens: ethers.ZeroAddress,
        nameWrapper: ethers.ZeroAddress,
        clubRootNode: ethers.ZeroHash,
        agentRootNode: ethers.ZeroHash,
        validatorMerkleRoot: ethers.ZeroHash,
        agentMerkleRoot: ethers.ZeroHash,
      };

      const tx = await deployer.deploy(econ, ids, governance.address);
      const receipt = await tx.wait();
      const deployerAddress = await deployer.getAddress();
      const log = receipt.logs.find((l) => l.address === deployerAddress);
      if (!log) {
        throw new Error('Deployment log not found');
      }
      const decoded = deployer.interface.decodeEventLog(
        'Deployed',
        log.data,
        log.topics
      );

      const addresses = {
        stakeManager: decoded[0] as string,
        jobRegistry: decoded[1] as string,
        validationModule: decoded[2] as string,
        reputationEngine: decoded[3] as string,
        disputeModule: decoded[4] as string,
        platformRegistry: decoded[6] as string,
        feePool: decoded[9] as string,
        systemPause: decoded[12] as string,
      };

      pauseAddress = ethers.getAddress(addresses.systemPause);
      pause = await ethers.getContractAt('SystemPause', pauseAddress);

      stake = await ethers.getContractAt(
        'contracts/v2/StakeManager.sol:StakeManager',
        addresses.stakeManager
      );
      registry = await ethers.getContractAt(
        'contracts/v2/JobRegistry.sol:JobRegistry',
        addresses.jobRegistry
      );
      validation = await ethers.getContractAt(
        'contracts/v2/ValidationModule.sol:ValidationModule',
        addresses.validationModule
      );
      dispute = await ethers.getContractAt(
        'contracts/v2/modules/DisputeModule.sol:DisputeModule',
        addresses.disputeModule
      );
      platformRegistry = await ethers.getContractAt(
        'contracts/v2/PlatformRegistry.sol:PlatformRegistry',
        addresses.platformRegistry
      );
      feePool = await ethers.getContractAt(
        'contracts/v2/FeePool.sol:FeePool',
        addresses.feePool
      );
      reputation = await ethers.getContractAt(
        'contracts/v2/ReputationEngine.sol:ReputationEngine',
        addresses.reputationEngine
      );
      const committeeAddress = await dispute.committee();
      committee = await ethers.getContractAt(
        'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee',
        committeeAddress
      );

      summary.push(`SystemPause deployed at ${pauseAddress}`);
      return {
        tx,
        notes: [
          `StakeManager deployed at ${addresses.stakeManager}`,
          `JobRegistry deployed at ${addresses.jobRegistry}`,
          `ValidationModule deployed at ${addresses.validationModule}`,
        ],
      };
    }
  );

  if (deployStep.status === 'fail' || !pauseAddress) {
    status = 'fail';
    return {
      id: 'system-pause',
      label: 'SystemPause control rehearsal',
      status,
      steps,
      summary,
    };
  }

  await runStep(
    steps,
    'pause.verify-ownership',
    'Verify SystemPause owns and manages all modules',
    async () => {
      const modules: Array<[string, any]> = [
        ['StakeManager', stake],
        ['JobRegistry', registry],
        ['ValidationModule', validation],
        ['DisputeModule', dispute],
        ['PlatformRegistry', platformRegistry],
        ['FeePool', feePool],
        ['ReputationEngine', reputation],
        ['ArbitratorCommittee', committee],
      ];
      const mismatches: string[] = [];
      const notes: string[] = [];
      for (const [label, contract] of modules) {
        const owner = await contract.owner();
        if (ethers.getAddress(owner) !== pauseAddress) {
          mismatches.push(`${label} owner is ${owner}`);
        }
        notes.push(`${label} owner confirmed as ${owner}`);
      }
      if (mismatches.length) {
        throw new Error(
          `Ownership mismatches detected: ${mismatches.join(', ')}`
        );
      }
      return { notes };
    }
  );

  await runStep(
    steps,
    'pause.refresh',
    'Refresh pauser assignments through SystemPause',
    async () => ({
      tx: await pause.connect(governance).refreshPausers(),
      actor: governance.address,
    })
  );

  await runStep(
    steps,
    'pause.activate',
    'Pause all modules via SystemPause',
    async () => ({
      tx: await pause.connect(governance).pauseAll(),
      actor: governance.address,
    })
  );

  await runStep(
    steps,
    'pause.verify-paused',
    'Confirm modules report paused state',
    async () => {
      const modules: Array<[string, any]> = [
        ['StakeManager', stake],
        ['JobRegistry', registry],
        ['ValidationModule', validation],
        ['DisputeModule', dispute],
        ['PlatformRegistry', platformRegistry],
        ['FeePool', feePool],
        ['ReputationEngine', reputation],
        ['ArbitratorCommittee', committee],
      ];
      const notPaused = [];
      for (const [label, contract] of modules) {
        if (!(await contract.paused())) {
          notPaused.push(label);
        }
      }
      if (notPaused.length) {
        throw new Error(`Modules not paused: ${notPaused.join(', ')}`);
      }
      return {
        notes: modules.map(([label]) => `${label} paused confirmed`),
      };
    }
  );

  await runStep(
    steps,
    'pause.release',
    'Unpause all modules via SystemPause',
    async () => ({
      tx: await pause.connect(governance).unpauseAll(),
      actor: governance.address,
    })
  );

  await runStep(
    steps,
    'pause.verify-unpaused',
    'Confirm modules resumed operation',
    async () => {
      const modules: Array<[string, any]> = [
        ['StakeManager', stake],
        ['JobRegistry', registry],
        ['ValidationModule', validation],
        ['DisputeModule', dispute],
        ['PlatformRegistry', platformRegistry],
        ['FeePool', feePool],
        ['ReputationEngine', reputation],
        ['ArbitratorCommittee', committee],
      ];
      const stillPaused = [];
      for (const [label, contract] of modules) {
        if (await contract.paused()) {
          stillPaused.push(label);
        }
      }
      if (stillPaused.length) {
        throw new Error(`Modules still paused: ${stillPaused.join(', ')}`);
      }
      return {
        notes: modules.map(([label]) => `${label} unpaused confirmed`),
      };
    }
  );

  await runStep(
    steps,
    'pause.param-update',
    'Update StakeManager minimum stake via governance call',
    async () => {
      const newMinStake = ethers.parseUnits('2', AGIALPHA_DECIMALS);
      const callData = stake.interface.encodeFunctionData('setMinStake', [
        newMinStake,
      ]);
      return {
        tx: await pause
          .connect(governance)
          .executeGovernanceCall(await stake.getAddress(), callData),
        actor: governance.address,
        notes: [
          `New minimum stake set to ${ethers.formatUnits(
            newMinStake,
            AGIALPHA_DECIMALS
          )} ${AGIALPHA_SYMBOL}`,
        ],
      };
    }
  );

  await runStep(
    steps,
    'pause.verify-param',
    'Verify StakeManager minimum stake updated',
    async () => {
      const current = await stake.minStake();
      const expected = ethers.parseUnits('2', AGIALPHA_DECIMALS);
      if (current !== expected) {
        throw new Error('StakeManager minimum stake did not update');
      }
      summary.push(
        `StakeManager minStake now ${ethers.formatUnits(
          current,
          AGIALPHA_DECIMALS
        )} ${AGIALPHA_SYMBOL}`
      );
      return {
        notes: [
          `StakeManager minStake confirmed at ${ethers.formatUnits(
            current,
            AGIALPHA_DECIMALS
          )} ${AGIALPHA_SYMBOL}`,
        ],
      };
    }
  );

  if (steps.some((step) => step.status === 'fail')) {
    status = 'fail';
  }

  if (status === 'pass') {
    summary.push('SystemPause rehearsal completed successfully.');
  }

  return {
    id: 'system-pause',
    label: 'SystemPause control rehearsal',
    status,
    steps,
    summary,
  };
}

async function generateReport(): Promise<DryRunReport> {
  const scenarios = [
    await runJobLifecycleScenario(),
    await runSystemPauseScenario(),
  ];
  const overallStatus = scenarios.every(
    (scenario) => scenario.status === 'pass'
  )
    ? 'pass'
    : 'fail';
  return {
    network: network.name,
    timestamp: new Date().toISOString(),
    scenarios,
    status: overallStatus,
  };
}

function renderTextReport(report: DryRunReport): void {
  console.log(`Testnet rehearsal report — network: ${report.network}`);
  console.log(`Generated at ${report.timestamp}`);
  console.log(`Overall status: ${report.status.toUpperCase()}`);
  console.log('');
  for (const scenario of report.scenarios) {
    console.log(`# ${scenario.label}`);
    console.log(`Status: ${scenario.status.toUpperCase()}`);
    for (const line of scenario.summary) {
      console.log(`- ${line}`);
    }
    for (const step of scenario.steps) {
      const prefix = step.status === 'pass' ? '✓' : '✗';
      console.log(`  ${prefix} ${step.label}`);
      if (step.actor) {
        console.log(`    actor: ${step.actor}`);
      }
      if (step.txHash) {
        console.log(`    tx: ${step.txHash}`);
      }
      if (step.gasUsed) {
        console.log(`    gasUsed: ${step.gasUsed}`);
      }
      for (const note of step.notes) {
        console.log(`    • ${note}`);
      }
      if (step.error) {
        console.log(`    error: ${step.error}`);
      }
    }
    console.log('');
  }
}

async function main() {
  const options = parseArgs(CLI_ARGS);
  const report = await generateReport();
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderTextReport(report);
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Testnet rehearsal failed:', error);
  process.exitCode = 1;
});
