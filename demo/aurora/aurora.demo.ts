#!/usr/bin/env ts-node
/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

interface AuroraSpec {
  escrow?: { amountPerItem?: string };
  stake?: { worker?: string; validator?: string };
  resultSchema?: string;
}

interface DeploySummary {
  txHash?: string;
  contracts?: Record<string, string>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function toBigInt(value: string | number | bigint | undefined, fallback: bigint): bigint {
  if (value === undefined || value === null) return fallback;
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Unable to parse bigint value ${value}: ${(error as Error).message}`);
  }
}

function scaleSixDecimalAmount(
  value: string | number | bigint | undefined,
  fallback: bigint
): bigint {
  const raw = toBigInt(value, fallback);
  return ethers.parseUnits(raw.toString(), 12);
}

function writeJson(targetDir: string, name: string, payload: unknown): void {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, name), JSON.stringify(payload, null, 2));
}

async function loadArtifact(contractPath: string, contractName: string) {
  const artifactPath = path.join(
    'artifacts',
    contractPath,
    `${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run hardhat compile first.`);
  }
  const raw = fs.readFileSync(artifactPath, 'utf8');
  return JSON.parse(raw);
}

async function main(): Promise<void> {
  const netArgIndex = process.argv.indexOf('--network');
  const networkName =
    netArgIndex !== -1 && process.argv[netArgIndex + 1]
      ? process.argv[netArgIndex + 1]
      : process.env.NETWORK || 'localhost';
  const chainId = process.env.CHAIN_ID || (networkName === 'localhost' ? '31337' : undefined);
  const reportNet = chainId === '31337' ? 'localhost' : networkName;
  const receiptsDir = path.join('reports', reportNet, 'aurora', 'receipts');

  const rpcUrl = requireEnv('RPC_URL');
  const employerKey = requireEnv('PRIVATE_KEY');
  const workerKey = process.env.WORKER_PRIVATE_KEY || employerKey;
  const validatorKey = process.env.VALIDATOR_PRIVATE_KEY || workerKey;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const employer = new ethers.Wallet(employerKey, provider);
  const worker = workerKey === employerKey ? employer : new ethers.Wallet(workerKey, provider);
  const validator =
    validatorKey === employerKey
      ? employer
      : validatorKey === workerKey
      ? worker
      : new ethers.Wallet(validatorKey, provider);

  const specPath = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
  const spec: AuroraSpec = fs.existsSync(specPath)
    ? JSON.parse(fs.readFileSync(specPath, 'utf8'))
    : {};

  const deployPath = path.join(receiptsDir, 'deploy.json');
  if (!fs.existsSync(deployPath)) {
    throw new Error(
      `Deployment summary not found at ${deployPath}. Ensure deployDefaults.ts writes the summary via DEPLOY_DEFAULTS_OUTPUT.`
    );
  }
  const deploy: DeploySummary = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
  const contracts = deploy.contracts || {};
  const jobRegistryAddress = contracts.JobRegistry;
  const stakeManagerAddress = contracts.StakeManager;
  const validationModuleAddress = contracts.ValidationModule;
  if (!jobRegistryAddress || !stakeManagerAddress || !validationModuleAddress) {
    throw new Error('Deployment summary missing JobRegistry, StakeManager or ValidationModule addresses.');
  }

  const agialphaAddress = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

  const jobRegistryArtifact = await loadArtifact('contracts/v2/JobRegistry.sol', 'JobRegistry');
  const stakeManagerArtifact = await loadArtifact('contracts/v2/StakeManager.sol', 'StakeManager');
  const validationArtifact = await loadArtifact('contracts/v2/ValidationModule.sol', 'ValidationModule');
  const tokenArtifact = await loadArtifact('contracts/test/AGIALPHAToken.sol', 'AGIALPHAToken');

  const jobRegistry = new ethers.Contract(jobRegistryAddress, jobRegistryArtifact.abi, provider);
  const stakeManager = new ethers.Contract(stakeManagerAddress, stakeManagerArtifact.abi, provider);
  const validationModule = new ethers.Contract(validationModuleAddress, validationArtifact.abi, provider);
  const token = new ethers.Contract(agialphaAddress, tokenArtifact.abi, provider);

  const quickstartEnv = {
    RPC_URL: rpcUrl,
    PRIVATE_KEY: validatorKey,
    JOB_REGISTRY: jobRegistryAddress,
    STAKE_MANAGER: stakeManagerAddress,
    VALIDATION_MODULE: validationModuleAddress,
    AGIALPHA_TOKEN: agialphaAddress,
    ATTESTATION_REGISTRY: contracts.IdentityRegistry || ethers.ZeroAddress,
  };

  const reward = scaleSixDecimalAmount(spec.escrow?.amountPerItem, 5_000_000n);
  const workerStake = scaleSixDecimalAmount(spec.stake?.worker, 20_000_000n);
  const validatorStake = scaleSixDecimalAmount(spec.stake?.validator, 50_000_000n);
  const allowanceBuffer = reward * 4n;

  const receipts: Record<string, unknown> = {};

  // Write deployment receipt echo for convenience
  if (deploy.txHash) {
    writeJson(receiptsDir, 'deploy.json', deploy);
  }

  console.log('🛰  Creating job...');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const specHash = ethers.id(spec.resultSchema || 'aurora-demo-spec');
  const specUri = spec.acceptanceCriteriaURI || 'ipfs://aurora-spec-placeholder';

  await token.connect(employer).acceptTerms().catch(() => undefined);
  await jobRegistry.connect(employer).acknowledgeTaxPolicy().catch(() => undefined);
  const approveTx = await token
    .connect(employer)
    .approve(stakeManagerAddress, allowanceBuffer);
  await approveTx.wait();
  const jobTx = await jobRegistry
    .connect(employer)
    .createJob(reward, deadline, specHash, specUri);
  const jobReceipt = await jobTx.wait();
  let jobId = 1;
  for (const log of jobReceipt.logs) {
    try {
      const parsed = jobRegistry.interface.parseLog(log);
      if (parsed.name === 'JobCreated') {
        jobId = Number(parsed.args.jobId);
        receipts.postJob = {
          jobId,
          txHash: jobReceipt.hash,
          employer: parsed.args.employer,
          reward: parsed.args.reward.toString(),
          fee: parsed.args.fee.toString(),
        };
        break;
      }
    } catch (error) {
      // ignore non-registry logs
      void error;
    }
  }
  writeJson(receiptsDir, 'postJob.json', receipts.postJob || { jobId, txHash: jobReceipt.hash });

  console.log('💎 Staking as worker...');
  await token.connect(worker).acceptTerms().catch(() => undefined);
  await jobRegistry.connect(worker).acknowledgeTaxPolicy().catch(() => undefined);
  const workerApprove = await token
    .connect(worker)
    .approve(stakeManagerAddress, workerStake * 10n);
  await workerApprove.wait();
  const workerStakeTx = await stakeManager
    .connect(worker)
    .depositStake(0, workerStake);
  const workerStakeReceipt = await workerStakeTx.wait();
  receipts.workerStake = {
    txHash: workerStakeReceipt.hash,
    staker: worker.address,
    amount: workerStake.toString(),
  };

  console.log('🛡  Staking as validator...');
  await token.connect(validator).acceptTerms().catch(() => undefined);
  await jobRegistry.connect(validator).acknowledgeTaxPolicy().catch(() => undefined);
  const validatorApprove = await token
    .connect(validator)
    .approve(stakeManagerAddress, validatorStake * 10n);
  await validatorApprove.wait();
  const validatorStakeTx = await stakeManager
    .connect(validator)
    .depositStake(1, validatorStake);
  const validatorStakeReceipt = await validatorStakeTx.wait();
  receipts.validatorStake = {
    txHash: validatorStakeReceipt.hash,
    staker: validator.address,
    amount: validatorStake.toString(),
  };

  console.log('📦 Submitting result...');
  const resultUri = 'ipfs://example-result-hash';
  const submitTx = await jobRegistry
    .connect(worker)
    .submit(jobId, ethers.id(resultUri), resultUri);
  const submitReceipt = await submitTx.wait();
  receipts.submit = {
    txHash: submitReceipt.hash,
    worker: worker.address,
    resultUri,
  };
  writeJson(receiptsDir, 'submit.json', receipts.submit);

  console.log('🧪 Validation (best effort)...');
  let validationSummary: Record<string, unknown> = {};
  try {
    const envBackup = { ...process.env };
    Object.assign(process.env, quickstartEnv);
    delete require.cache[require.resolve('../../examples/ethers-quickstart.js')];
    const quickstart = require('../../examples/ethers-quickstart.js');

    const plan = await quickstart.computeValidationCommit(jobId, true, {
      subdomain: '',
      skipFinalize: false,
    });

    // Commit
    const commitTx = await validationModule
      .connect(validator)
      .commitValidation(jobId, plan.commitHash, '', []);
    await commitTx.wait();

    // Fast-forward time to satisfy commit window
    const commitWindow = await validationModule.commitWindow();
    try {
      const delta = Number(commitWindow) + 5;
      if (delta > 0) {
        await provider.send('evm_increaseTime', [delta]);
        await provider.send('evm_mine', []);
      }
    } catch (error) {
      console.warn('⚠️  Unable to fast-forward commit window:', (error as Error).message);
    }

    const revealTx = await validationModule
      .connect(validator)
      .revealValidation(jobId, true, plan.burnTxHash || ethers.ZeroHash, plan.salt, '', []);
    await revealTx.wait();

    try {
      const finalizeTx = await validationModule
        .connect(validator)
        .finalize(jobId);
      const finalizeReceipt = await finalizeTx.wait();
      validationSummary.finalizeTx = finalizeReceipt.hash;
    } catch (error) {
      console.warn('⚠️  Finalize call reverted:', (error as Error).message);
    }

    validationSummary = {
      commitHash: plan.commitHash,
      salt: plan.salt,
      burnTxHash: plan.burnTxHash,
      commits: 1,
      reveals: 1,
      ...validationSummary,
    };
  } catch (error) {
    validationSummary = {
      error: (error as Error).message,
    };
    console.warn('⚠️  Validation flow encountered an error:', (error as Error).message);
  }
  writeJson(receiptsDir, 'validate.json', validationSummary);

  const payouts: Record<string, string> = {};
  try {
    const workerBalance = await stakeManager.lockedStakes(worker.address);
    payouts.workerLocked = workerBalance.toString();
    const validatorBalance = await stakeManager.lockedStakes(validator.address);
    payouts.validatorLocked = validatorBalance.toString();
  } catch (error) {
    console.warn('⚠️  Unable to query stake balances:', (error as Error).message);
  }

  writeJson(receiptsDir, 'finalize.json', {
    txHash: validationSummary.finalizeTx || null,
    payouts,
  });

  writeJson(receiptsDir, 'workerStake.json', receipts.workerStake);
  writeJson(receiptsDir, 'validatorStake.json', receipts.validatorStake);

  console.log('✅ AURORA demo completed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
