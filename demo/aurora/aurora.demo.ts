#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
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
  '0x8b3a350cf5c34c9194ca1aa9d026ca16787d90ca431fb1a2bd43d50c18d5c7b1',
];

const AGIALPHA_CONFIG = JSON.parse(
  fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')
);

const SPEC_PATH = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
const REQUIRED_CONTRACTS = [
  'JobRegistry',
  'StakeManager',
  'ValidationModule',
  'IdentityRegistry',
  'SystemPause',
] as const;
type RequiredContract = (typeof REQUIRED_CONTRACTS)[number];

function toEnvOverrideName(name: string): string {
  return `AURORA_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`;
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

async function ensureOwnershipAccepted(
  contract: ethers.Contract,
  label: string,
  expectedOwner: string
) {
  if ('owner' in contract && typeof contract.owner === 'function') {
    try {
      const currentOwner = await contract.owner();
      if (
        typeof currentOwner === 'string' &&
        currentOwner.toLowerCase() === expectedOwner.toLowerCase()
      ) {
        return;
      }
    } catch (err) {
      console.warn(`Unable to read owner() for ${label}: ${(err as Error).message}`);
    }
  }

  if (
    'pendingOwner' in contract &&
    typeof (contract as ethers.Contract & { pendingOwner(): Promise<string> }).pendingOwner ===
      'function'
  ) {
    try {
      const pending = await (contract as ethers.Contract & {
        pendingOwner(): Promise<string>;
      }).pendingOwner();
      if (pending && pending.toLowerCase() === expectedOwner.toLowerCase()) {
        if (
          'acceptOwnership' in contract &&
          typeof (contract as ethers.Contract & {
            acceptOwnership(): Promise<ethers.TransactionResponse>;
          }).acceptOwnership === 'function'
        ) {
          const tx = await (contract as ethers.Contract & {
            acceptOwnership(): Promise<ethers.TransactionResponse>;
          }).acceptOwnership();
          await tx.wait();
          return;
        }
      }
    } catch (err) {
      console.warn(
        `Unable to accept ownership for ${label}: ${(err as Error).message}`
      );
      return;
    }
  }

  console.warn(
    `Ownership for ${label} not updated; ensure governance ${expectedOwner} has accepted manually.`
  );
}

function deploymentSummaryCandidates(net: string): string[] {
  const candidates: string[] = [];
  if (process.env.AURORA_DEPLOY_OUTPUT) {
    candidates.push(path.resolve(process.env.AURORA_DEPLOY_OUTPUT));
  }
  candidates.push(path.resolve('reports', net, 'aurora', 'receipts', 'deploy.json'));
  candidates.push(path.resolve('deployment-config', `latest-deployment.${net}.json`));
  return Array.from(new Set(candidates));
}

function defaultDeployReceiptPath(net: string): string {
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
  owner: ethers.Signer
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

  const employerKey =
    process.env.AURORA_EMPLOYER_KEY ||
    process.env.PRIVATE_KEY ||
    DEFAULT_KEYS[1];
  const workerKey = process.env.AURORA_WORKER_KEY || DEFAULT_KEYS[2];
  const validatorKeys = [
    process.env.AURORA_VALIDATOR1_KEY || DEFAULT_KEYS[3],
    process.env.AURORA_VALIDATOR2_KEY || DEFAULT_KEYS[4],
    process.env.AURORA_VALIDATOR3_KEY || DEFAULT_KEYS[5],
  ];

  const employer = new ethers.NonceManager(new ethers.Wallet(employerKey, provider));
  const worker = new ethers.NonceManager(new ethers.Wallet(workerKey, provider));
  const tokenOwnerKey = process.env.AURORA_TOKEN_OWNER_KEY || DEFAULT_KEYS[0];
  const tokenOwner = new ethers.NonceManager(new ethers.Wallet(tokenOwnerKey, provider));
  const governanceKey = process.env.AURORA_GOVERNANCE_KEY || tokenOwnerKey;
  const governance =
    governanceKey === tokenOwnerKey
      ? tokenOwner
      : new ethers.NonceManager(new ethers.Wallet(governanceKey, provider));

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
  const validators = selectedValidatorKeys.map(
    (key) => new ethers.NonceManager(new ethers.Wallet(key, provider))
  );

  const employerAddress = await employer.getAddress();
  const workerAddress = await worker.getAddress();
  const validatorAddresses = await Promise.all(
    validators.map((v) => v.getAddress())
  );

  const participants = [
    { signer: employer, address: employerAddress, role: 'employer' as const },
    { signer: worker, address: workerAddress, role: 'worker' as const },
    ...validatorAddresses.map((address, idx) => ({
      signer: validators[idx],
      address,
      role: 'validator' as const,
    })),
  ];

  const summaryCandidates = deploymentSummaryCandidates(networkName);
  const summaryPath = summaryCandidates.find((candidate) => fs.existsSync(candidate));
  let deploySummary: DeploySummary | undefined;
  if (summaryPath) {
    deploySummary = readJsonFile<DeploySummary>(summaryPath);
    console.log(`Using deployment summary at ${summaryPath}`);
  } else {
    console.warn(
      `No deployment summary found. Checked: ${summaryCandidates
        .map((candidate) => path.relative(process.cwd(), candidate))
        .join(', ')}`
    );
  }

  const resolvedAddresses: Record<string, string> = { ...(deploySummary?.contracts ?? {}) };
  const overrideEnv: Record<RequiredContract, string | undefined> = {
    JobRegistry: process.env.AURORA_JOB_REGISTRY,
    StakeManager: process.env.AURORA_STAKE_MANAGER,
    ValidationModule: process.env.AURORA_VALIDATION_MODULE,
    IdentityRegistry: process.env.AURORA_IDENTITY_REGISTRY,
    SystemPause: process.env.AURORA_SYSTEM_PAUSE,
  };
  for (const [name, value] of Object.entries(overrideEnv)) {
    if (value) {
      resolvedAddresses[name] = ethers.getAddress(value);
    }
  }

  const missing = REQUIRED_CONTRACTS.filter((name) => !resolvedAddresses[name]);
  if (missing.length > 0) {
    const guidance = [
      'Run `npx hardhat run scripts/v2/deployDefaults.ts --network <network>` with `DEPLOY_DEFAULTS_OUTPUT` pointing to a JSON file.',
      'Alternatively set the following environment variables:',
      missing.map((name) => toEnvOverrideName(name)).join(', '),
    ].join(' ');
    throw new Error(
      `Missing contract addresses for: ${missing.join(', ')}. ${guidance}`
    );
  }

  const addresses = resolvedAddresses as Record<RequiredContract, string>;

  const defaultDeployPath = defaultDeployReceiptPath(networkName);
  if (!summaryPath || path.resolve(summaryPath) !== defaultDeployPath) {
    const contractSnapshot = {
      ...(deploySummary?.contracts ?? {}),
      ...Object.fromEntries(REQUIRED_CONTRACTS.map((name) => [name, addresses[name]])),
    };
    writeReceipt(networkName, 'deploy.json', {
      ...(deploySummary ?? {}),
      timestamp:
        (deploySummary as undefined | { timestamp?: string })?.timestamp ??
        new Date().toISOString(),
      network: deploySummary?.network ?? networkName,
      governance: deploySummary?.governance,
      source: summaryPath ? path.relative(process.cwd(), summaryPath) : 'env',
      contracts: contractSnapshot,
    });
  }

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
    governance
  );
  const systemPause = new ethers.Contract(
    addresses.SystemPause,
    systemPauseArtifact.abi,
    governance
  );
  const taxPolicyAddress = deploySummary?.contracts?.TaxPolicy;
  if (!taxPolicyAddress) {
    throw new Error('TaxPolicy address missing from deployment summary.');
  }
  const taxPolicyArtifact = artifact('TaxPolicy');
  const taxPolicy = new ethers.Contract(
    taxPolicyAddress,
    taxPolicyArtifact.abi,
    governance
  );
  const token = await ensureAgialpha(provider, tokenOwner);

  const mintAmount = ethers.parseUnits('1000', decimals);
  const rewardAmount = specAmountToWei(spec.escrow?.amountPerItem, decimals) ||
    ethers.parseUnits('5', decimals);
  const workerStakeAmount = specAmountToWei(spec.stake?.worker, decimals) ||
    ethers.parseUnits('20', decimals);
  const validatorStakeAmount = specAmountToWei(spec.stake?.validator, decimals) ||
    ethers.parseUnits('50', decimals);

  const ownerToken = token.connect(tokenOwner);

  const acknowledgementTargets: Array<{ label: string; address?: string }> = [
    { label: 'StakeManager', address: addresses.StakeManager },
    { label: 'JobRegistry', address: addresses.JobRegistry },
    { label: 'FeePool', address: deploySummary?.contracts?.FeePool },
    { label: 'RewardEngineMB', address: deploySummary?.contracts?.RewardEngineMB },
    { label: 'PlatformIncentives', address: deploySummary?.contracts?.PlatformIncentives },
    { label: 'PlatformRegistry', address: deploySummary?.contracts?.PlatformRegistry },
  ];

  for (const target of acknowledgementTargets) {
    if (!target.address) continue;
    const normalized = ethers.getAddress(target.address);
    if (!(await token.hasAcknowledged(normalized))) {
      const tx = await ownerToken.mint(normalized, 0);
      await tx.wait();
    }
  }
  const governanceAddress = await governance.getAddress();
  await ensureOwnershipAccepted(identityRegistry, 'IdentityRegistry', governanceAddress);
  await ensureOwnershipAccepted(taxPolicy, 'TaxPolicy', governanceAddress);
  const jobRegistryInterface = new ethers.Interface(jobRegistryArtifact.abi);
  const stakeManagerInterface = new ethers.Interface(stakeManagerArtifact.abi);
  if (!(await jobRegistry.acknowledgers(addresses.StakeManager))) {
    await executeGovernanceCall(
      systemPause,
      addresses.JobRegistry,
      jobRegistryInterface,
      'setAcknowledger',
      [addresses.StakeManager, true]
    );
  }
  const requiredAcknowledgers = [addresses.JobRegistry, addresses.StakeManager];
  for (const addr of requiredAcknowledgers) {
    if (!(await taxPolicy.acknowledgerAllowed(addr))) {
      const tx = await taxPolicy.setAcknowledger(addr, true);
      await tx.wait();
    }
  }
  const currentValidationModule = await stakeManager.validationModule();
  if (currentValidationModule.toLowerCase() !== addresses.ValidationModule.toLowerCase()) {
    await executeGovernanceCall(
      systemPause,
      addresses.StakeManager,
      stakeManagerInterface,
      'setValidationModule',
      [addresses.ValidationModule]
    );
  }
  const currentJobRegistryAddress = await stakeManager.jobRegistry();
  if (currentJobRegistryAddress.toLowerCase() !== addresses.JobRegistry.toLowerCase()) {
    await executeGovernanceCall(
      systemPause,
      addresses.StakeManager,
      stakeManagerInterface,
      'setJobRegistry',
      [addresses.JobRegistry]
    );
  }
  for (const participant of participants) {
    try {
      await provider.send('hardhat_setBalance', [
        participant.address,
        ethers.toBeHex(ethers.parseEther('1000')),
      ]);
    } catch {
      // ignore for live networks
    }
    const bal = await token.balanceOf(participant.address);
    if (bal < mintAmount) {
      const tx = await ownerToken.mint(participant.address, mintAmount - bal);
      await tx.wait();
    }
    const allowance = await token.allowance(participant.address, addresses.StakeManager);
    const requiredAllowance =
      participant.role === 'employer' ? mintAmount + rewardAmount : mintAmount;
    if (allowance < requiredAllowance) {
      const approveTx = await token
        .connect(participant.signer)
        .approve(addresses.StakeManager, ethers.MaxUint256);
      await approveTx.wait();
    }
    const ackTx = await taxPolicy.connect(participant.signer).acknowledge();
    await ackTx.wait();
  }

  await identityRegistry.addAdditionalAgent(workerAddress);
  for (const addr of validatorAddresses) {
    await identityRegistry.addAdditionalValidator(addr);
  }

  const validationInterface = new ethers.Interface(validationModuleArtifact.abi);
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setValidatorPool',
    [validatorAddresses]
  );
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setValidatorBounds',
    [validatorCount, validatorCount]
  );
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setValidatorsPerJob',
    [validatorCount]
  );
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setRequiredValidatorApprovals',
    [quorum]
  );
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setCommitWindow',
    [3600]
  );
  await executeGovernanceCall(
    systemPause,
    addresses.ValidationModule,
    validationInterface,
    'setRevealWindow',
    [3600]
  );

  const stakeEntries: Array<{ role: string; address: string; amount: string; txHash: string }> = [];
  const agentRole = 0;
  const validatorRole = 1;

  const workerStakeTx = await stakeManager
    .connect(worker)
    .depositStake(agentRole, workerStakeAmount);
  const workerStakeReceipt = await workerStakeTx.wait();
  stakeEntries.push({
    role: 'agent',
    address: workerAddress,
    amount: formatUnits(workerStakeAmount, decimals),
    txHash: workerStakeReceipt?.hash || workerStakeTx.hash,
  });

  for (const [index, validator] of validators.entries()) {
    const stakeTx = await stakeManager
      .connect(validator)
      .depositStake(validatorRole, validatorStakeAmount);
    const receipt = await stakeTx.wait();
    stakeEntries.push({
      role: 'validator',
      address: validatorAddresses[index],
      amount: formatUnits(validatorStakeAmount, decimals),
      txHash: receipt?.hash || stakeTx.hash,
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

  writeReceipt(networkName, 'postJob.json', {
    jobId: jobId.toString(),
    txHash: postReceipt?.hash || postTx.hash,
    reward: formatUnits(rewardAmount, decimals),
    deadline: deadline.toString(),
    specHash,
  });

  const subdomain = 'aurora-agent';
  const applyTx = await jobRegistry
    .connect(worker)
    .acknowledgeAndApply(jobId, subdomain, []);
  await applyTx.wait();

  const resultUri = 'ipfs://aurora-demo-result';
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes(resultUri));
  const submitTx = await jobRegistry
    .connect(worker)
    .submit(jobId, resultHash, resultUri, subdomain, []);
  const submitReceipt = await submitTx.wait();

  writeReceipt(networkName, 'submit.json', {
    worker: workerAddress,
    txHash: submitReceipt?.hash || submitTx.hash,
    resultURI: resultUri,
    resultHash,
  });

  await validationModule
    .connect(governance)
    .selectValidators(jobId, 0, { gasLimit: 10_000_000 });
  await provider.send('evm_mine', []);
  const selectTx = await validationModule
    .connect(governance)
    .selectValidators(jobId, 0, { gasLimit: 10_000_000 });
  const selectReceipt = await selectTx.wait();
  let selectedValidators = validatorAddresses.slice();
  if (selectReceipt && selectReceipt.logs) {
    for (const log of selectReceipt.logs) {
      try {
        const parsed = validationInterface.parseLog(log);
        if (parsed.name === 'ValidatorsSelected') {
          selectedValidators = (parsed.args.validators as string[]) ?? selectedValidators;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  const nonce = (await validationModule.jobNonce(jobId)).valueOf() as bigint;
  const specHashOnChain = await jobRegistry.getSpecHash(jobId);
  const domainSeparator = await validationModule.DOMAIN_SEPARATOR();
  const commitPlans: Array<{
    index: number;
    plan: ReturnType<typeof deriveCommitPlan>;
    commitTx: string;
  }> = [];
  for (const [index, validator] of validators.entries()) {
    const plan = deriveCommitPlan(
      jobId,
      true,
      validatorAddresses[index],
      nonce,
      specHashOnChain,
      chain.chainId,
      domainSeparator
    );
    const commitTx = await validationModule
      .connect(validator)
      .commitValidation(jobId, plan.commitHash, 'aurora-validator', []);
    const commitReceipt = await commitTx.wait();
    commitPlans.push({
      index,
      plan,
      commitTx: commitReceipt?.hash || commitTx.hash,
    });
  }

  const commitWindowSeconds = Number(await validationModule.commitWindow());
  await provider.send('evm_increaseTime', [commitWindowSeconds]);
  await provider.send('evm_mine', []);

  const commitRecords: Array<{ address: string; commitTx: string; revealTx: string; commitHash: string; salt: string }>= [];
  for (const entry of commitPlans) {
    const validator = validators[entry.index];
    const revealTx = await validationModule
      .connect(validator)
      .revealValidation(
        jobId,
        true,
        entry.plan.burnTxHash,
        entry.plan.salt,
        'aurora-validator',
        []
      );
    const revealReceipt = await revealTx.wait();
    commitRecords.push({
      address: validatorAddresses[entry.index],
      commitTx: entry.commitTx,
      revealTx: revealReceipt?.hash || revealTx.hash,
      commitHash: entry.plan.commitHash,
      salt: entry.plan.salt,
    });
  }

  const balancesBefore = new Map<string, bigint>();
  const trackAddresses = [
    employerAddress,
    workerAddress,
    ...validatorAddresses,
  ];
  for (const addr of trackAddresses) {
    balancesBefore.set(addr, await token.balanceOf(addr));
  }

  const validationFinalizeTx = await validationModule
    .connect(validators[0])
    .finalize(jobId);
  const validationFinalizeReceipt = await validationFinalizeTx.wait();

  const registryFinalizeTx = await jobRegistry
    .connect(employer)
    .finalize(jobId);
  const registryFinalizeReceipt = await registryFinalizeTx.wait();

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
    selectedValidators,
    validators: commitRecords,
    validationFinalizeTx:
      validationFinalizeReceipt?.hash || validationFinalizeTx.hash,
    jobFinalizeTx: registryFinalizeReceipt?.hash || registryFinalizeTx.hash,
    commits: commitRecords.length,
    reveals: commitRecords.length,
  });

  writeReceipt(networkName, 'finalize.json', {
    txHash: registryFinalizeReceipt?.hash || registryFinalizeTx.hash,
    payouts,
  });

  console.log('✅ AURORA demo completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
