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
async function postJob(amount = '1') {
  const reward = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const specHash = ethers.id('spec');
  await registry.createJob(reward, deadline, specHash, 'ipfs://job');
}

async function stake(amount) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  await stakeManager.depositStake(0, parsed);
}

// Apply for a job using a `subdomain` label such as "alice" for
// `alice.agent.agi.eth`. Supply a Merkle `proof` if allowlists are enabled.
async function apply(jobId, subdomain, proof) {
  await registry.applyForJob(jobId, subdomain, proof);
}

async function submit(jobId, uri) {
  const hash = ethers.id(uri);
  await registry.submit(jobId, hash, uri);
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
    await commitTx.wait();

    const revealTx = await validation.revealValidation(
      jobId,
      approve,
      burnTxHash,
      salt,
      subdomain,
      proof
    );
    await revealTx.wait();

    const finalizeTx = await validation.finalize(jobId);
    await finalizeTx.wait();

    return {
      commitHash: ethers.zeroPadValue(commitOrApprove, 32),
      salt,
      burnTxHash,
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
  await commitTx.wait();

  const revealTx = await validation.revealValidation(
    jobId,
    approve,
    plan.burnTxHash,
    plan.salt,
    options.subdomain,
    proof
  );
  await revealTx.wait();

  if (!options.skipFinalize) {
    const finalizeTx = await validation.finalize(jobId);
    await finalizeTx.wait();
  }

  return plan;
}

async function dispute(jobId, evidence) {
  if (evidence.startsWith('0x') && evidence.length === 66) {
    await registry.raiseDispute(jobId, evidence);
    return;
  }
  await registry.raiseDispute(jobId, evidence);
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
  stake,
  apply,
  submit,
  validate,
  dispute,
  attest,
  revoke,
  computeValidationCommit,
};
