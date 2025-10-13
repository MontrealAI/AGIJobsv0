const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const {
  decimals: AGIALPHA_DECIMALS,
  address: AGIALPHA_DEFAULT_ADDRESS,
} = require('../config/agialpha.json');

const TOKEN_DECIMALS = AGIALPHA_DECIMALS;
const DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
];

const ROLE_MAP = {
  agent: 0,
  worker: 0,
  validator: 1,
  platform: 2,
  operator: 2,
};

const registryAbi = [
  'event JobCreated(uint256 indexed jobId)',
  'function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri)',
  'function applyForJob(uint256 jobId, string subdomain, bytes32[] proof)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI)',
  'function acknowledgeTaxPolicy()',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
];
const stakeAbi = ['function depositStake(uint8 role, uint256 amount)'];
const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];
const validationAbi = [
  'function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
];
const attestAbi = [
  'function attest(bytes32 node, uint8 role, address who)',
  'function revoke(bytes32 node, uint8 role, address who)',
];

let cachedContracts;
let cachedDeployment;

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function resolveRpcUrl() {
  return process.env.RPC_URL || 'http://127.0.0.1:8545';
}

function resolvePrivateKey() {
  return process.env.PRIVATE_KEY || DEFAULT_KEYS[0];
}

function resolveNetworkSlug() {
  if (process.env.NETWORK && process.env.NETWORK !== '') {
    return process.env.NETWORK;
  }
  if (process.env.CHAIN_ID === '31337') {
    return 'localhost';
  }
  return undefined;
}

function loadDeploymentSummary() {
  if (cachedDeployment !== undefined) {
    return cachedDeployment;
  }

  const candidates = [];
  if (process.env.AURORA_DEPLOY_OUTPUT) {
    candidates.push(process.env.AURORA_DEPLOY_OUTPUT);
  }
  const slug = resolveNetworkSlug();
  if (slug) {
    candidates.push(path.join('reports', slug, 'aurora', 'receipts', 'deploy.json'));
  }
  candidates.push(path.join('reports', 'localhost', 'aurora', 'receipts', 'deploy.json'));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        cachedDeployment = parsed;
        return parsed;
      }
    } catch (error) {
      console.warn(`Failed to read deployment summary at ${candidate}:`, error);
    }
  }

  cachedDeployment = null;
  return cachedDeployment;
}

function resolveAddress(envName, summaryKey, fallback) {
  const envValue = process.env[envName];
  if (envValue && envValue !== '') {
    return envValue;
  }
  const deployment = loadDeploymentSummary();
  if (deployment && deployment.contracts && deployment.contracts[summaryKey]) {
    const value = deployment.contracts[summaryKey];
    process.env[envName] = value;
    return value;
  }
  if (fallback) {
    process.env[envName] = fallback;
    return fallback;
  }
  throw new Error(`Missing required environment variable ${envName}`);
}

async function getRunnerAddress(runner, provider) {
  if (runner && typeof runner.getAddress === 'function') {
    return runner.getAddress();
  }
  if (provider && typeof provider.getSigner === 'function') {
    return provider.getSigner().getAddress();
  }
  throw new Error('Unable to resolve signer address');
}

function normaliseRole(input) {
  if (input === undefined || input === null) {
    return 0;
  }
  if (typeof input === 'number') {
    return input;
  }
  if (typeof input === 'string') {
    const lowered = input.toLowerCase();
    if (ROLE_MAP.hasOwnProperty(lowered)) {
      return ROLE_MAP[lowered];
    }
  }
  throw new Error(`Unsupported stake role: ${input}`);
}

async function ensureContracts() {
  if (cachedContracts) {
    return cachedContracts;
  }

  const provider = new ethers.JsonRpcProvider(resolveRpcUrl());
  const signer = new ethers.Wallet(resolvePrivateKey(), provider);

  const registryAddress = resolveAddress('JOB_REGISTRY', 'JobRegistry');
  const stakeManagerAddress = resolveAddress('STAKE_MANAGER', 'StakeManager');
  const validationModuleAddress = resolveAddress('VALIDATION_MODULE', 'ValidationModule');
  const attestationAddress = (() => {
    try {
      return resolveAddress('ATTESTATION_REGISTRY', 'AttestationRegistry');
    } catch (err) {
      try {
        return resolveAddress('IDENTITY_REGISTRY', 'IdentityRegistry');
      } catch (inner) {
        return null;
      }
    }
  })();
  const agialphaAddress = resolveAddress(
    'AGIALPHA_TOKEN',
    'AGIALPHAToken',
    AGIALPHA_DEFAULT_ADDRESS
  );

  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const stakeManager = new ethers.Contract(stakeManagerAddress, stakeAbi, signer);
  const agialphaToken = new ethers.Contract(agialphaAddress, erc20Abi, signer);
  const validation = new ethers.Contract(validationModuleAddress, validationAbi, signer);
  const attestation = attestationAddress
    ? new ethers.Contract(attestationAddress, attestAbi, signer)
    : null;

  cachedContracts = {
    provider,
    signer,
    registry,
    stakeManager,
    agialphaToken,
    validation,
    attestation,
  };

  return cachedContracts;
}

