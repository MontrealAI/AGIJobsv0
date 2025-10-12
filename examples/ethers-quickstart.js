const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Canonical $AGIALPHA token uses 18 decimals
const { decimals: AGIALPHA_DECIMALS } = require('../config/agialpha.json');
const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const provider = new ethers.JsonRpcProvider(requireEnv('RPC_URL'));
const signer = new ethers.Wallet(requireEnv('PRIVATE_KEY'), provider);

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

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

function toBytes32(
  value,
  { label, randomIfMissing = false, allowText = false } = {}
) {
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

  const jobId = BigInt(jobIdInput);

  const validator = options.validator
    ? ethers.getAddress(options.validator)
    : await signer.getAddress();

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
    providedNonce !== undefined
      ? providedNonce
      : await validation.jobNonce(jobId);

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

const registryAbi = [
  'function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri)',
  'function applyForJob(uint256 jobId, string subdomain, bytes32[] proof)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI)',
  'function raiseDispute(uint256 jobId, bytes32 evidenceHash)',
  'function raiseDispute(uint256 jobId, string reason)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
];
const stakeAbi = ['function depositStake(uint8 role, uint256 amount)'];
const STAKE_ROLES = {
  agent: 0,
  worker: 0,
  validator: 1,
  platform: 2,
};
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

const registry = new ethers.Contract(
  requireEnv('JOB_REGISTRY'),
  registryAbi,
  signer
);
const stakeManager = new ethers.Contract(
  requireEnv('STAKE_MANAGER'),
  stakeAbi,
  signer
);
const agialphaToken = new ethers.Contract(
  requireEnv('AGIALPHA_TOKEN'),
  erc20Abi,
  signer
);
const validation = new ethers.Contract(
  requireEnv('VALIDATION_MODULE'),
  validationAbi,
  signer
);

const attestation = new ethers.Contract(
  requireEnv('ATTESTATION_REGISTRY'),
  attestAbi,
  signer
);

// Post a job with a reward denominated in AGIALPHA.
// The optional `amount` parameter represents whole tokens and defaults to `1`.
// Amounts are converted using the fixed 18‑decimal configuration.
function readJsonIfExists(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to parse JSON at ${resolved}: ${(error && error.message) || 'unknown error'}`,
    );
  }
}

function rewardFromSpec(spec) {
  if (!spec) return null;
  const amount = spec?.escrow?.amountPerItem;
  if (amount === undefined || amount === null) return null;
  try {
    const decimals = spec?.escrow?.decimals ?? 6;
    return ethers.formatUnits(BigInt(amount), decimals);
  } catch (error) {
    throw new Error(
      `Invalid escrow.amountPerItem in spec: ${(error && error.message) || 'unknown error'}`,
    );
  }
}

function deriveSpecHash(spec, fallback = 'spec') {
  if (!spec) return ethers.id(fallback);
  try {
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(spec)));
  } catch (error) {
    throw new Error(`Unable to hash spec payload: ${(error && error.message) || 'unknown error'}`);
  }
}

async function postJob(input = '1', overrides = {}) {
  let spec = null;
  if (isPlainObject(input)) {
    spec = input;
  } else if (typeof input === 'string' && !overrides.skipResolveSpec) {
    spec = readJsonIfExists(input);
  }

  const rewardTokens =
    overrides.amount ?? overrides.reward ?? rewardFromSpec(spec) ?? input ?? '1';
  const reward = ethers.parseUnits(rewardTokens.toString(), TOKEN_DECIMALS);
  const deadline =
    typeof overrides.deadline === 'number'
      ? overrides.deadline
      : Math.floor(Date.now() / 1000) + 3600;
  const specHash = overrides.specHash ?? deriveSpecHash(spec);
  const specUri =
    overrides.specUri ?? spec?.acceptanceCriteriaURI ?? spec?.resultSchema ?? 'ipfs://job';

  const tx = await registry.createJob(reward, deadline, specHash, specUri);
  const receipt = await tx.wait();
  const nextJobId = await registry.nextJobId();
  const jobId = Number(nextJobId) - 1;
  const employer = await signer.getAddress();

  return {
    jobId,
    employer,
    reward: rewardTokens.toString(),
    specHash,
    specUri,
    txHash: receipt?.hash ?? null,
  };
}

async function acknowledgeTaxPolicy() {
  const tx = await registry.acknowledgeTaxPolicy();
  const receipt = await tx.wait();
  return {
    txHash: receipt?.hash ?? null,
    account: await signer.getAddress(),
  };
}

async function approveStake(amount) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const owner = await signer.getAddress();
  const stakeManagerAddress =
    typeof stakeManager.target === 'string'
      ? stakeManager.target
      : await stakeManager.getAddress();
  const allowance = await agialphaToken.allowance(
    owner,
    stakeManagerAddress
  );
  if (allowance >= parsed) {
    return {
      owner,
      spender: stakeManagerAddress,
      allowance: allowance.toString(),
      txHash: null,
    };
  }
  const tx = await agialphaToken.approve(stakeManagerAddress, parsed);
  const receipt = await tx.wait();
  return {
    owner,
    spender: stakeManagerAddress,
    amount: amount.toString(),
    txHash: receipt?.hash ?? null,
  };
}

async function prepareStake(amount) {
  const acknowledgement = await acknowledgeTaxPolicy();
  const approval = await approveStake(amount);
  return { acknowledgement, approval };
}

async function stake(amount, options = {}) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const roleLabel =
    typeof options.role === 'string' ? options.role.toLowerCase() : 'agent';
  const roleIndex = Object.prototype.hasOwnProperty.call(STAKE_ROLES, roleLabel)
    ? STAKE_ROLES[roleLabel]
    : STAKE_ROLES.agent;
  const tx = await stakeManager.depositStake(roleIndex, parsed);
  const receipt = await tx.wait();
  return {
    txHash: receipt?.hash ?? null,
    role: roleLabel,
    roleIndex,
    amount: amount.toString(),
    account: await signer.getAddress(),
  };
}

// Apply for a job using a `subdomain` label such as "alice" for
// `alice.agent.agi.eth`. Supply a Merkle `proof` if allowlists are enabled.
async function apply(jobId, subdomain, proof) {
  await registry.applyForJob(jobId, subdomain, proof);
}

async function submit(jobId, uri) {
  const hash = ethers.id(uri);
  const tx = await registry.submit(jobId, hash, uri);
  const receipt = await tx.wait();
  return {
    jobId: Number(jobId),
    worker: await signer.getAddress(),
    uri,
    hash,
    txHash: receipt?.hash ?? null,
  };
}

// Validators pass their `subdomain` label under `club.agi.eth` when voting.
async function validate(jobId, commitOrApprove, ...rest) {
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

    const commitTx = await validation.commitValidation(
      jobId,
      ethers.zeroPadValue(commitOrApprove, 32),
      subdomain,
      proof
    );
    const commitReceipt = await commitTx.wait();

    const revealTx = await validation.revealValidation(
      jobId,
      approve,
      burnTxHash,
      salt,
      subdomain,
      proof
    );
    const revealReceipt = await revealTx.wait();

    const finalizeTx = await validation.finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();

    return {
      commitHash: ethers.zeroPadValue(commitOrApprove, 32),
      salt,
      burnTxHash,
      commitTx: commitReceipt?.hash ?? null,
      revealTx: revealReceipt?.hash ?? null,
      finalizeTx: finalizeReceipt?.hash ?? null,
    };
  }

  const approve = commitOrApprove;
  const options = parseValidationOptions(rest);
  const proof = normaliseProof(options.proof);

  const plan = await computeValidationCommit(jobId, approve, options);

  const commitTx = await validation.commitValidation(
    jobId,
    plan.commitHash,
    options.subdomain,
    proof
  );
  const commitReceipt = await commitTx.wait();

  const revealTx = await validation.revealValidation(
    jobId,
    approve,
    plan.burnTxHash,
    plan.salt,
    options.subdomain,
    proof
  );
  const revealReceipt = await revealTx.wait();

  let finalizeHash = null;
  if (!options.skipFinalize) {
    const finalizeTx = await validation.finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();
    finalizeHash = finalizeReceipt?.hash ?? null;
  }

  return {
    ...plan,
    approve,
    subdomain: options.subdomain,
    proof,
    commitTx: commitReceipt?.hash ?? null,
    revealTx: revealReceipt?.hash ?? null,
    finalizeTx: finalizeHash,
  };
}

async function dispute(jobId, evidence) {
  await callRaiseDispute(registry, jobId, evidence);
}

async function attest(name, role, delegate) {
  const node = ethers.namehash(name);
  await attestation.attest(node, role, delegate);
}

async function revoke(name, role, delegate) {
  const node = ethers.namehash(name);
  await attestation.revoke(node, role, delegate);
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

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const lowered = value.toLowerCase();
  return lowered === 'true' || lowered === '1' || lowered === 'yes';
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function runCli() {
  const [, , command, ...rest] = process.argv;
  if (!command) {
    throw new Error('Command is required');
  }
  const args = parseCliArgs(rest);
  let result;
  switch (command) {
    case 'postJob': {
      let spec = null;
      if (args.spec) {
        spec = readJsonIfExists(args.spec);
        if (!spec) {
          throw new Error(`Spec file not found: ${args.spec}`);
        }
      }
      const overrides = {};
      if (args.amount) overrides.amount = args.amount;
      if (args.reward) overrides.amount = args.reward;
      if (args['spec-uri']) overrides.specUri = args['spec-uri'];
      if (args.deadline) overrides.deadline = Number(args.deadline);
      result = await postJob(spec ?? args.amount ?? '1', overrides);
      break;
    }
    case 'acknowledgeTaxPolicy':
      result = await acknowledgeTaxPolicy();
      break;
    case 'prepareStake':
      result = await prepareStake(args.amount ?? '1');
      break;
    case 'stake':
      result = await stake(args.amount ?? '1', { role: args.role });
      break;
    case 'submit': {
      const jobId = args.job ?? args.id;
      if (jobId === undefined) {
        throw new Error('submit requires --job <id>');
      }
      const uri = args.result ?? args.uri;
      if (!uri) {
        throw new Error('submit requires --result <uri>');
      }
      result = await submit(jobId, uri);
      break;
    }
    case 'computeValidationCommit': {
      const jobId = args.job ?? args.id;
      if (jobId === undefined) {
        throw new Error('computeValidationCommit requires --job <id>');
      }
      const approve = parseBoolean(args.approve ?? 'true');
      const options = {};
      if (args.subdomain) options.subdomain = args.subdomain;
      if (args.proof) options.proof = Array.isArray(args.proof) ? args.proof : [args.proof];
      result = await computeValidationCommit(jobId, approve, options);
      break;
    }
    case 'validate': {
      const jobId = args.job ?? args.id;
      if (jobId === undefined) {
        throw new Error('validate requires --job <id>');
      }
      const approve = parseBoolean(args.approve ?? 'true');
      if (args.commit) {
        const plan = readJsonIfExists(args.commit);
        if (!plan) {
          throw new Error(`Commit plan not found: ${args.commit}`);
        }
        result = await validate(
          jobId,
          plan.commitHash,
          approve,
          plan.salt,
          plan.burnTxHash,
        );
      } else {
        const options = {};
        if (args.subdomain) options.subdomain = args.subdomain;
        if (args.skipFinalize !== undefined) {
          options.skipFinalize = parseBoolean(args.skipFinalize);
        }
        result = await validate(jobId, approve, options);
      }
      break;
    }
    case 'acknowledge':
      result = await acknowledgeTaxPolicy();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  if (result === undefined) {
    console.log('{}');
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
