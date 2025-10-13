#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { spawnSync } from 'child_process';
import { ethers } from 'ethers';

type DeploySummary = {
  contracts: Record<string, string>;
  network?: string;
  governance?: string;
};

type Spec = {
  validation: { k: number; n: number };
  escrow?: { amountPerItem?: string };
  stake?: { worker?: string; validator?: string };
  acceptanceCriteriaURI?: string;
  notes?: string;
};

const DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
];

const AGIALPHA_CONFIG = JSON.parse(
  fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')
);

const SPEC_PATH = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
const JOB_STATE_LABELS = [
  'Pending',
  'Assigned',
  'Submitted',
  'Completed',
  'Disputed',
  'Finalized',
  'Cancelled',
];

interface GovernanceAction {
  target: string;
  method: string;
  args: unknown[];
  txHash: string;
  notes?: string[];
}

function normaliseArg(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normaliseArg);
  return value;
}

function toBigIntOrZero(value: unknown): bigint {
  try {
    if (value === undefined || value === null) return 0n;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 0n;
      return BigInt(trimmed);
    }
    if (typeof value === 'object' && 'toString' in (value as Record<string, unknown>)) {
      const str = (value as { toString(): string }).toString();
      if (str) return BigInt(str);
    }
  } catch {
    return 0n;
  }
  return 0n;
}

function getResultValue(result: unknown, key: string, index: number): unknown {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
    const indexKey = index.toString();
    if (Object.prototype.hasOwnProperty.call(record, indexKey)) {
      return record[indexKey];
    }
  }
  if (Array.isArray(result)) {
    return (result as unknown[])[index];
  }
  return undefined;
}

function asAddress(value: string | undefined): string | null {
  if (!value) return null;
  if (value === 'disabled') return null;
  try {
    return ethers.getAddress(value);
  } catch {
    return null;
  }
}

function describePauseStates(states: Record<string, boolean>): string[] {
  return Object.entries(states).map(([name, paused]) => `${name}: ${paused ? 'paused' : 'active'}`);
}

function parseNetworkArg(): string {
  const idx = process.argv.indexOf('--network');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  if (process.env.NETWORK) {
    return process.env.NETWORK;
  }
  return 'localhost';
}