function isBytes32Hash(value) {
  return typeof value === 'string' && ethers.isHexString(value, 32);
}

function callRaiseDispute(registryContract, jobId, payload, overrides) {
  const hasOverrides =
    overrides && typeof overrides === 'object' && Object.keys(overrides).length;

  if (isBytes32Hash(payload)) {
    const method = registryContract['raiseDispute(uint256,bytes32)'];
    if (typeof method !== 'function') {
      throw new Error('Registry is missing raiseDispute(uint256,bytes32)');
    }
    const args = [jobId, ethers.zeroPadValue(payload, 32)];
    return hasOverrides ? method(...args, overrides) : method(...args);
  }

  const method = registryContract['raiseDispute(uint256,string)'];
  if (typeof method !== 'function') {
    throw new Error('Registry is missing raiseDispute(uint256,string)');
  }
  const args = [jobId, payload];
  return hasOverrides ? method(...args, overrides) : method(...args);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBigInt(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function toBytes32(value, { label, randomIfMissing = false, allowText = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (randomIfMissing) {
      return ethers.hexlify(ethers.randomBytes(32));
    }
    return ethers.ZeroHash;
  }

  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === 'auto' || lowered === 'random') {
      return ethers.hexlify(ethers.randomBytes(32));
    }
  }

  if (ethers.isHexString(value)) {
    return ethers.zeroPadValue(value, 32);
  }

  if (allowText && typeof value === 'string') {
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }

  throw new Error(
    `Expected 32-byte hex string for ${label || 'bytes32'} (received ${value})`
  );
}

function normaliseProof(proof) {
  if (!proof) {
    return [];
  }
  if (!Array.isArray(proof)) {
    throw new Error('Validator proof must be an array of bytes32 values.');
  }
  return proof.map((entry, index) => {
    if (!ethers.isHexString(entry)) {
      throw new Error(`Validator proof entry ${index} must be a hex string.`);
    }
    return ethers.zeroPadValue(entry, 32);
  });
}

function parseValidationOptions(args) {
  const options = { subdomain: '', proof: [] };
  for (const arg of args) {
    if (arg === undefined || arg === null) continue;
    if (typeof arg === 'string') {
      if (!options.subdomain) {
        options.subdomain = arg;
      } else if (!options.burnTxHash) {
        options.burnTxHash = arg;
      } else if (!options.salt) {
        options.salt = arg;
      }
    } else if (Array.isArray(arg)) {
      options.proof = arg;
    } else if (isPlainObject(arg)) {
      Object.assign(options, arg);
    }
  }
  if (!options.proof) options.proof = [];
  if (!options.subdomain) options.subdomain = '';
  return options;
}

async function computeValidationCommit(jobIdInput, approve, options = {}) {
  if (typeof approve !== 'boolean') {
    throw new Error('The `approve` flag must be a boolean.');
  }

  const { provider, validation, registry } = await ensureContracts();
  const jobId = BigInt(jobIdInput);

  const runner = validation.runner;
  const defaultValidator = await getRunnerAddress(runner, provider).catch(
    () => undefined
  );

  const validator = options.validator
    ? ethers.getAddress(options.validator)
    : defaultValidator
    ? ethers.getAddress(defaultValidator)
    : (() => {
        throw new Error('Unable to determine validator address for commit calculation');
      })();

  const providedChainId = toBigInt(options.chainId, 'chainId');
  const chainId =
    providedChainId !== undefined
      ? providedChainId
      : (await provider.getNetwork()).chainId;

  const domainSeparator =
    options.domainSeparator !== undefined
      ? toBytes32(options.domainSeparator, { label: 'domainSeparator' })
      : await validation.DOMAIN_SEPARATOR();

  const providedNonce = toBigInt(options.nonce, 'nonce');
  const nonce =
    providedNonce !== undefined ? providedNonce : await validation.jobNonce(jobId);

  const specHash =
    options.specHash !== undefined
      ? toBytes32(options.specHash, { label: 'specHash' })
      : await registry.getSpecHash(jobId);

  const burnTxHash = toBytes32(options.burnTxHash, { label: 'burnTxHash' });
  const salt = toBytes32(options.salt, {
    label: 'salt',
    randomIfMissing: true,
  });

  const outcomeHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );

  const commitHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domainSeparator]
    )
  );

  return {
    commitHash,
    salt,
    burnTxHash,
    nonce,
    specHash,
    chainId,
    validator,
    domainSeparator,
  };
}

