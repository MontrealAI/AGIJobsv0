#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ethers } from 'ethers';

type AddressBook = Record<string, string>;

type ReceiptData = Record<string, unknown>;

const MODULE_KEYS = [
  'StakeManager',
  'JobRegistry',
  'ValidationModule',
  'ReputationEngine',
  'DisputeModule',
  'CertificateNFT',
  'PlatformRegistry',
  'JobRouter',
  'PlatformIncentives',
  'FeePool',
  'TaxPolicy',
  'IdentityRegistry',
  'SystemPause',
  'AttestationRegistry',
  'AGIALPHAToken',
];

function normaliseAddress(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing address for ${label}`);
  }
  return ethers.getAddress(value);
}

function parseAddresses(logPath: string | undefined): AddressBook {
  const results: AddressBook = {};
  if (!logPath || !fs.existsSync(logPath)) {
    return results;
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const regex = /0x[0-9a-fA-F]{40}/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!regex.test(line)) continue;
    const match = line.match(regex);
    if (!match) continue;
    for (const key of MODULE_KEYS) {
      if (!results[key] && line.toLowerCase().includes(key.toLowerCase())) {
        results[key] = ethers.getAddress(match[0]);
        break;
      }
    }
    if (!results.AGIALPHAToken && /agialpha/i.test(line)) {
      results.AGIALPHAToken = ethers.getAddress(match[0]);
    }
    if (!results.AttestationRegistry && /attestation/i.test(line)) {
      results.AttestationRegistry = ethers.getAddress(match[0]);
    }
  }
  return results;
}

function writeJson(target: string, data: ReceiptData) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, 2));
}

function formatUnitsSafe(value: unknown, decimals: number, fallback: string): string {
  try {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    const asBigInt = typeof value === 'string' || typeof value === 'number' ? BigInt(value) : BigInt(String(value));
    return ethers.formatUnits(asBigInt, decimals);
  } catch (err) {
    console.warn(`Unable to format amount ${value}: ${(err as Error).message}`);
    return fallback;
  }
}

async function main() {
  const netIndex = process.argv.indexOf('--network');
  const network =
    netIndex !== -1 && process.argv[netIndex + 1]
      ? process.argv[netIndex + 1]
      : process.env.NETWORK || 'localhost';
  process.env.NETWORK = network;

  const baseReportDir = path.join('reports', network, 'aurora');
  const receiptsDir = path.join(baseReportDir, 'receipts');
  fs.mkdirSync(receiptsDir, { recursive: true });

  const deployLogPath = process.env.AURORA_DEPLOY_LOG || path.join(baseReportDir, 'deploy.log');
  const parsedAddresses = parseAddresses(deployLogPath);

  const configPath = path.join('config', 'agialpha.json');
  const agiConfig = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : { address: ethers.ZeroAddress };

  const addressBook: AddressBook = {
    ...parsedAddresses,
    JobRegistry: parsedAddresses.JobRegistry || process.env.JOB_REGISTRY,
    StakeManager: parsedAddresses.StakeManager || process.env.STAKE_MANAGER,
    ValidationModule: parsedAddresses.ValidationModule || process.env.VALIDATION_MODULE,
    AttestationRegistry:
      parsedAddresses.AttestationRegistry || process.env.ATTESTATION_REGISTRY || ethers.ZeroAddress,
    AGIALPHAToken: parsedAddresses.AGIALPHAToken || process.env.AGIALPHA_TOKEN || agiConfig.address,
  };

  process.env.JOB_REGISTRY = normaliseAddress(addressBook.JobRegistry, 'JobRegistry');
  process.env.STAKE_MANAGER = normaliseAddress(addressBook.StakeManager, 'StakeManager');
  process.env.VALIDATION_MODULE = normaliseAddress(addressBook.ValidationModule, 'ValidationModule');
  process.env.AGIALPHA_TOKEN = normaliseAddress(addressBook.AGIALPHAToken, 'AGIALPHA token');
  process.env.ATTESTATION_REGISTRY = ethers.getAddress(addressBook.AttestationRegistry);

  const rpcUrl = process.env.RPC_URL || (network === 'localhost' ? 'http://127.0.0.1:8545' : undefined);
  const privateKey = process.env.PRIVATE_KEY;
  if (!rpcUrl) {
    throw new Error('RPC_URL must be configured');
  }
  if (!privateKey) {
    throw new Error('PRIVATE_KEY must be configured');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const quickstart = require(path.resolve(process.cwd(), 'examples/ethers-quickstart.js'));

  const specPath = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
  const spec = fs.existsSync(specPath)
    ? JSON.parse(fs.readFileSync(specPath, 'utf8'))
    : { escrow: {}, stake: {} };

  const rewardAmount = formatUnitsSafe(spec?.escrow?.amountPerItem, 6, '5');
  const workerStakeAmount = formatUnitsSafe(spec?.stake?.worker, 6, '20');
  const validatorStakeAmount = formatUnitsSafe(spec?.stake?.validator, 6, workerStakeAmount);

  const registry = new ethers.Contract(
    process.env.JOB_REGISTRY,
    [
      'function jobCount() view returns (uint256)',
      'event JobCreated(uint256 indexed jobId, address indexed employer, bytes32 specHash, string uri, address token, uint256 reward, uint64 deadline)',
      'event JobSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string uri)',
      'event JobFinalized(uint256 indexed jobId, address indexed worker, address indexed validator, uint256 payout)',
    ],
    provider
  );

  const validation = new ethers.Contract(
    process.env.VALIDATION_MODULE,
    [
      'event ValidationCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash, string subdomain)',
      'event ValidationRevealed(uint256 indexed jobId, address indexed validator, bool approve, bytes32 burnTxHash, string subdomain)',
      'event ValidationTallied(uint256 indexed jobId, bool success, uint256 approvals, uint256 rejections)',
    ],
    provider
  );

  const stakeManagerRead = new ethers.Contract(
    process.env.STAKE_MANAGER,
    ['event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount)'],
    provider
  );

  const stakeManagerWrite = new ethers.Contract(
    process.env.STAKE_MANAGER,
    ['function depositStake(uint8 role, uint256 amount)'],
    signer
  );

  const TOKEN_DECIMALS = 18;
  const receipts: Record<string, ReceiptData> = {};

  const receiptsPath = (name: string) => path.join(receiptsDir, `${name}.json`);

  console.log('⏳ Compiling artifacts (safety check)…');
  try {
    execSync('npx hardhat compile --force', { stdio: 'inherit' });
  } catch (err) {
    console.warn('Hardhat compile failed, continuing with existing artifacts:', (err as Error).message);
  }

  console.log('🛰  Posting job…');
  const postBefore = await provider.getBlockNumber();
  await quickstart.postJob(rewardAmount);
  const postAfter = await provider.getBlockNumber();
  const jobIdBn: bigint = await registry.jobCount();
  const jobId = Number(jobIdBn);
  const postEvents = await registry.queryFilter(
    registry.filters.JobCreated(jobIdBn),
    Math.max(postBefore + 1, postAfter - 5),
    postAfter
  );
  const postEvent = postEvents[0];
  receipts.postJob = {
    jobId,
    txHash: postEvent?.transactionHash,
    blockNumber: postEvent?.blockNumber,
    reward: rewardAmount,
    employer: postEvent?.args?.employer || (await signer.getAddress()),
  };
  writeJson(receiptsPath('postJob'), receipts.postJob);

  console.log('💎 Preparing stake (agent)…');
  await quickstart.prepareStake(workerStakeAmount);
  const stakeBefore = await provider.getBlockNumber();
  await quickstart.stake(workerStakeAmount);
  const stakeAfter = await provider.getBlockNumber();
  const stakeEvents = await stakeManagerRead.queryFilter(
    stakeManagerRead.filters.StakeDeposited(await signer.getAddress(), null),
    Math.max(stakeBefore + 1, stakeAfter - 5),
    stakeAfter
  );
  receipts.stakeWorker = {
    amount: workerStakeAmount,
    events: stakeEvents.map((evt) => ({
      txHash: evt.transactionHash,
      role: evt.args?.role,
      amount: evt.args?.amount?.toString(),
    })),
  };
  writeJson(receiptsPath('stakeWorker'), receipts.stakeWorker);

  console.log('🛡  Preparing stake (validator)…');
  await quickstart.prepareStake(validatorStakeAmount);
  const validatorAmount = ethers.parseUnits(validatorStakeAmount, TOKEN_DECIMALS);
  const validatorTx = await stakeManagerWrite.depositStake(1, validatorAmount);
  const validatorReceipt = await validatorTx.wait();
  receipts.stakeValidator = {
    amount: validatorStakeAmount,
    txHash: validatorReceipt?.hash,
  };
  writeJson(receiptsPath('stakeValidator'), receipts.stakeValidator);

  console.log('📦 Submitting result…');
  const submitBefore = await provider.getBlockNumber();
  const resultUri = 'ipfs://example-result-hash';
  await quickstart.submit(jobId, resultUri);
  const submitAfter = await provider.getBlockNumber();
  const submitEvents = await registry.queryFilter(
    registry.filters.JobSubmitted(BigInt(jobId)),
    Math.max(submitBefore + 1, submitAfter - 5),
    submitAfter
  );
  const submitEvent = submitEvents[0];
  receipts.submit = {
    jobId,
    txHash: submitEvent?.transactionHash,
    worker: submitEvent?.args?.worker,
    resultURI: resultUri,
  };
  writeJson(receiptsPath('submit'), receipts.submit);

  console.log('🧪 Running validation (commit→reveal)…');
  const validateBefore = await provider.getBlockNumber();
  const plan = await quickstart.validate(jobId, true, { skipFinalize: false });
  const validateAfter = await provider.getBlockNumber();
  const commitEvents = await validation.queryFilter(
    validation.filters.ValidationCommitted(BigInt(jobId)),
    Math.max(validateBefore + 1, validateAfter - 5),
    validateAfter
  );
  const revealEvents = await validation.queryFilter(
    validation.filters.ValidationRevealed(BigInt(jobId)),
    Math.max(validateBefore + 1, validateAfter - 5),
    validateAfter
  );
  const tallyEvents = await validation.queryFilter(
    validation.filters.ValidationTallied(BigInt(jobId)),
    Math.max(validateBefore + 1, validateAfter - 5),
    validateAfter
  );
  receipts.validate = {
    jobId,
    commits: commitEvents.length,
    reveals: revealEvents.length,
    finalizeTx: tallyEvents[0]?.transactionHash,
    approvals: tallyEvents[0]?.args?.approvals?.toString(),
    rejections: tallyEvents[0]?.args?.rejections?.toString(),
    plan,
  };
  writeJson(receiptsPath('validate'), receipts.validate);

  console.log('🌡  Thermostat dry-run…');
  try {
    execSync(`npx hardhat run scripts/v2/updateThermodynamics.ts --network ${network}`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('Thermostat update skipped:', (err as Error).message);
  }

  const finalizeEvents = await registry.queryFilter(
    registry.filters.JobFinalized(BigInt(jobId)),
    Math.max(validateBefore + 1, validateAfter),
    await provider.getBlockNumber()
  );
  const finalEvent = finalizeEvents[0];
  receipts.finalize = {
    jobId,
    txHash: finalEvent?.transactionHash || receipts.validate.finalizeTx,
    payouts: finalEvent?.args ? { worker: finalEvent.args.worker, validator: finalEvent.args.validator } : {},
  };
  writeJson(receiptsPath('finalize'), receipts.finalize);

  if (deployLogPath && fs.existsSync(deployLogPath)) {
    const deployReceipt = {
      source: deployLogPath,
    };
    writeJson(receiptsPath('deploy'), deployReceipt);
  }

  console.log('✅ AURORA demo completed. Receipts available in', receiptsDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