function readJsonFile<T>(filePath: string): T {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Required file not found: ${absolute}`);
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf8')) as T;
}

function writeReceipt(net: string, name: string, data: unknown) {
  const dir = path.join('reports', net, 'aurora', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}

function resolveDeploySummaryPath(net: string): string {
  if (process.env.AURORA_DEPLOY_OUTPUT) {
    return path.resolve(process.env.AURORA_DEPLOY_OUTPUT);
  }
  return path.resolve('reports', net, 'aurora', 'receipts', 'deploy.json');
}

function specAmountToWei(amount: string | undefined, decimals: number): bigint {
  if (!amount) return 0n;
  const cleaned = amount.trim();
  if (!cleaned) return 0n;
  const base = BigInt(cleaned);
  const scale = decimals > 6 ? BigInt(10) ** BigInt(decimals - 6) : 1n;
  return base * scale;
}

function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

async function ensureAgialpha(
  provider: ethers.JsonRpcProvider,
  owner: ethers.Wallet
) {
  const tokenAddress = ethers.getAddress(AGIALPHA_CONFIG.address);
  const code = await provider.getCode(tokenAddress);
  const artifactPath = path.join(
    'artifacts',
    'contracts',
    'test',
    'AGIALPHAToken.sol',
    'AGIALPHAToken.json'
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error('Missing AGIALPHAToken artifact. Run `npx hardhat compile` first.');
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
    abi: any;
    deployedBytecode: string;
  };

  if (code === '0x') {
    await provider.send('hardhat_setCode', [tokenAddress, artifact.deployedBytecode]);
    const ownerSlot = ethers.toBeHex(5, 32);
    const ownerValue = ethers.zeroPadValue(await owner.getAddress(), 32);
    await provider.send('hardhat_setStorageAt', [tokenAddress, ownerSlot, ownerValue]);
  }

  return new ethers.Contract(tokenAddress, artifact.abi, owner);
}

async function executeGovernanceCall(
  pause: ethers.Contract,
  target: string,
  iface: ethers.Interface,
  method: string,
  args: unknown[]
) {
  const data = iface.encodeFunctionData(method, args);
  const tx = await pause.executeGovernanceCall(target, data);
  await tx.wait();
  return tx.hash;
}

function deriveCommitPlan(
  jobId: bigint,
  approve: boolean,
  validator: string,
  nonce: bigint,
  specHash: string,
  chainId: bigint,
  domainSeparator: string
) {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const burnTxHash = ethers.ZeroHash;
  const salt = ethers.hexlify(randomBytes(32));
  const outcomeHash = ethers.keccak256(
    abi.encode(['uint256', 'bytes32', 'bool', 'bytes32'], [nonce, specHash, approve, burnTxHash])
  );
  const commitHash = ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domainSeparator]
    )
  );
  return { commitHash, salt, burnTxHash };
}

async function main() {
  const networkName = parseNetworkArg();
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();
  const decimals = Number(AGIALPHA_CONFIG.decimals || 18);

  const employerKey = process.env.PRIVATE_KEY || DEFAULT_KEYS[0];
  const workerKey = process.env.AURORA_WORKER_KEY || DEFAULT_KEYS[1];
  const validatorKeys = [
    process.env.AURORA_VALIDATOR1_KEY || DEFAULT_KEYS[2],
    process.env.AURORA_VALIDATOR2_KEY || DEFAULT_KEYS[3],
    process.env.AURORA_VALIDATOR3_KEY || DEFAULT_KEYS[4],
  ];

  const employer = new ethers.Wallet(employerKey, provider);
  const worker = new ethers.Wallet(workerKey, provider);

  const spec = readJsonFile<Spec>(SPEC_PATH);
  if (!spec.validation || !spec.validation.k || !spec.validation.n) {
    throw new Error('Validation quorum (k-of-n) must be defined in the spec.');
  }
  const validatorCount = spec.validation.n;
  const quorum = spec.validation.k;
  const selectedValidatorKeys = validatorKeys.slice(0, validatorCount);
  if (selectedValidatorKeys.length < validatorCount) {
    throw new Error('Insufficient validator keys configured for the selected quorum.');
  }
  const validators = selectedValidatorKeys.map((key) => new ethers.Wallet(key, provider));

  const summaryPath = resolveDeploySummaryPath(networkName);
  const deploySummary = readJsonFile<DeploySummary>(summaryPath);
  if (!deploySummary.contracts) {
    throw new Error(`Deployment summary missing contracts map: ${summaryPath}`);
  }

  const addresses = deploySummary.contracts;

  const artifact = (name: string) =>
    JSON.parse(
      fs.readFileSync(
        path.join('artifacts', 'contracts', 'v2', `${name}.sol`, `${name}.json`),
        'utf8'
      )
    );

  const jobRegistryArtifact = artifact('JobRegistry');
  const stakeManagerArtifact = artifact('StakeManager');
  const validationModuleArtifact = artifact('ValidationModule');
  const identityRegistryArtifact = artifact('IdentityRegistry');
  const systemPauseArtifact = artifact('SystemPause');

  const jobRegistry = new ethers.Contract(
    addresses.JobRegistry,
    jobRegistryArtifact.abi,
    employer
  );
  const stakeManager = new ethers.Contract(
    addresses.StakeManager,
    stakeManagerArtifact.abi,
    employer
  );
  const validationModule = new ethers.Contract(
    addresses.ValidationModule,
    validationModuleArtifact.abi,
    employer
  );
  const identityRegistry = new ethers.Contract(
    addresses.IdentityRegistry,
    identityRegistryArtifact.abi,
    employer
  );
  const systemPause = new ethers.Contract(
    addresses.SystemPause,
    systemPauseArtifact.abi,
    employer
  );

  const pausableAbi = ['function paused() view returns (bool)'];
  const disputeModuleAddress = asAddress(addresses.DisputeModule);
  const platformRegistryAddress = asAddress(addresses.PlatformRegistry);
  const feePoolAddress = asAddress(addresses.FeePool);
  const reputationEngineAddress = asAddress(addresses.ReputationEngine);

  const disputeModule = disputeModuleAddress
    ? new ethers.Contract(disputeModuleAddress, pausableAbi, employer)
    : null;
  const platformRegistry = platformRegistryAddress
    ? new ethers.Contract(platformRegistryAddress, pausableAbi, employer)
    : null;
  const feePool = feePoolAddress
    ? new ethers.Contract(feePoolAddress, pausableAbi, employer)
    : null;
  const reputationEngine = reputationEngineAddress
    ? new ethers.Contract(reputationEngineAddress, pausableAbi, employer)
    : null;

  const pausableContracts: Record<string, ethers.Contract | null> = {
    JobRegistry: jobRegistry,
    StakeManager: stakeManager,
    ValidationModule: validationModule,
    DisputeModule: disputeModule,
    PlatformRegistry: platformRegistry,
    FeePool: feePool,
    ReputationEngine: reputationEngine,
  };

  const collectPauseStates = async (): Promise<Record<string, boolean>> => {
    const states: Record<string, boolean> = {};
    for (const [name, contract] of Object.entries(pausableContracts)) {
      if (!contract) continue;
      try {
        states[name] = await contract.paused();
      } catch {
        states[name] = false;
      }
    }
    return states;
  };

  const governanceActions: GovernanceAction[] = [];
  const jobTimeline: Array<{
    step: string;
    state: string;
    stateIndex: number;
    success: boolean;
    burnConfirmed: boolean;
    reward: string;
    stake: string;
    employer: string;
    agent: string;
    deadline: string;
    assignedAt: string;
  }> = [];

  const recordGovernance = (action: GovernanceAction) => {
    governanceActions.push(action);
  };

  const captureJobState = async (step: string, jobId: bigint) => {
    const job = await jobRegistry.jobs(jobId);
    const metadata = await jobRegistry.decodeJobMetadata(job.packedMetadata);
    const stateValue = getResultValue(metadata, 'state', 0);
    const stateIndex = Number(toBigIntOrZero(stateValue));
    const state = JOB_STATE_LABELS[stateIndex] ?? `Unknown(${stateIndex})`;

    const successValue = getResultValue(metadata, 'success', 1);
    const burnConfirmedValue = getResultValue(metadata, 'burnConfirmed', 2);
    const deadlineValue = getResultValue(metadata, 'deadline', 6);
    const assignedValue = getResultValue(metadata, 'assignedAt', 7);

    const rewardValue = toBigIntOrZero(getResultValue(job, 'reward', 2));
    const stakeValue = toBigIntOrZero(getResultValue(job, 'stake', 3));
    const employerAddr =
      (getResultValue(job, 'employer', 0) as string | undefined) || ethers.ZeroAddress;
    const agentAddr =
      (getResultValue(job, 'agent', 1) as string | undefined) || ethers.ZeroAddress;

    jobTimeline.push({
      step,
      state,
      stateIndex,
      success: Boolean(successValue),
      burnConfirmed: Boolean(burnConfirmedValue),
      reward: formatUnits(rewardValue, decimals),
      stake: formatUnits(stakeValue, decimals),
      employer: employerAddr,
      agent: agentAddr,
      deadline: toBigIntOrZero(deadlineValue).toString(),
      assignedAt: toBigIntOrZero(assignedValue).toString(),
    });
  };

  const token = await ensureAgialpha(provider, employer);

  const mintAmount = ethers.parseUnits('1000', decimals);
  const rewardAmount =
    specAmountToWei(spec.escrow?.amountPerItem, decimals) || ethers.parseUnits('5', decimals);
  const workerStakeAmount =
    specAmountToWei(spec.stake?.worker, decimals) || ethers.parseUnits('20', decimals);
  const validatorStakeAmount =
    specAmountToWei(spec.stake?.validator, decimals) || ethers.parseUnits('50', decimals);

  const participants = [employer, worker, ...validators];
  for (const wallet of participants) {
    const bal = await token.balanceOf(wallet.address);
    if (bal < mintAmount) {
      const delta = mintAmount - bal;
      const tx = await token.mint(wallet.address, delta);
      const receipt = await tx.wait();
      recordGovernance({
        target: 'AGIALPHAToken',
        method: 'mint',
        args: [wallet.address, delta.toString()],
        txHash: receipt?.hash || tx.hash,
        notes: [`Minted ${formatUnits(delta, decimals)} AGIALPHA to ${wallet.address}`],
      });
    }
    const allowance = await token.allowance(wallet.address, addresses.StakeManager);
    const requiredAllowance = wallet === employer ? mintAmount + rewardAmount : mintAmount;
    if (allowance < requiredAllowance) {
      const approveTx = await token
        .connect(wallet)
        .approve(addresses.StakeManager, ethers.MaxUint256);
      const approveReceipt = await approveTx.wait();
      recordGovernance({
        target: 'AGIALPHAToken',
        method: 'approve',
        args: [addresses.StakeManager, 'MAX_UINT256'],
        txHash: approveReceipt?.hash || approveTx.hash,
        notes: [`Approved StakeManager from ${wallet.address}`],
      });
    }
  }

  const addAgentTx = await identityRegistry.addAdditionalAgent(worker.address);
  const addAgentReceipt = await addAgentTx.wait();
  recordGovernance({
    target: 'IdentityRegistry',
    method: 'addAdditionalAgent',
    args: [worker.address],
    txHash: addAgentReceipt?.hash || addAgentTx.hash,
  });

  for (const validator of validators) {
    const tx = await identityRegistry.addAdditionalValidator(validator.address);
    const receipt = await tx.wait();
    recordGovernance({
      target: 'IdentityRegistry',
      method: 'addAdditionalValidator',
      args: [validator.address],
      txHash: receipt?.hash || tx.hash,
    });
  }

  const validationInterface = new ethers.Interface(validationModuleArtifact.abi);

  const callValidationGovernance = async (
    method: string,
    args: unknown[],
    notes?: string[]
  ) => {
    const txHash = await executeGovernanceCall(
      systemPause,
      addresses.ValidationModule,
      validationInterface,
      method,
      args
    );
    recordGovernance({ target: 'ValidationModule', method, args, txHash, notes });
  };

  await callValidationGovernance('setValidatorPool', [validators.map((v) => v.address)], [
    `pool size ${validators.length}`,
  ]);
  await callValidationGovernance('setValidatorBounds', [quorum, validatorCount], [
    `quorum ${quorum}/${validatorCount}`,
  ]);
  await callValidationGovernance('setValidatorsPerJob', [validatorCount]);
  await callValidationGovernance('setRequiredValidatorApprovals', [quorum]);
  await callValidationGovernance('setCommitWindow', [3600]);
  await callValidationGovernance('setRevealWindow', [3600]);

  const stakeEntries: Array<{
    role: string;
    address: string;
    amount: string;
    txHash: string;
    balanceBefore: string;
    balanceAfter: string;
  }> = [];

  const agentRole = 0;
  const validatorRole = 1;

  const workerBeforeStake = await token.balanceOf(worker.address);
  const workerStakeTx = await stakeManager
    .connect(worker)
    .acknowledgeAndDeposit(agentRole, workerStakeAmount);
  const workerStakeReceipt = await workerStakeTx.wait();
  const workerAfterStake = await token.balanceOf(worker.address);
  stakeEntries.push({
    role: 'agent',
    address: worker.address,
    amount: formatUnits(workerStakeAmount, decimals),
    txHash: workerStakeReceipt?.hash || workerStakeTx.hash,
    balanceBefore: formatUnits(workerBeforeStake, decimals),
    balanceAfter: formatUnits(workerAfterStake, decimals),
  });

  for (const validator of validators) {
    const before = await token.balanceOf(validator.address);
    const stakeTx = await stakeManager
      .connect(validator)
      .acknowledgeAndDeposit(validatorRole, validatorStakeAmount);
    const receipt = await stakeTx.wait();
    const after = await token.balanceOf(validator.address);
    stakeEntries.push({
      role: 'validator',
      address: validator.address,
      amount: formatUnits(validatorStakeAmount, decimals),
      txHash: receipt?.hash || stakeTx.hash,
      balanceBefore: formatUnits(before, decimals),
      balanceAfter: formatUnits(after, decimals),
    });
  }

  writeReceipt(networkName, 'stake.json', { entries: stakeEntries });

  const specHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(spec, Object.keys(spec).sort()))
  );
  const specUri = spec.acceptanceCriteriaURI || 'ipfs://aurora-demo-spec';
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const postTx = await jobRegistry
    .connect(employer)
    .acknowledgeAndCreateJob(rewardAmount, Number(deadline), specHash, specUri);
  const postReceipt = await postTx.wait();
  let jobId = 0n;
  if (postReceipt && postReceipt.logs) {
    for (const log of postReceipt.logs) {
      try {
        const parsed = jobRegistry.interface.parseLog(log);
        if (parsed.name === 'JobCreated') {
          jobId = parsed.args.jobId as bigint;
          break;
        }
      } catch {
        continue;
      }
    }
  }
  if (jobId === 0n) {
    jobId = 1n;
  }

  await captureJobState('posted', jobId);

  writeReceipt(networkName, 'postJob.json', {
    jobId: jobId.toString(),
    txHash: postReceipt?.hash || postTx.hash,
    reward: formatUnits(rewardAmount, decimals),
    deadline: deadline.toString(),
    specHash,
  });

  const subdomain = 'aurora-agent';
  const applyTx = await jobRegistry.connect(worker).acknowledgeAndApply(jobId, subdomain, []);
  await applyTx.wait();
  await captureJobState('applied', jobId);

  const resultUri = 'ipfs://aurora-demo-result';
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes(resultUri));
  const submitTx = await jobRegistry
    .connect(worker)
    .submit(jobId, resultHash, resultUri, subdomain, []);
  const submitReceipt = await submitTx.wait();

  await captureJobState('submitted', jobId);

  writeReceipt(networkName, 'submit.json', {
    worker: worker.address,
    txHash: submitReceipt?.hash || submitTx.hash,
    resultURI: resultUri,
    resultHash,
  });

  const nonce = (await validationModule.jobNonce(jobId)).valueOf() as bigint;
  const specHashOnChain = await jobRegistry.getSpecHash(jobId);
  const domainSeparator = await validationModule.DOMAIN_SEPARATOR();
  const commitRecords: Array<{
    address: string;
    commitTx: string;
    revealTx: string;
    commitHash: string;
    salt: string;
  }> = [];

  for (const validator of validators) {
    const plan = deriveCommitPlan(
      jobId,
      true,
      validator.address,
      nonce,
      specHashOnChain,
      chain.chainId,
      domainSeparator
    );
    const commitTx = await validationModule
      .connect(validator)
      .commitValidation(jobId, plan.commitHash, 'aurora-validator', []);
    const commitReceipt = await commitTx.wait();
    const revealTx = await validationModule
      .connect(validator)
      .revealValidation(
        jobId,
        true,
        plan.burnTxHash,
        plan.salt,
        'aurora-validator',
        []
      );
    const revealReceipt = await revealTx.wait();
    commitRecords.push({
      address: validator.address,
      commitTx: commitReceipt?.hash || commitTx.hash,
      revealTx: revealReceipt?.hash || revealTx.hash,
      commitHash: plan.commitHash,
      salt: plan.salt,
    });
  }

  const balancesBefore = new Map<string, bigint>();
  const trackAddresses = [employer.address, worker.address, ...validators.map((v) => v.address)];
  for (const addr of trackAddresses) {
    balancesBefore.set(addr, await token.balanceOf(addr));
  }

  const finalizeTx = await validationModule.connect(validators[0]).finalize(jobId);
  const finalizeReceipt = await finalizeTx.wait();

  await captureJobState('finalized', jobId);

  const payouts: Record<string, { before: string; after: string; delta: string }> = {};
  for (const addr of trackAddresses) {
    const before = balancesBefore.get(addr) || 0n;
    const after = await token.balanceOf(addr);
    payouts[addr] = {
      before: formatUnits(before, decimals),
      after: formatUnits(after, decimals),
      delta: formatUnits(after - before, decimals),
    };
  }

  writeReceipt(networkName, 'validate.json', {
    jobId: jobId.toString(),
    validators: commitRecords,
    finalizeTx: finalizeReceipt?.hash || finalizeTx.hash,
    commits: commitRecords.length,
    reveals: commitRecords.length,
  });

  writeReceipt(networkName, 'finalize.json', {
    txHash: finalizeReceipt?.hash || finalizeTx.hash,
    payouts,
  });

  const thermostatEnv = { ...process.env } as NodeJS.ProcessEnv;
  thermostatEnv.NETWORK = networkName;
  if (!thermostatEnv.AURORA_DEPLOY_OUTPUT) {
    thermostatEnv.AURORA_DEPLOY_OUTPUT = summaryPath;
  }
  const thermo = spawnSync(
    'npx',
    ['hardhat', 'run', 'scripts/v2/updateThermodynamics.ts', '--network', networkName],
    { env: thermostatEnv, encoding: 'utf8' }
  );
  const thermostatReceipt: Record<string, unknown> = {
    command: `npx hardhat run scripts/v2/updateThermodynamics.ts --network ${networkName}`,
    exitCode: thermo.status,
    success: thermo.status === 0,
    stdout: (thermo.stdout || '').toString().trim(),
    stderr: (thermo.stderr || '').toString().trim(),
  };
  if (thermo.error) {
    thermostatReceipt.error = (thermo.error as Error).message;
  }
  writeReceipt(networkName, 'thermostat.json', thermostatReceipt);

  try {
    const pauseTx = await systemPause.pauseAll();
    const pauseReceipt = await pauseTx.wait();
    const pausedStates = await collectPauseStates();
    recordGovernance({
      target: 'SystemPause',
      method: 'pauseAll',
      args: [],
      txHash: pauseReceipt?.hash || pauseTx.hash,
      notes: describePauseStates(pausedStates),
    });
  } catch (error) {
    recordGovernance({
      target: 'SystemPause',
      method: 'pauseAll',
      args: [],
      txHash: 'failed',
      notes: [`pauseAll failed: ${(error as Error).message}`],
    });
  }

  try {
    const unpauseTx = await systemPause.unpauseAll();
    const unpauseReceipt = await unpauseTx.wait();
    const states = await collectPauseStates();
    recordGovernance({
      target: 'SystemPause',
      method: 'unpauseAll',
      args: [],
      txHash: unpauseReceipt?.hash || unpauseTx.hash,
      notes: describePauseStates(states),
    });
  } catch (error) {
    recordGovernance({
      target: 'SystemPause',
      method: 'unpauseAll',
      args: [],
      txHash: 'failed',
      notes: [`unpauseAll failed: ${(error as Error).message}`],
    });
  }

  writeReceipt(networkName, 'governance.json', {
    actions: governanceActions.map((action) => ({
      target: action.target,
      method: action.method,
      args: action.args.map(normaliseArg),
      txHash: action.txHash,
      notes: action.notes,
    })),
  });

  writeReceipt(networkName, 'state.json', {
    jobId: jobId.toString(),
    timeline: jobTimeline,
  });

  console.log('✅ AURORA demo completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