function maybeLog(result) {
  try {
    if (result !== undefined) {
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.warn('Failed to serialise result', error);
  }
  return result;
}

function parseSpec(input) {
  if (!isPlainObject(input)) {
    return null;
  }
  const spec = input;
  const amount = spec?.escrow?.amountPerItem;
  const uri = spec?.acceptanceCriteriaURI || spec?.resultSchema || 'ipfs://job';
  const specHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(spec, Object.keys(spec).sort()))
  );
  return {
    amount,
    uri,
    specHash,
  };
}

async function postJob(input = '1') {
  const { registry } = await ensureContracts();
  const parsedSpec = parseSpec(input);
  const amount = parsedSpec?.amount ?? input;
  const reward = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const specHash = parsedSpec?.specHash || ethers.id('spec');
  const specUri = parsedSpec?.uri || 'ipfs://job';
  const tx = await registry.createJob(reward, deadline, specHash, specUri);
  const receipt = await tx.wait();

  let jobId = 0n;
  if (receipt && Array.isArray(receipt.logs)) {
    for (const log of receipt.logs) {
      try {
        const parsed = registry.interface.parseLog(log);
        if (parsed.name === 'JobCreated') {
          jobId = BigInt(parsed.args.jobId);
          break;
        }
      } catch (err) {
        continue; // skip non-registry logs
      }
    }
  }
  if (jobId === 0n) {
    jobId = 1n;
  }

  return maybeLog({
    txHash: receipt?.hash || tx.hash,
    jobId: jobId.toString(),
    reward: reward.toString(),
    specHash,
    specUri,
    deadline,
  });
}

async function acknowledgeTaxPolicy(options = {}) {
  const { registry, provider } = await ensureContracts();
  const runner = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : registry.runner;
  const tx = await registry.connect(runner).acknowledgeTaxPolicy();
  await tx.wait();
  const actor = await getRunnerAddress(runner, provider).catch(() => undefined);
  return maybeLog({ txHash: tx.hash, actor });
}

async function approveStake(amount, options = {}) {
  const { stakeManager, agialphaToken, provider } = await ensureContracts();
  const runner = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : agialphaToken.runner;
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const stakeManagerAddress =
    typeof stakeManager.target === 'string'
      ? stakeManager.target
      : await stakeManager.getAddress();
  const owner = await getRunnerAddress(runner, provider);
  const allowance = await agialphaToken
    .connect(runner)
    .allowance(owner, stakeManagerAddress);
  if (allowance >= parsed) {
    return maybeLog({ allowance: allowance.toString(), approved: true });
  }
  const tx = await agialphaToken.connect(runner).approve(stakeManagerAddress, parsed);
  const receipt = await tx.wait();
  return maybeLog({ txHash: receipt?.hash || tx.hash, amount: parsed.toString() });
}

async function prepareStake(amount, options = {}) {
  await acknowledgeTaxPolicy(options);
  await approveStake(amount, options);
}

async function stake(amount, options = {}) {
  const { stakeManager, provider } = await ensureContracts();
  const runner = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : stakeManager.runner;
  const role = normaliseRole(options.role);
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const tx = await stakeManager.connect(runner).depositStake(role, parsed);
  const receipt = await tx.wait();
  const staker = await getRunnerAddress(runner, provider).catch(() => undefined);
  return maybeLog({
    txHash: receipt?.hash || tx.hash,
    role,
    amount: parsed.toString(),
    staker,
  });
}

async function apply(jobId, subdomain, proof, options = {}) {
  const { registry, provider } = await ensureContracts();
  const runner = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : registry.runner;
  const tx = await registry.connect(runner).applyForJob(jobId, subdomain, proof || []);
  const receipt = await tx.wait();
  return maybeLog({ txHash: receipt?.hash || tx.hash, jobId: jobId.toString(), subdomain });
}

async function submit(jobId, uri, options = {}) {
  const { registry, provider } = await ensureContracts();
  const runner = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : registry.runner;
  const hash = ethers.id(uri);
  const tx = await registry.connect(runner).submit(jobId, hash, uri);
  const receipt = await tx.wait();
  const worker = await getRunnerAddress(runner, provider).catch(() => undefined);
  return maybeLog({
    txHash: receipt?.hash || tx.hash,
    jobId: jobId.toString(),
    worker,
    resultURI: uri,
    resultHash: hash,
  });
}

async function validate(jobId, commitOrApprove, ...rest) {
  const { validation, provider } = await ensureContracts();
  const runner = validation.runner;
  const [maybeSubdomain, maybeProof, maybeApprove, maybeSalt, maybeBurn] = rest;

  if (
    typeof commitOrApprove === 'string' &&
    commitOrApprove.startsWith('0x') &&
    typeof maybeApprove === 'boolean'
  ) {
    const subdomain = typeof maybeSubdomain === 'string' ? maybeSubdomain : '';
    const proof = normaliseProof(Array.isArray(maybeProof) ? maybeProof : []);
    const approve = maybeApprove;
    const salt = toBytes32(maybeSalt, { label: 'salt' });
    const burnTxHash = toBytes32(maybeBurn, { label: 'burnTxHash' });

    const commitTx = await validation
      .connect(runner)
      .commitValidation(jobId, ethers.zeroPadValue(commitOrApprove, 32), subdomain, proof);
    const commitReceipt = await commitTx.wait();

    const revealTx = await validation
      .connect(runner)
      .revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof);
    const revealReceipt = await revealTx.wait();

    const finalizeTx = await validation.connect(runner).finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();

    return maybeLog({
      commitHash: ethers.zeroPadValue(commitOrApprove, 32),
      salt,
      burnTxHash,
      commitTx: commitReceipt?.hash || commitTx.hash,
      revealTx: revealReceipt?.hash || revealTx.hash,
      finalizeTx: finalizeReceipt?.hash || finalizeTx.hash,
    });
  }

  const approve = commitOrApprove;
  const options = parseValidationOptions(rest);
  const proof = normaliseProof(options.proof);

  const plan = await computeValidationCommit(jobId, approve, options);

  const commitTx = await validation
    .connect(runner)
    .commitValidation(jobId, plan.commitHash, options.subdomain, proof);
  const commitReceipt = await commitTx.wait();

  const revealTx = await validation
    .connect(runner)
    .revealValidation(
      jobId,
      approve,
      plan.burnTxHash,
      plan.salt,
      options.subdomain,
      proof
    );
  const revealReceipt = await revealTx.wait();

  if (!options.skipFinalize) {
    const finalizeTx = await validation.connect(runner).finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();
    plan.finalizeTx = finalizeReceipt?.hash || finalizeTx.hash;
  }

  plan.commitTx = commitReceipt?.hash || commitTx.hash;
  plan.revealTx = revealReceipt?.hash || revealTx.hash;

  return maybeLog(plan);
}

async function dispute(jobId, evidence, options = {}) {
  const { registry, provider } = await ensureContracts();
  const signer = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : registry.signer;
  const tx = await callRaiseDispute(registry.connect(signer), jobId, evidence);
  const receipt = await tx.wait();
  return maybeLog({ txHash: receipt?.hash || tx.hash, jobId: jobId.toString() });
}

async function attest(name, role, delegate, options = {}) {
  const { attestation, provider } = await ensureContracts();
  if (!attestation) {
    throw new Error('Attestation registry not configured');
  }
  const signer = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : attestation.signer;
  const node = ethers.namehash(name);
  const tx = await attestation.connect(signer).attest(node, role, delegate);
  await tx.wait();
  return maybeLog({ txHash: tx.hash, name, role, delegate });
}

async function revoke(name, role, delegate, options = {}) {
  const { attestation, provider } = await ensureContracts();
  if (!attestation) {
    throw new Error('Attestation registry not configured');
  }
  const signer = options.privateKey
    ? new ethers.Wallet(options.privateKey, provider)
    : attestation.signer;
  const node = ethers.namehash(name);
  const tx = await attestation.connect(signer).revoke(node, role, delegate);
  await tx.wait();
  return maybeLog({ txHash: tx.hash, name, role, delegate });
}

module.exports = {
  postJob,
  acknowledgeTaxPolicy,
  approveStake,
  prepareStake,
  stake,
  apply,
  submit,
  validate,
  dispute,
  attest,
  revoke,
  computeValidationCommit,
  __test__: {
    callRaiseDispute,
    isBytes32Hash,
  },
};
